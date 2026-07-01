import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import NetInfo from '@react-native-community/netinfo';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useI18n } from '@/i18n/I18nContext';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { createFormDataFile } from '@/utils';
import * as FileSystem from 'expo-file-system/legacy';
import { translateText, speakOffline, stopSpeaking, checkNetworkConnection } from '@/utils/translation-service';
import { translateOffline } from '@/utils/offline-dictionary';
import Voice from '@react-native-voice/voice';

const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1`;

type Lang = 'zh' | 'km';

// Language code mapping for Voice
const VOICE_LANG_MAP: Record<Lang, string> = {
  zh: 'zh-CN',
  km: 'km-KH',
};

export default function TranslateScreen() {
  const { t, language, setLanguage, locale } = useI18n();

  const [sourceLang, setSourceLang] = useState<Lang>('zh');
  const [targetLang, setTargetLang] = useState<Lang>('km');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [textInput, setTextInput] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [lastTranslationOffline, setLastTranslationOffline] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Network status detection
  useEffect(() => {
    const checkNetwork = async () => {
      const netState = await NetInfo.fetch();
      setIsOffline(!netState.isConnected || !netState.isInternetReachable);
    };
    checkNetwork();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected || !state.isInternetReachable);
    });

    return () => unsubscribe();
  }, []);

  // Initialize Voice
  useEffect(() => {
    const initVoice = async () => {
      try {
        Voice.onSpeechStart = onSpeechStart;
        Voice.onSpeechEnd = onSpeechEnd;
        Voice.onSpeechResults = onSpeechResults;
        Voice.onSpeechError = onSpeechError;
        
        const isAvailable = await Voice.isAvailable();
        setVoiceSupported(isAvailable);
      } catch (e) {
        console.log('Voice initialization error:', e);
        setVoiceSupported(false);
      }
    };
    initVoice();

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const onSpeechStart = useCallback(() => {
    console.log('Speech started');
  }, []);

  const onSpeechEnd = useCallback(() => {
    console.log('Speech ended');
    setIsRecording(false);
  }, []);

  const onSpeechResults = useCallback(async (e: any) => {
    if (e.value && e.value.length > 0) {
      const recognizedText = e.value[0];
      setSourceText(recognizedText);
      setIsRecording(false);
      
      // Auto translate after recognition
      await handleTranslate(recognizedText);
    }
  }, [sourceLang, targetLang, isOffline]);

  const onSpeechError = useCallback((e: any) => {
    console.log('Speech error:', e);
    setIsRecording(false);
    
    // If voice recognition fails, suggest text input
    if (isOffline) {
      Alert.alert(
        t('translate') || '翻译',
        '离线语音识别不可用，请使用文字输入',
        [{ text: '确定', onPress: () => setInputMode('text') }]
      );
    } else {
      Alert.alert(
        t('translate') || '翻译',
        '语音识别失败，请重试或使用文字输入',
        [{ text: '确定' }]
      );
    }
  }, [isOffline, t]);

  // Pulse animation for recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => { /* ignore cleanup errors */ });
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => { /* ignore cleanup errors */ });
      }
      Voice.destroy().catch(() => {});
    };
  }, []);

  // Start voice recognition
  const startVoiceRecognition = async () => {
    try {
      setSourceText('');
      setTranslatedText('');
      setAudioUrl('');
      setIsRecording(true);
      
      const langCode = VOICE_LANG_MAP[sourceLang];
      await Voice.start(langCode);
    } catch (error) {
      console.error('Start voice error:', error);
      setIsRecording(false);
      Alert.alert(
        t('translate') || '翻译',
        '语音识别启动失败，请重试或使用文字输入',
        [{ text: '确定', onPress: () => setInputMode('text') }]
      );
    }
  };

  // Stop voice recognition
  const stopVoiceRecognition = async () => {
    try {
      await Voice.stop();
      setIsRecording(false);
    } catch (error) {
      console.error('Stop voice error:', error);
      setIsRecording(false);
    }
  };

  // Handle translate
  const handleTranslate = async (text?: string) => {
    const textToTranslate = text || (inputMode === 'voice' ? sourceText : textInput);
    if (!textToTranslate.trim()) {
      Alert.alert(t('translate') || '翻译', t('inputContent') || '请输入内容');
      return;
    }

    setIsTranslating(true);
    setAudioUrl('');

    try {
      // Check network
      const hasNetwork = await checkNetworkConnection();
      
      if (!hasNetwork) {
        // Offline translation
        const result = translateOffline(textToTranslate, sourceLang, targetLang);
        setTranslatedText(result.translated);
        setLastTranslationOffline(true);
        
        if (!result.found) {
          Alert.alert(
            t('translate') || '翻译',
            '离线词典暂无此翻译，请连接网络使用完整功能',
            [{ text: '确定' }]
          );
        }
      } else {
        // Online translation
        setLastTranslationOffline(false);
        const result = await translateText(textToTranslate, sourceLang, targetLang);
        setTranslatedText(result.translatedText);
        setAudioUrl(result.audioUrl);
      }
    } catch (error) {
      console.error('Translation error:', error);
      Alert.alert(t('translate') || '翻译', '翻译失败，请重试');
    } finally {
      setIsTranslating(false);
    }
  };

  // Play audio
  const handlePlayAudio = async () => {
    if (isPlaying) {
      await stopSpeaking();
      setIsPlaying(false);
      return;
    }

    try {
      setIsPlaying(true);
      await speakOffline(translatedText, targetLang);
    } catch (error) {
      console.error('Play audio error:', error);
    } finally {
      setIsPlaying(false);
    }
  };

  // Swap languages
  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 30 }}>
            <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1E293B' }}>
              {t('appTitle')}
            </Text>
            <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8 }}>
              {t('appSubtitle')}
            </Text>
          </View>

          {/* Language Selector */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1E293B' }}>
                {sourceLang === 'zh' ? '中文' : '高棉文'}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {sourceLang === 'zh' ? 'Chinese' : 'Khmer'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleSwapLanguages}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#EEF2FF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FontAwesome6 name="exchange-alt" size={18} color="#5B6AF7" />
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1E293B' }}>
                {targetLang === 'zh' ? '中文' : '高棉文'}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {targetLang === 'zh' ? 'Chinese' : 'Khmer'}
              </Text>
            </View>
          </View>

          {/* Input Mode Selector */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24, gap: 12 }}>
            <TouchableOpacity
              onPress={() => setInputMode('voice')}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: inputMode === 'voice' ? '#5B6AF7' : '#F1F5F9',
              }}
            >
              <Text style={{ color: inputMode === 'voice' ? '#FFFFFF' : '#64748B', fontWeight: '600' }}>
                语音输入 / បញ្ចូលសំឡេង
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setInputMode('text')}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: inputMode === 'text' ? '#10B981' : '#F1F5F9',
              }}
            >
              <Text style={{ color: inputMode === 'text' ? '#FFFFFF' : '#64748B', fontWeight: '600' }}>
                文字输入 / បញ្ចូលអក្សរ
              </Text>
            </TouchableOpacity>
          </View>

          {/* Input Area */}
          {inputMode === 'voice' ? (
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              {/* Voice Recording Button */}
              <TouchableOpacity
                onPress={isRecording ? stopVoiceRecognition : startVoiceRecognition}
                disabled={isTranslating}
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  backgroundColor: isRecording ? '#EF4444' : '#5B6AF7',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: isRecording ? '#EF4444' : '#5B6AF7',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                  transform: [{ scale: pulseAnim }],
                }}
              >
                <FontAwesome6
                  name={isRecording ? 'stop' : 'microphone'}
                  size={36}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
              <Text style={{ marginTop: 16, fontSize: 14, color: '#64748B' }}>
                {isRecording ? '点击停止 / ចុចដើម្បីបញ្ឈប់' : '点击开始录音 / ចុចដើម្បីថត'}
              </Text>
              
              {!voiceSupported && (
                <Text style={{ marginTop: 8, fontSize: 12, color: '#EF4444', textAlign: 'center' }}>
                  语音识别不可用，请使用文字输入
                </Text>
              )}
            </View>
          ) : (
            <View style={{ marginBottom: 24 }}>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 16,
                  minHeight: 100,
                  textAlignVertical: 'top',
                  backgroundColor: '#FFFFFF',
                }}
                placeholder={t('inputPlaceholder') || '请输入要翻译的内容...'}
                value={textInput}
                onChangeText={setTextInput}
                multiline
              />
            </View>
          )}

          {/* Source Text Display (for voice mode) */}
          {inputMode === 'voice' && sourceText ? (
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
                {sourceLang === 'zh' ? '识别结果' : 'លទ្ធផលស្គាល់'}
              </Text>
              <Text style={{ fontSize: 16, color: '#1E293B' }}>{sourceText}</Text>
            </View>
          ) : null}

          {/* Translate Button (for text mode) */}
          {inputMode === 'text' && (
            <TouchableOpacity
              onPress={() => handleTranslate()}
              disabled={isTranslating}
              style={{
                backgroundColor: '#10B981',
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
                marginBottom: 24,
                opacity: isTranslating ? 0.7 : 1,
              }}
            >
              {isTranslating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>
                  {t('translate') || '翻译'} / បកប្រែ
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Translation Result */}
          {translatedText ? (
            <View style={{ backgroundColor: '#EEF2FF', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: '#5B6AF7', fontWeight: '600' }}>
                  {targetLang === 'zh' ? '翻译结果' : 'លទ្ធផលបកប្រែ'}
                </Text>
                {lastTranslationOffline && (
                  <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, color: '#92400E' }}>离线</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 18, color: '#1E293B', lineHeight: 28 }}>
                {translatedText}
              </Text>
              
              {/* Play Button */}
              <TouchableOpacity
                onPress={handlePlayAudio}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 16,
                  backgroundColor: '#5B6AF7',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  alignSelf: 'flex-start',
                }}
              >
                <FontAwesome6 name={isPlaying ? 'stop' : 'volume-up'} size={16} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', marginLeft: 8, fontWeight: '600' }}>
                  {isPlaying ? '停止' : '朗读'} / {isPlaying ? 'បញ្ឈប់' : 'អាន'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Network Status */}
          {isOffline && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12, marginTop: 16 }}>
              <Text style={{ fontSize: 12, color: '#92400E', textAlign: 'center' }}>
                当前处于离线模式，仅支持常用短语翻译
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = {
  // Styles are now inline
};
