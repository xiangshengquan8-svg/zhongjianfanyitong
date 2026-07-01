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
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { createFormDataFile } from '@/utils';
import * as FileSystem from 'expo-file-system/legacy';
import { translateText, speakOffline, stopSpeaking, checkNetworkConnection } from '@/utils/translation-service';
import { translateOffline } from '@/utils/offline-dictionary';

const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1`;

type Lang = 'zh' | 'km';

export default function TranslateScreen() {
  const router = useSafeRouter();
  const { user, isAuthenticated, isLoading: authLoading, signOut } = useAuth();
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

    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected || !state.isInternetReachable);
    });

    return () => unsubscribe();
  }, []);

  // Auth check - allow guest access
  // User can use the app without logging in

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
    // Allow guest access - no authentication required
    return {};
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('translate_permission_title'), t('translate_permission_msg'));
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
      Alert.alert(t('error'), t('translate_record_error'));
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
        Alert.alert(t('error'), t('translate_file_error'));
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
        // Allow guest access - show error but don't redirect
        Alert.alert(t('translate_error'), t('translate_service_unavailable'));
        setIsTranslating(false);
        return;
      }

      if (!asrResponse.ok) {
        const errorData = await asrResponse.json();
        Alert.alert(t('translate_recognize_error'), errorData.error || t('translate_recognize_error_msg'));
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
          voiceGender: 'female',
          scene: 'daily',
        }),
      });

      if (!translateResponse.ok) {
        const errorData = await translateResponse.json();
        Alert.alert(t('translate_fail'), errorData.error || t('translate_fail'));
        setIsTranslating(false);
        return;
      }

      const translateData = await translateResponse.json();
      setTranslatedText(translateData.translatedText);
      setAudioUrl(translateData.audioUrl || '');
      setHistoryId(translateData.historyId || null);
    } catch (err) {
      console.error('Stop recording error:', err);
      Alert.alert(t('error'), t('translate_process_error'));
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
      Alert.alert(t('translate_play_error'), t('translate_play_error_msg'));
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
    setInputMode('voice');
    setTextInput('');
  };

  const handleTextTranslate = async () => {
    if (!textInput.trim()) {
      Alert.alert(t('translate_input_hint'), t('translate_input_hint_msg'));
      return;
    }

    try {
      setIsTranslating(true);
      setSourceText(textInput.trim());
      setTranslatedText('');
      setAudioUrl('');
      setHistoryId(null);
      setLastTranslationOffline(false);

      // 使用翻译服务（支持离线）
      const result = await translateText(textInput.trim(), sourceLang, targetLang, 'female', 'daily');

      setTranslatedText(result.translatedText);
      setAudioUrl(result.audioUrl || '');
      setLastTranslationOffline(result.isOffline);

      // 如果是在线模式且有 historyId，保存
      if (!result.isOffline && result.audioUrl) {
        // historyId 已在后端保存
      }
    } catch (err) {
      console.error('Translate text error:', err);
      // 尝试离线翻译作为备选
      const offlineResult = translateOffline(textInput.trim(), sourceLang, targetLang);
      if (offlineResult) {
        setTranslatedText(offlineResult);
        setLastTranslationOffline(true);
        Alert.alert(t('offline_mode'), t('translate_offline_msg'));
      } else {
        Alert.alert(t('error'), t('translate_offline_no_match'));
      }
    } finally {
      setIsTranslating(false);
    }
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
            <Text style={styles.headerTitle}>{t('translate_title')}</Text>
            <Text style={styles.headerSubtitle}>
              {locale === 'zh' ? '中文 ⇋ 高棉文实时翻译' : 'បកប្រែភាសាចិន ⇋ ខ្មែរភ្លាមៗ'}
            </Text>
            <Text style={styles.headerSubtitleSecondary}>
              {locale === 'zh' ? 'កម្មវិធីបកប្រែចិន-ខ្មែរ' : '中柬翻译通'}
            </Text>
            {isOffline && (
              <View style={styles.offlineBadge}>
                <FontAwesome6 name="wifi" size={10} color="#E8604C" />
                <Text style={styles.offlineBadgeText}>{t('offline_mode')}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            {/* 界面语言切换 */}
            <TouchableOpacity
              style={styles.langSwitchButton}
              onPress={() => setLanguage(language === 'zh' ? 'km' : 'zh')}
              activeOpacity={0.7}
            >
              <Text style={styles.langSwitchText}>{language === 'zh' ? 'ខ្មែរ' : '中文'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={() => router.push('/history')}
              activeOpacity={0.7}
            >
              <FontAwesome6 name="clock-rotate-left" size={18} color="#5B6AF7" />
            </TouchableOpacity>
            {/* Logout button removed - guest access mode */}
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
            <Text style={[styles.langButtonSubText, sourceLang === 'zh' && styles.langButtonTextActive]}>
              ភាសាចិន
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
            <Text style={[styles.langButtonSubText, sourceLang === 'km' && styles.langButtonTextActive]}>
              ភាសាខ្មែរ
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
                    {sourceLang === 'zh' ? t('source_lang') : t('target_lang')}
                  </Text>
                </View>
                <Text style={styles.resultLabel}>{t('translate_original')}</Text>
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
                    {targetLang === 'zh' ? t('source_lang') : t('target_lang')}
                  </Text>
                </View>
                <Text style={styles.resultLabel}>{t('translate_result')}</Text>
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
                    {isPlaying ? t('close') : t('play_translation')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.ttsHint}>
                  <Text style={styles.ttsHintText}>
                    {targetLang === 'km' ? t('tts_hint') : ''}
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

        {/* Input Area - Voice Mode */}
        {inputMode === 'voice' ? (
          <View style={styles.voiceInputContainer}>
            {/* Left: Voice Input Button (Active - Warm Coral) */}
            <TouchableOpacity
              style={[styles.sideModeButton, styles.voiceModeButton, styles.voiceModeActive]}
              onPress={() => setInputMode('voice')}
              activeOpacity={0.7}
            >
              <FontAwesome6 name="microphone" size={20} color="#FFFFFF" />
              <Text style={[styles.sideModeButtonText, styles.modeButtonTextActive]}>语音</Text>
              <Text style={[styles.sideModeSubText, styles.modeSubTextActive]}>សំឡេង</Text>
            </TouchableOpacity>

            {/* Center: Record Button */}
            <View style={styles.recordCenter}>
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
                {isRecording ? '松开结束' : isTranslating ? '加载中...' : '点击说话'}
              </Text>
              <Text style={styles.recordHintSub}>
                {isRecording ? 'លែងដើម្បីបញ្ឈប់' : isTranslating ? 'កំពុងផ្ទុក...' : 'ចុចដើម្បីនិយាយ'}
              </Text>
            </View>

            {/* Right: Text Input Button (Inactive - Teal Green Border) */}
            <TouchableOpacity
              style={[styles.sideModeButton, styles.textModeButton]}
              onPress={() => setInputMode('text')}
              activeOpacity={0.7}
            >
              <FontAwesome6 name="keyboard" size={20} color="#10B981" />
              <Text style={styles.sideModeButtonText}>文字</Text>
              <Text style={styles.sideModeSubText}>អត្ថបទ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.sideModeContainer}>
              <TouchableOpacity
                style={styles.sideModeButtonVoice}
                onPress={() => setInputMode('voice')}
                activeOpacity={0.7}
              >
                <FontAwesome6 name="microphone" size={20} color="#10B981" />
                <Text style={styles.sideModeButtonTextVoice}>语音</Text>
                <Text style={styles.sideModeSubTextVoice}>សំឡេង</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sideModeButtonTextActive}
                onPress={() => {}}
                activeOpacity={0.7}
              >
                <FontAwesome6 name="keyboard" size={20} color="#FFFFFF" />
                <Text style={styles.sideModeButtonText}>文字</Text>
                <Text style={styles.sideModeSubText}>អត្ថបទ</Text>
              </TouchableOpacity>
            </View>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.textInputSection}
            >
              <TextInput
                style={styles.textInput}
                placeholder={sourceLang === 'zh' ? t('placeholder_source') : t('placeholder_target')}
                placeholderTextColor="#94A3B8"
                value={textInput}
                onChangeText={setTextInput}
                multiline
                maxLength={500}
                editable={!isTranslating}
              />
              <View style={styles.textInputFooter}>
                <Text style={styles.charCount}>{textInput.length}/500</Text>
                <TouchableOpacity
                  style={[styles.translateButton, !textInput.trim() && styles.translateButtonDisabled]}
                  onPress={handleTextTranslate}
                  disabled={isTranslating || !textInput.trim()}
                  activeOpacity={0.7}
                >
                  {isTranslating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.translateButtonText}>{t('translate')}</Text>
                  )}
                </TouchableOpacity>
              </View>
              {sourceLang === 'km' && (
                <Text style={styles.kmHint}>
                  {t('tts_hint')}
                </Text>
              )}
            </KeyboardAvoidingView>
          </>
        )}
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
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerLeft: {},
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
    fontWeight: '500' as const,
  },
  headerSubtitleSecondary: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  offlineBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#E8604C15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
    gap: 4,
    alignSelf: 'flex-start' as const,
  },
  offlineBadgeText: {
    fontSize: 10,
    color: '#E8604C',
    fontWeight: '600' as const,
  },
  headerRight: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  langSwitchButton: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#5B6AF710',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  langSwitchText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#5B6AF7',
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
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center' as const,
  },
  langButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  langButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#64748B',
    textAlign: 'center' as const,
  },
  langButtonSubText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center' as const,
    marginTop: 4,
  },
  langButtonTextActive: {
    color: '#0F172A',
  },
  langButtonSubTextActive: {
    color: '#64748B',
  },
  swapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginHorizontal: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  genderSelector: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
    gap: 8,
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
  // Side mode container for text input mode
  sideModeContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 8,
  },
  sideModeButtonActive: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  // Voice input container - horizontal layout with buttons on sides
  voiceInputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 8,
  },
  // Side mode buttons (voice/text) - vibrant multi-color design
  sideModeButton: {
    width: 85,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  // Voice input button - warm coral color
  voiceModeButton: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFF5F5',
  },
  // Text input button - teal green color
  textModeButton: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  sideModeButtonText: {
    fontSize: 14,
    color: '#1E293B',
    marginTop: 6,
    fontWeight: '700' as const,
  },
  sideModeSubText: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    fontWeight: '600' as const,
  },
  // Text mode active button styles
  sideModeButtonVoice: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  sideModeButtonTextVoice: {
    fontSize: 14,
    color: '#10B981',
    marginTop: 6,
    fontWeight: '700' as const,
  },
  sideModeSubTextVoice: {
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
    fontWeight: '600' as const,
  },
  sideModeButtonTextActive: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  // Voice mode active - warm coral
  voiceModeActive: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  // Text mode active - teal green
  textModeActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '800' as const,
  },
  modeSubTextActive: {
    color: '#FFFFFF',
    fontWeight: '600' as const,
    opacity: 0.9,
  },
  // Center record button area
  recordCenter: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#5B6AF7',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    shadowColor: '#5B6AF7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: '#E8604C',
  },
  recordHint: {
    marginTop: 14,
    alignItems: 'center' as const,
    fontSize: 17,
    fontWeight: '600' as const,
    color: '#0F172A',
    textAlign: 'center' as const,
  },
  recordHintSub: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#475569',
    textAlign: 'center' as const,
    marginTop: 3,
  },
  textInputSection: {
    paddingBottom: 16,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: '#1E293B',
    minHeight: 100,
    maxHeight: 150,
    textAlignVertical: 'top' as const,
    shadowColor: '#5B6AF7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  textInputFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  charCount: {
    fontSize: 12,
    color: '#94A3B8',
  },
  translateButton: {
    backgroundColor: '#5B6AF7',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center' as const,
  },
  translateButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  translateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  kmHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#E8604C',
    textAlign: 'center' as const,
  },
};
