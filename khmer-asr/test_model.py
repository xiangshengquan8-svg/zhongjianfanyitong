"""
测试高棉语语音识别模型
用法：python test_model.py
"""

import torch
import numpy as np
from transformers import WhisperProcessor, WhisperForConditionalGeneration
import sounddevice as sd
from scipy.io.wavfile import write
import tempfile
import os

def record_audio(duration=5, sample_rate=16000):
    """录音"""
    print(f"\n开始录音（{duration}秒）...")
    print("请说高棉语...")
    
    # 录音
    audio = sd.rec(int(duration * sample_rate), 
                   samplerate=sample_rate, 
                   channels=1, 
                   dtype=np.float32)
    sd.wait()
    print("录音完成！")
    
    return audio.flatten(), sample_rate

def transcribe_audio(audio, sample_rate, model, processor, device):
    """识别语音"""
    # 处理音频
    inputs = processor(audio, 
                       sampling_rate=sample_rate, 
                       return_tensors="pt")
    input_features = inputs.input_features.to(device)
    
    # 生成
    with torch.no_grad():
        predicted_ids = model.generate(input_features)
    
    # 解码
    transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)
    
    return transcription[0]

def main():
    print("=" * 60)
    print("高棉语语音识别模型测试")
    print("=" * 60)
    
    # 检查 CUDA
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n使用设备: {device}")
    
    # 加载模型
    model_path = "./khmer-whisper-full-finetuned"
    print(f"\n加载模型: {model_path}")
    
    processor = WhisperProcessor.from_pretrained(model_path)
    model = WhisperForConditionalGeneration.from_pretrained(model_path)
    model.to(device)
    model.eval()
    
    print("模型加载完成！")
    
    # 测试循环
    while True:
        print("\n" + "-" * 40)
        print("选择操作：")
        print("1. 录音测试（5秒）")
        print("2. 录音测试（10秒）")
        print("3. 退出")
        
        choice = input("\n请输入选项 (1/2/3): ").strip()
        
        if choice == "1":
            duration = 5
        elif choice == "2":
            duration = 10
        elif choice == "3":
            print("再见！")
            break
        else:
            print("无效选项，请重新输入")
            continue
        
        # 录音
        audio, sample_rate = record_audio(duration)
        
        # 识别
        print("\n正在识别...")
        transcription = transcribe_audio(audio, sample_rate, model, processor, device)
        
        # 显示结果
        print("\n" + "=" * 40)
        print("识别结果：")
        print(transcription)
        print("=" * 40)

if __name__ == "__main__":
    main()
