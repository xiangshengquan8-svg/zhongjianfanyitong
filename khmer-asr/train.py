"""
高棉语语音识别模型训练脚本
使用 Whisper-small 模型进行微调
"""

import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

def main():
    from datasets import load_from_disk, Audio
    from transformers import (
        WhisperProcessor,
        WhisperForConditionalGeneration,
        Seq2SeqTrainingArguments,
        Seq2SeqTrainer,
        DataCollatorForSeq2Seq,
    )
    import torch
    import evaluate

    print("=" * 50)
    print("高棉语语音识别模型训练")
    print("=" * 50)

    # 检查 CUDA
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

    # 加载数据集
    print("\nLoading dataset...")
    dataset = load_from_disk("./fleurs_km_small")
    print(f"Dataset size: {len(dataset)} samples")

    # 加载处理器和模型
    print("\nLoading Whisper model...")
    model_name = "openai/whisper-small"
    processor = WhisperProcessor.from_pretrained(model_name, language="khmer", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(model_name)

    # 配置模型
    model.config.forced_decoder_ids = None
    model.config.suppress_tokens = [-1]

    # 数据预处理
    def prepare_dataset(batch):
        audio = batch["audio"]
        batch["input_features"] = processor.feature_extractor(
            audio["array"], 
            sampling_rate=audio["sampling_rate"]
        ).input_features[0]
        
        # 获取标签
        if "transcription" in batch:
            text = batch["transcription"]
        elif "text" in batch:
            text = batch["text"]
        else:
            text = ""
        
        batch["labels"] = processor.tokenizer(text).input_ids
        return batch

    print("\nPreprocessing dataset...")
    dataset = dataset.cast_column("audio", Audio(sampling_rate=16000))

    # 取前 50 条进行快速训练测试
    if len(dataset) > 50:
        dataset = dataset.select(range(50))
        print(f"Using {len(dataset)} samples for training")

    # 不使用多进程，避免 Windows 问题
    processed_dataset = dataset.map(prepare_dataset, num_proc=1)

    # 数据整理器
    data_collator = DataCollatorForSeq2Seq(
        processor.tokenizer,
        model=model,
        padding=True
    )

    # 评估指标
    metric = evaluate.load("wer")

    def compute_metrics(pred):
        pred_ids = pred.predictions
        label_ids = pred.label_ids
        
        label_ids[label_ids == -100] = processor.tokenizer.pad_token_id
        
        pred_str = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
        label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)
        
        wer = metric.compute(predictions=pred_str, references=label_str)
        return {"wer": wer}

    # 训练参数
    print("\nSetting up training...")
    training_args = Seq2SeqTrainingArguments(
        output_dir="./khmer-whisper-model",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=1e-5,
        warmup_steps=10,
        max_steps=50,  # 快速测试，正式训练可改为 500-1000
        gradient_checkpointing=True,
        fp16=True,
        evaluation_strategy="steps",
        eval_steps=25,
        save_steps=25,
        logging_steps=5,
        save_total_limit=2,
        report_to="none",
        dataloader_num_workers=0,
    )

    # 创建训练器
    trainer = Seq2SeqTrainer(
        args=training_args,
        model=model,
        train_dataset=processed_dataset,
        eval_dataset=processed_dataset,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        processing_class=processor.feature_extractor,
    )

    # 开始训练
    print("\n" + "=" * 50)
    print("开始训练...")
    print("=" * 50)

    trainer.train()

    # 保存模型
    print("\nSaving model...")
    trainer.save_model("./khmer-whisper-final")
    processor.save_pretrained("./khmer-whisper-final")

    print("\n" + "=" * 50)
    print("训练完成！")
    print(f"模型保存在: ./khmer-whisper-final")
    print("=" * 50)


if __name__ == "__main__":
    main()
