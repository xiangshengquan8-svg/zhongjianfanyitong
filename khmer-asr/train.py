"""
高棉语语音识别模型训练脚本
使用 Whisper-small 模型进行微调
"""

import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["DATASETS_FEATURES_AUDIO_BACKEND"] = "soundfile"

def main():
    from datasets import load_from_disk, Dataset
    from transformers import (
        WhisperProcessor,
        WhisperForConditionalGeneration,
        Seq2SeqTrainingArguments,
        Seq2SeqTrainer,
        DataCollatorForSeq2Seq,
    )
    import torch
    import evaluate
    import numpy as np
    import soundfile as sf
    import io

    print("=" * 50)
    print("高棉语语音识别模型训练")
    print("=" * 50)

    # 检查 CUDA
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

    # 加载数据集（禁用自动音频解码）
    print("\nLoading dataset...")
    dataset = load_from_disk("./fleurs_km_nodecode")
    print(f"Dataset size: {len(dataset)} samples")
    print(f"Dataset features: {dataset.features}")
    
    # 检查数据集列
    print(f"Columns: {dataset.column_names}")
    
    # 查看第一个样本的结构
    first_item = dataset[0]
    print(f"First sample keys: {first_item.keys()}")
    if 'audio' in first_item:
        print(f"Audio type: {type(first_item['audio'])}")
        if isinstance(first_item['audio'], dict):
            print(f"Audio keys: {first_item['audio'].keys()}")

    # 加载处理器和模型
    print("\nLoading Whisper model...")
    model_name = "openai/whisper-small"
    processor = WhisperProcessor.from_pretrained(model_name, language="Khmer", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(model_name)

    # 配置模型
    model.config.forced_decoder_ids = None
    model.config.suppress_tokens = [-1]

    # 数据预处理 - 手动处理音频
    def prepare_dataset(batch):
        try:
            # 获取音频数据
            audio_data = batch.get("audio", {})
            
            # 尝试获取音频字节或路径
            if isinstance(audio_data, dict):
                audio_bytes = audio_data.get("bytes")
                audio_path = audio_data.get("path")
            else:
                audio_bytes = None
                audio_path = None
            
            # 加载音频
            if audio_bytes:
                audio_array, sampling_rate = sf.read(io.BytesIO(audio_bytes))
            elif audio_path:
                audio_array, sampling_rate = sf.read(audio_path)
            else:
                # 如果没有音频数据，创建空的特征
                batch["input_features"] = np.zeros((80, 3000), dtype=np.float32)
                text = batch.get("transcription", batch.get("text", ""))
                batch["labels"] = processor.tokenizer(text).input_ids
                return batch
            
            # 转换为单声道
            if len(audio_array.shape) > 1:
                audio_array = np.mean(audio_array, axis=1)
            
            # 重采样到 16000 Hz
            if sampling_rate != 16000:
                import librosa
                audio_array = librosa.resample(audio_array, orig_sr=sampling_rate, target_sr=16000)
                sampling_rate = 16000
            
            # 提取特征
            batch["input_features"] = processor.feature_extractor(
                audio_array, 
                sampling_rate=sampling_rate
            ).input_features[0]
            
            # 获取文本标签
            text = batch.get("transcription", batch.get("text", ""))
            batch["labels"] = processor.tokenizer(text).input_ids
            return batch
        except Exception as e:
            print(f"Error processing sample: {e}")
            # 返回空特征
            batch["input_features"] = np.zeros((80, 3000), dtype=np.float32)
            text = batch.get("transcription", batch.get("text", ""))
            batch["labels"] = processor.tokenizer(text).input_ids
            return batch

    print("\nPreprocessing dataset...")

    # 取前 30 条进行快速训练测试
    if len(dataset) > 30:
        dataset = dataset.select(range(30))
    print(f"Using {len(dataset)} samples for training")

    # 不使用多进程，避免 Windows 问题
    processed_dataset = dataset.map(prepare_dataset, num_proc=1)
    print("Dataset preprocessed!")

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

        # 替换 -100 为 pad token id
        label_ids[label_ids == -100] = processor.tokenizer.pad_token_id

        pred_str = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
        label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)

        wer = metric.compute(predictions=pred_str, references=label_str)
        return {"wer": wer}

    # 训练参数
    training_args = Seq2SeqTrainingArguments(
        output_dir="./khmer-whisper-small",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=1e-5,
        warmup_steps=10,
        max_steps=50,  # 快速测试
        gradient_checkpointing=True,
        fp16=True,
        eval_strategy="no",
        save_strategy="steps",
        save_steps=25,
        logging_steps=5,
        remove_unused_columns=False,
        report_to="none",
        load_best_model_at_end=False,
    )

    # 移除不需要的列
    print("移除不需要的列...")
    processed_dataset = processed_dataset.remove_columns(["audio", "transcription"])
    print(f"最终数据集列: {processed_dataset.column_names}")
    
    # 创建训练器
    trainer = Seq2SeqTrainer(
        args=training_args,
        model=model,
        train_dataset=processed_dataset,
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
    print("\n保存模型...")
    model.save_pretrained("./khmer-whisper-small-finetuned")
    processor.save_pretrained("./khmer-whisper-small-finetuned")

    print("\n" + "=" * 50)
    print("训练完成！")
    print("模型保存在: ./khmer-whisper-small-finetuned")
    print("=" * 50)


if __name__ == "__main__":
    main()
