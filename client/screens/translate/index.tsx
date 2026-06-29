import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { createFormDataFile } from '@/utils';
import * as FileSystem from 'expo-file-system/legacy';

const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1`;

type Lang = 'zh' | 'km';

export default function TranslateScreen() {
  const router = useSafeRouter();
  const { user, isAuthenticated, isLoading: authLoading, signOut } = useAuth();

  const [sourceLang, setSourceLang] = useState<Lang>('zh');
  const [targetLang, setTargetLang] = useState<Lang>('km');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [historyId, setHistoryId] = useState<number | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Auth check
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated]);

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
    };
  }, []);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const supabase = await getSupabaseBrowserClientWithRetry();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return {};
    }
    return { 'x-session': session.access_token };
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('权限不足', '请允许麦克风权限以使用语音翻译功能');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setSourceText('');
      setTranslatedText('');
      setAudioUrl('');
      setHistoryId(null);
    } catch (err) {
      console.error('Start recording error:', err);
      Alert.alert('错误', '启动录音失败');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      if (!uri) {
        Alert.alert('错误', '录音文件获取失败');
        return;
      }

      // Step 1: Upload audio for ASR
      setIsTranslating(true);
      const headers = await getAuthHeaders();
      if (!headers['x-session']) return;

      const formData = new FormData();
      const fileObj = await createFormDataFile(uri, 'recording.m4a', 'audio/m4a');
      formData.append('file', fileObj as any);

      const asrResponse = await fetch(`${API_BASE}/translate/asr`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (asrResponse.status === 401) {
        router.replace('/login');
        return;
      }

      if (!asrResponse.ok) {
        const errorData = await asrResponse.json();
        Alert.alert('识别失败', errorData.error || '语音识别失败');
        setIsTranslating(false);
        return;
      }

      const asrData = await asrResponse.json();
      setSourceText(asrData.text);

      // Step 2: Translate
      const translateResponse = await fetch(`${API_BASE}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          text: asrData.text,
          sourceLang,
          targetLang,
          voiceGender,
        }),
      });

      if (!translateResponse.ok) {
        const errorData = await translateResponse.json();
        Alert.alert('翻译失败', errorData.error || '翻译失败');
        setIsTranslating(false);
        return;
      }

      const translateData = await translateResponse.json();
      setTranslatedText(translateData.translatedText);
      setAudioUrl(translateData.audioUrl || '');
      setHistoryId(translateData.historyId || null);
    } catch (err) {
      console.error('Stop recording error:', err);
      Alert.alert('错误', '处理录音失败');
    } finally {
      setIsTranslating(false);
      recordingRef.current = null;
    }
  };

  const playTranslation = async () => {
    if (!audioUrl) return;

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const soundPath = (FileSystem as any).cacheDirectory + 'translation.mp3';
      await (FileSystem as any).downloadAsync(audioUrl, soundPath);

      const { sound } = await Audio.Sound.createAsync(
        { uri: soundPath },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        }
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      console.error('Play error:', err);
      Alert.alert('播放失败', '无法播放翻译语音');
    }
  };

  const stopPlaying = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      setIsPlaying(false);
    }
  };

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  };

  if (authLoading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5B6AF7" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>语音翻译通</Text>
            <Text style={styles.headerSubtitle}>中文 · 高棉语</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={() => router.push('/history')}
              activeOpacity={0.7}
            >
              <FontAwesome6 name="clock-rotate-left" size={18} color="#5B6AF7" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={async () => {
                await signOut();
                router.replace('/login');
              }}
              activeOpacity={0.7}
            >
              <FontAwesome6 name="right-from-bracket" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Language Selector */}
        <View style={styles.langSelector}>
          <TouchableOpacity
            style={[styles.langButton, sourceLang === 'zh' && styles.langButtonActive]}
            onPress={() => { setSourceLang('zh'); setTargetLang('km'); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.langButtonText, sourceLang === 'zh' && styles.langButtonTextActive]}>
              中文
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.swapButton} onPress={swapLanguages} activeOpacity={0.7}>
            <FontAwesome6 name="right-left" size={16} color="#5B6AF7" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.langButton, sourceLang === 'km' && styles.langButtonActive]}
            onPress={() => { setSourceLang('km'); setTargetLang('zh'); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.langButtonText, sourceLang === 'km' && styles.langButtonTextActive]}>
              高棉语
            </Text>
          </TouchableOpacity>
        </View>

        {/* Voice Gender Selector */}
        <View style={styles.genderSelector}>
          <Text style={styles.genderLabel}>语音音色：</Text>
          <TouchableOpacity
            style={[styles.genderButton, voiceGender === 'female' && styles.genderButtonActive]}
            onPress={() => setVoiceGender('female')}
            activeOpacity={0.7}
          >
            <FontAwesome6 name="venus" size={12} color={voiceGender === 'female' ? '#FFFFFF' : '#5B6AF7'} />
            <Text style={[styles.genderButtonText, voiceGender === 'female' && styles.genderButtonTextActive]}>
              女声
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.genderButton, voiceGender === 'male' && styles.genderButtonActive]}
            onPress={() => setVoiceGender('male')}
            activeOpacity={0.7}
          >
            <FontAwesome6 name="mars" size={12} color={voiceGender === 'male' ? '#FFFFFF' : '#5B6AF7'} />
            <Text style={[styles.genderButtonText, voiceGender === 'male' && styles.genderButtonTextActive]}>
              男声
            </Text>
          </TouchableOpacity>
        </View>

        {/* Translation Results */}
        <ScrollView style={styles.resultArea} showsVerticalScrollIndicator={false}>
          {/* Source Text Card */}
          {sourceText ? (
            <View style={styles.resultCard}>
              <View style={styles.resultCardHeader}>
                <View style={[styles.langTag, { backgroundColor: '#E8604C20' }]}>
                  <Text style={[styles.langTagText, { color: '#E8604C' }]}>
                    {sourceLang === 'zh' ? '中文' : '高棉语'}
                  </Text>
                </View>
                <Text style={styles.resultLabel}>原文</Text>
              </View>
              <Text style={styles.resultText}>{sourceText}</Text>
            </View>
          ) : null}

          {/* Translated Text Card */}
          {translatedText ? (
            <View style={[styles.resultCard, styles.translatedCard]}>
              <View style={styles.resultCardHeader}>
                <View style={[styles.langTag, { backgroundColor: '#5B6AF720' }]}>
                  <Text style={[styles.langTagText, { color: '#5B6AF7' }]}>
                    {targetLang === 'zh' ? '中文' : '高棉语'}
                  </Text>
                </View>
                <Text style={styles.resultLabel}>译文</Text>
              </View>
              <Text style={styles.resultText}>{translatedText}</Text>

              {/* Play Button */}
              {audioUrl ? (
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={isPlaying ? stopPlaying : playTranslation}
                  activeOpacity={0.7}
                >
                  <FontAwesome6
                    name={isPlaying ? 'stop' : 'volume-high'}
                    size={16}
                    color="#5B6AF7"
                  />
                  <Text style={styles.playButtonText}>
                    {isPlaying ? '停止播放' : '播放翻译'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.ttsHint}>
                  <Text style={styles.ttsHintText}>
                    {targetLang === 'km' ? '高棉语暂不支持语音播放' : ''}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Loading State */}
          {isTranslating && (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color="#5B6AF7" />
              <Text style={styles.loadingText}>
                {sourceText ? '正在翻译...' : '正在识别语音...'}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Record Button */}
        <View style={styles.recordSection}>
          <Animated.View style={{
            transform: [{ scale: pulseAnim }],
          }}>
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
              activeOpacity={0.8}
              disabled={isTranslating}
            >
              <FontAwesome6
                name={isRecording ? 'stop' : 'microphone'}
                size={28}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.recordHint}>
            {isRecording ? '点击停止录音' : isTranslating ? '处理中...' : '点击开始录音翻译'}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = {
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerLeft: {},
  headerTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#1E293B',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  historyButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#5B6AF710',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  logoutButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F0F0F5',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  langSelector: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 6,
    marginBottom: 12,
    shadowColor: '#5B6AF7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  langButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center' as const,
  },
  langButtonActive: {
    backgroundColor: '#5B6AF7',
  },
  langButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#64748B',
  },
  langButtonTextActive: {
    color: '#FFFFFF',
  },
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5B6AF710',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginHorizontal: 8,
  },
  genderSelector: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
    gap: 8,
  },
  genderLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  genderButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#5B6AF710',
  },
  genderButtonActive: {
    backgroundColor: '#5B6AF7',
  },
  genderButtonText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: '#5B6AF7',
  },
  genderButtonTextActive: {
    color: '#FFFFFF',
  },
  resultArea: {
    flex: 1,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  translatedCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#5B6AF7',
  },
  resultCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 10,
    gap: 8,
  },
  langTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  langTagText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  resultLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  resultText: {
    fontSize: 18,
    lineHeight: 28,
    color: '#1E293B',
    fontWeight: '500' as const,
  },
  playButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#5B6AF710',
    borderRadius: 10,
    alignSelf: 'flex-start' as const,
  },
  playButtonText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: '#5B6AF7',
  },
  ttsHint: {
    marginTop: 8,
  },
  ttsHintText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic' as const,
  },
  loadingCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  recordSection: {
    alignItems: 'center' as const,
    paddingVertical: 20,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#5B6AF7',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    shadowColor: '#5B6AF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  recordButtonActive: {
    backgroundColor: '#E8604C',
  },
  recordHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
};
