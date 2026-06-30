/**
 * 翻译服务 - 支持在线和离线模式
 */

import NetInfo from '@react-native-community/netinfo';
import { translateOffline } from './offline-dictionary';
import * as Speech from 'expo-speech';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

type Scene = 'daily' | 'business' | 'travel';

/**
 * 检查网络连接
 */
export async function checkNetworkConnection(): Promise<boolean> {
  const netState = await NetInfo.fetch();
  return netState.isConnected === true && netState.isInternetReachable === true;
}

/**
 * 翻译结果类型
 */
export interface TranslationResult {
  translatedText: string;
  audioUrl?: string | null;
  isOffline: boolean;
}

/**
 * 翻译文本
 * 在线时使用后端 API，离线时使用本地词典
 */
export async function translateText(
  text: string,
  sourceLang: 'zh' | 'km',
  targetLang: 'zh' | 'km',
  voiceGender: 'male' | 'female' = 'female',
  scene: Scene = 'daily'
): Promise<TranslationResult> {
  // 检查网络
  const isOnline = await checkNetworkConnection();

  if (!isOnline) {
    // 离线模式 - 使用本地词典
    const offlineResult = translateOffline(text, sourceLang, targetLang);
    if (offlineResult) {
      return {
        translatedText: offlineResult,
        audioUrl: null, // 离线模式不支持 TTS
        isOffline: true,
      };
    }
    // 离线词典没有匹配，返回原文并提示
    return {
      translatedText: `[离线模式] 无法翻译: ${text}`,
      audioUrl: null,
      isOffline: true,
    };
  }

  // 在线模式 - 使用后端 API
  try {
    const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        sourceLang,
        targetLang,
        voiceGender,
        scene,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      translatedText: data.translatedText,
      audioUrl: data.audioUrl,
      isOffline: false,
    };
  } catch (error) {
    // API 失败时尝试离线翻译
    const offlineResult = translateOffline(text, sourceLang, targetLang);
    if (offlineResult) {
      return {
        translatedText: offlineResult,
        audioUrl: null,
        isOffline: true,
      };
    }
    throw error;
  }
}

/**
 * 离线 TTS - 使用设备原生语音合成
 * 支持的语言取决于设备系统
 */
export function speakOffline(text: string, language: 'zh' | 'km' = 'zh'): void {
  // 语言代码映射
  const languageCode = language === 'zh' ? 'zh-CN' : 'km-KH';

  Speech.speak(text, {
    language: languageCode,
    pitch: 1.0,
    rate: 0.9,
  });
}

/**
 * 停止语音播放
 */
export function stopSpeaking(): void {
  Speech.stop();
}

/**
 * 检查设备是否支持指定语言的 TTS
 */
export async function checkTTSSupport(language: 'zh' | 'km'): Promise<boolean> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const languageCode = language === 'zh' ? 'zh' : 'km';
    return voices.some((voice) => voice.language.startsWith(languageCode));
  } catch {
    return false;
  }
}
