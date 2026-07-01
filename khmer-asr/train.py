"""
高棉语语音识别模型训练脚本
使用 Whisper-small 模型进行微调
"""

import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["DATASETS_FEATURES_AUDIO_BACKEND"] = "soundfile"

def main():
    from datasets import load_from_disk
    from transformers import (
        WhisperProcessor,
        WhisperForConditionalGeneration,
        Seq2SeqTrainingArguments,
        Seq2SeqTrainer,
    )
    from transformers.models.whisper.english_normalizer import BasicTextNormalizer
    import torch
    import numpy as np
    import soundfile as sf
    import io
    from dataclasses import dataclass
    from typing import Any, Dict, List, Union

    print("=" * 50)
    print("高棉语语音识别模型训练")
    print("=" * 50)

    # 检查 CUDA
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

    # 加载完整数据集（禁用自动音频解码）
    print("\nLoading full dataset...")
    dataset_dict = load_from_disk("./fleurs_km_full")
    print(f"Dataset loaded: {dataset_dict}")
    
    # 获取训练集和验证集
    if hasattr(dataset_dict, 'keys'):
        train_dataset = dataset_dict.get('train', dataset_dict)
        eval_dataset = dataset_dict.get('validation', None)
    else:
        train_dataset = dataset_dict
        eval_dataset = None
    
    print(f"Train samples: {len(train_dataset)}")
    if eval_dataset:
        print(f"Eval samples: {len(eval_dataset)}")
    
    # 加载处理器和模型
    print("\nLoading Whisper model...")
    model_name = "openai/whisper-small"
    processor = WhisperProcessor.from_pretrained(model_name, language="Khmer", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(model_name)

    # 配置模型
    model.config.forced_decoder_ids = None
    model.config.suppress_tokens = [-1]

    # 自定义数据整理器
    @dataclass
    class DataCollatorSpeechSeq2SeqWithPadding:
        processor: Any
        
        def __call__(self, features: List[Dict[str, Union[List[int], torch.Tensor]]]) -> Dict[str, torch.Tensor]:
            # 分离 input_features 和 labels
            input_features = [{"input_features": feature["input_features"]} for feature in features]
            label_features = [{"input_ids": feature["labels"]} for feature in features]
            
            # 对 input_features 进行 padding
            batch = self.processor.feature_extractor.pad(
                input_features, 
                return_tensors="pt"
            )
            
            # 对 labels 进行 padding
            labels_batch = self.processor.tokenizer.pad(
                label_features, 
                return_tensors="pt"
            )
            
            # 获取 labels
            labels = labels_batch["input_ids"].masked_fill(
                labels_batch.attention_mask.ne(1), 
                -100
            )
            
            # 如果第一个 token 是 BOS，移除它
            if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
                labels = labels[:, 1:]
            
            batch["labels"] = labels
            return batch

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
            labels = processor.tokenizer(text).input_ids
            # 截断过长的标签（Whisper 最大 448）
            if len(labels) > 448:
                labels = labels[:448]
            batch["labels"] = labels
            return batch
        except Exception as e:
            print(f"Error processing sample: {e}")
            # 返回空特征
            batch["input_features"] = np.zeros((80, 3000), dtype=np.float32)
            text = batch.get("transcription", batch.get("text", ""))
            labels = processor.tokenizer(text).input_ids
            if len(labels) > 448:
                labels = labels[:448]
            batch["labels"] = labels
            return batch

    print("\nPreprocessing training dataset...")

    # 使用完整数据集进行训练
    print(f"Using {len(train_dataset)} samples for training")

    # 不使用多进程，避免 Windows 问题
    processed_train = train_dataset.map(prepare_dataset, num_proc=1)
    print("Training dataset preprocessed!")

    # 过滤掉标签过长的样本
    def filter_labels(example):
        return len(example["labels"]) <= 448
    
    processed_train = processed_train.filter(filter_labels)
    print(f"After filtering long labels: {len(processed_train)} samples")

    # 只保留需要的列
    processed_train = processed_train.remove_columns([
        col for col in processed_train.column_names 
        if col not in ["input_features", "labels"]
    ])
    print(f"Final train columns: {processed_train.column_names}")
    
    # 处理验证集
    processed_eval = None
    if eval_dataset:
        print("\nPreprocessing eval dataset...")
        processed_eval = eval_dataset.map(prepare_dataset, num_proc=1)
        processed_eval = processed_eval.filter(filter_labels)
        processed_eval = processed_eval.remove_columns([
            col for col in processed_eval.column_names 
            if col not in ["input_features", "labels"]
        ])
        print(f"Eval dataset preprocessed: {len(processed_eval)} samples")

    # 数据整理器
    data_collator = DataCollatorSpeechSeq2SeqWithPadding(processor=processor)

    # 训练参数（正式训练）
    training_args = Seq2SeqTrainingArguments(
        output_dir="./khmer-whisper-full",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=1e-5,
        warmup_steps=100,
        max_steps=3000,  # 正式训练 3000 步
        gradient_checkpointing=True,
        fp16=True,
        eval_strategy="steps" if processed_eval else "no",
        eval_steps=500 if processed_eval else None,
        save_strategy="steps",
        save_steps=500,
        logging_steps=50,
        remove_unused_columns=False,
        report_to="none",
        load_best_model_at_end=True if processed_eval else False,
        metric_for_best_model="loss" if processed_eval else None,
        greater_is_better=False if processed_eval else None,
    )

    # 创建训练器
    trainer = Seq2SeqTrainer(
        args=training_args,
        model=model,
        train_dataset=processed_train,
        eval_dataset=processed_eval,
        data_collator=data_collator,
        processing_class=processor,
    )

    # 开始训练
    print("\n" + "=" * 50)
    print("开始正式训练（3000 步）...")
    print("预计时间：10-20 小时")
    print("=" * 50)
    
    trainer.train()

    # 保存模型
    print("\n保存模型...")
    model.save_pretrained("./khmer-whisper-full-finetuned")
    processor.save_pretrained("./khmer-whisper-full-finetuned")

    print("\n" + "=" * 50)
    print("训练完成！")
    print("模型保存在: ./khmer-whisper-full-finetuned")
    print("=" * 50)

if __name__ == "__main__":
    main()
