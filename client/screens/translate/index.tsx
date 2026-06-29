import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/Screen';
import { createFormDataFile } from '@/utils';
import { useSafeRouter } from '@/hooks/useSafeRouter';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

type Language = 'zh' | 'km';

const LANG_CONFIG = {
  zh: { label: '中文', sublabel: 'Chinese', flag: '中' },
  km: { label: '高棉语', sublabel: 'Khmer', flag: 'ខ' },
};

export default function TranslateScreen() {
  const router = useSafeRouter();

  // Language state
  const [sourceLang, setSourceLang] = useState<Language>('zh');
  const [targetLang, setTargetLang] = useState<Language>('km');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  // Translation state
  const [recognizedText, setRecognizedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Request microphone permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!hasPermission) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要权限', '请授予麦克风权限以进行录音');
        return;
      }
      setHasPermission(true);
    }

    // Clean up existing recording
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // ignore
      }
      recordingRef.current = null;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);

      // Clear previous results
      setRecognizedText('');
      setTranslatedText('');
      setAudioUrl('');
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('录音失败', '无法启动录音，请重试');
    }
  }, [hasPermission]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      // Reset audio mode for playback
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (uri) {
        await processTranslation(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsRecording(false);
    }
  }, []);

  const processTranslation = async (audioUri: string) => {
    setIsProcessing(true);

    try {
      // Step 1: Upload audio and get ASR result
      setProcessingStep('正在识别语音...');
      const formData = new FormData();
      const file = await createFormDataFile(audioUri, 'recording.m4a', 'audio/m4a');
      formData.append('file', file as any);

      const asrResponse = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/translate/asr`, {
        method: 'POST',
        body: formData,
      });

      if (!asrResponse.ok) {
        const errorData = await asrResponse.json();
        throw new Error(errorData.error || '语音识别失败');
      }

      const asrResult = await asrResponse.json();
      setRecognizedText(asrResult.text);

      // Step 2: Translate and get TTS
      setProcessingStep('正在翻译...');
      const translateResponse = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: asrResult.text,
          sourceLang,
          targetLang,
        }),
      });

      if (!translateResponse.ok) {
        const errorData = await translateResponse.json();
        throw new Error(errorData.error || '翻译失败');
      }

      const translateResult = await translateResponse.json();
      setTranslatedText(translateResult.translatedText);
      setAudioUrl(translateResult.audioUrl);
      setProcessingStep('');
    } catch (error) {
      console.error('Translation error:', error);
      Alert.alert('翻译失败', error instanceof Error ? error.message : '请重试');
      setProcessingStep('');
    } finally {
      setIsProcessing(false);
    }
  };

  const playTranslation = async () => {
    if (!audioUrl) return;

    try {
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
            return;
          }
          // If finished, restart
          if (status.positionMillis >= (status.durationMillis || 0)) {
            await soundRef.current.setPositionAsync(0);
          }
          await soundRef.current.playAsync();
          setIsPlaying(true);
          return;
        }
      }

      // Create new sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true, isLooping: false },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        }
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (error) {
      console.error('Playback error:', error);
      Alert.alert('播放失败', '无法播放翻译语音');
    }
  };

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    // Clear results when swapping
    setRecognizedText('');
    setTranslatedText('');
    setAudioUrl('');
  };

  const handleRecordingPress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>VoiceBridge</Text>
          <Text style={styles.headerSubtitle}>中文 · 高棉语 翻译</Text>
        </View>

        {/* Language Selector */}
        <View style={styles.langSelector}>
          <View style={styles.langBox}>
            <View style={styles.langFlagContainer}>
              <Text style={styles.langFlag}>{LANG_CONFIG[sourceLang].flag}</Text>
            </View>
            <Text style={styles.langLabel}>{LANG_CONFIG[sourceLang].label}</Text>
            <Text style={styles.langSublabel}>{LANG_CONFIG[sourceLang].sublabel}</Text>
          </View>

          <TouchableOpacity style={styles.swapButton} onPress={swapLanguages} activeOpacity={0.7}>
            <View style={styles.swapIconContainer}>
              <FontAwesome6 name="arrow-right-arrow-left" size={18} color="#5B6AF7" />
            </View>
          </TouchableOpacity>

          <View style={styles.langBox}>
            <View style={[styles.langFlagContainer, styles.langFlagContainerTarget]}>
              <Text style={styles.langFlag}>{LANG_CONFIG[targetLang].flag}</Text>
            </View>
            <Text style={styles.langLabel}>{LANG_CONFIG[targetLang].label}</Text>
            <Text style={styles.langSublabel}>{LANG_CONFIG[targetLang].sublabel}</Text>
          </View>
        </View>

        {/* Results Area */}
        <ScrollView style={styles.resultsArea} contentContainerStyle={styles.resultsContent}>
          {/* Source Text */}
          {recognizedText ? (
            <View style={styles.resultCard}>
              <View style={styles.resultCardHeader}>
                <View style={styles.resultLangBadge}>
                  <Text style={styles.resultLangText}>{LANG_CONFIG[sourceLang].label}</Text>
                </View>
                <Text style={styles.resultCardLabel}>识别结果</Text>
              </View>
              <Text style={styles.resultText}>{recognizedText}</Text>
            </View>
          ) : null}

          {/* Translated Text */}
          {translatedText ? (
            <View style={[styles.resultCard, styles.translatedCard]}>
              <View style={styles.resultCardHeader}>
                <View style={[styles.resultLangBadge, styles.translatedBadge]}>
                  <Text style={styles.resultLangText}>{LANG_CONFIG[targetLang].label}</Text>
                </View>
                <Text style={styles.resultCardLabel}>翻译结果</Text>
              </View>
              <Text style={styles.translatedText}>{translatedText}</Text>

              {/* Play Button */}
              {audioUrl ? (
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={playTranslation}
                  activeOpacity={0.7}
                >
                  <FontAwesome6
                    name={isPlaying ? 'pause' : 'play'}
                    size={16}
                    color="#FFFFFF"
                    style={styles.playIcon}
                  />
                  <Text style={styles.playButtonText}>
                    {isPlaying ? '暂停' : '播放翻译'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.ttsHint}>该语言暂不支持语音播放</Text>
              )}
            </View>
          ) : null}

          {/* Processing Indicator */}
          {isProcessing ? (
            <View style={styles.processingCard}>
              <ActivityIndicator size="small" color="#5B6AF7" />
              <Text style={styles.processingText}>{processingStep}</Text>
            </View>
          ) : null}

          {/* Empty State */}
          {!recognizedText && !isProcessing ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <FontAwesome6 name="microphone-lines" size={32} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyText}>点击下方按钮开始录音</Text>
              <Text style={styles.emptySubtext}>
                说出{LANG_CONFIG[sourceLang].label}，自动翻译为{LANG_CONFIG[targetLang].label}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Recording Button */}
        <View style={styles.recordingArea}>
          {/* History Button */}
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => router.push('/history')}
            activeOpacity={0.7}
          >
            <FontAwesome6 name="clock-rotate-left" size={20} color="#5B6AF7" />
          </TouchableOpacity>

          {/* Main Recording Button */}
          <TouchableOpacity
            onPress={handleRecordingPress}
            activeOpacity={0.8}
            style={styles.recordingButtonWrapper}
          >
            {isRecording ? (
              <View style={styles.recordingPulseOuter}>
                <View style={styles.recordingPulseInner}>
                  <LinearGradient
                    colors={['#E8604C', '#FF7B6B']}
                    style={styles.recordingGradient}
                  >
                    <FontAwesome6 name="stop" size={28} color="#FFFFFF" />
                  </LinearGradient>
                </View>
              </View>
            ) : (
              <LinearGradient
                colors={['#5B6AF7', '#7B8AFF']}
                style={styles.recordingGradient}
              >
                <FontAwesome6 name="microphone" size={28} color="#FFFFFF" />
              </LinearGradient>
            )}
          </TouchableOpacity>

          {/* Placeholder for symmetry */}
          <View style={styles.historyButton} />
        </View>

        {/* Recording Hint */}
        {isRecording ? (
          <View style={styles.recordingHint}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingHintText}>正在录音，点击停止</Text>
          </View>
        ) : (
          <View style={styles.bottomSpacer} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F0F5',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 20 : 8,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },

  // Language Selector
  langSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  langBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#F0F0F5',
    borderRadius: 20,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  langFlagContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(91,106,247,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  langFlagContainerTarget: {
    backgroundColor: 'rgba(232,96,76,0.12)',
  },
  langFlag: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5B6AF7',
  },
  langLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  langSublabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  swapButton: {
    marginHorizontal: 12,
    padding: 10,
  },
  swapIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
  },

  // Results Area
  resultsArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  resultsContent: {
    paddingBottom: 20,
  },
  resultCard: {
    backgroundColor: '#F0F0F5',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  translatedCard: {
    backgroundColor: '#F0F0F5',
    shadowColor: '#5B6AF7',
    shadowOpacity: 0.15,
  },
  resultCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLangBadge: {
    backgroundColor: 'rgba(91,106,247,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  translatedBadge: {
    backgroundColor: 'rgba(232,96,76,0.12)',
  },
  resultLangText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B6AF7',
  },
  resultCardLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  resultText: {
    fontSize: 17,
    color: '#1E293B',
    lineHeight: 26,
  },
  translatedText: {
    fontSize: 19,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 28,
  },

  // Play Button
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: '#5B6AF7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  playIcon: {
    marginRight: 8,
  },
  playButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ttsHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 12,
    fontStyle: 'italic',
  },

  // Processing
  processingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: '#F0F0F5',
    borderRadius: 20,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  processingText: {
    fontSize: 14,
    color: '#5B6AF7',
    marginLeft: 12,
    fontWeight: '600',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(203,213,225,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // Recording Area
  recordingArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  historyButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
  },
  recordingButtonWrapper: {
    marginHorizontal: 24,
  },
  recordingPulseOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(232,96,76,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingPulseInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(232,96,76,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#5B6AF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  // Recording Hint
  recordingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
    paddingTop: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8604C',
    marginRight: 8,
  },
  recordingHintText: {
    fontSize: 13,
    color: '#E8604C',
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 36,
  },
});
