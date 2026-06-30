import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useSupabaseConfig } from '@/lib/supabase-config-inject';
import { useI18n } from '@/i18n/I18nContext';

export default function LoginScreen() {
  const { isLoading: configLoading, error: configError } = useSupabaseConfig();
  const { signInWithEmail, signUpWithEmail, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useSafeRouter();
  const { t, language, setLanguage } = useI18n();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/');
    }
  }, [authLoading, isAuthenticated]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError(language === 'zh' ? '请填写邮箱和密码' : 'សូមបញ្ចូលអ៊ីមែលនិងពាក្យសម្ងាត់');
      return;
    }
    setError('');
    setLoading(true);
    const { error } = await signInWithEmail(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(language === 'zh' ? '邮箱或密码错误' : 'អ៊ីមែលឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ');
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      setError(language === 'zh' ? '请填写邮箱和密码' : 'សូមបញ្ចូលអ៊ីមែលនិងពាក្យសម្ងាត់');
      return;
    }
    if (password !== confirmPassword) {
      setError(language === 'zh' ? '两次输入的密码不一致' : 'ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា');
      return;
    }
    if (password.length < 6) {
      setError(language === 'zh' ? '密码至少6位' : 'ពាក្យសម្ងាត់យ៉ាងហោចណាស់ ៦ តួ');
      return;
    }
    setError('');
    setLoading(true);
    const { error } = await signUpWithEmail(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(error.includes('already') 
        ? (language === 'zh' ? '该邮箱已注册' : 'អ៊ីមែលនេះបានចុះឈ្មោះរួចហើយ') 
        : (language === 'zh' ? '注册失败，请重试' : 'ការចុះឈ្មោះបរាជ័យ សូមព្យាយាមម្តងទៀត'));
    }
  };

  if (configLoading || authLoading) {
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* App Icon & Name */}
          <View style={styles.headerSection}>
            <Image
              source={{
                uri: 'https://coze-coding-project.tos.coze.site/gen_project_icon/2026-06-29/7656767824706240554_1782732288.png?sign=4904799735-4ff7f1b757-0-5561706493b7689f2a6b2a24791f6a7a0f81dd3e89f0a43ad7c3db80c351be0d',
              }}
              style={styles.appIcon}
            />
            <Text style={styles.appName}>{t('app_name')}</Text>
            <Text style={styles.appSubtitle}>{t('translate_subtitle')}</Text>
          </View>

          {/* Language Switch */}
          <View style={styles.langSwitchContainer}>
            <TouchableOpacity
              style={[styles.langButton, language === 'zh' && styles.langButtonActive]}
              onPress={() => setLanguage('zh')}
            >
              <Text style={[styles.langButtonText, language === 'zh' && styles.langButtonTextActive]}>中文</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langButton, language === 'km' && styles.langButtonActive]}
              onPress={() => setLanguage('km')}
            >
              <Text style={[styles.langButtonText, language === 'km' && styles.langButtonTextActive]}>ខ្មែរ</Text>
            </TouchableOpacity>
          </View>

          {/* Form Section */}
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>{isLogin ? t('login') : t('register')}</Text>

            {error ? (
              <View style={styles.errorContainer}>
                <FontAwesome6 name="circle-exclamation" size={14} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <FontAwesome6 name="envelope" size={16} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('email_placeholder')}
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <FontAwesome6 name="lock" size={16} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('password_placeholder')}
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <FontAwesome6
                  name={showPassword ? 'eye-slash' : 'eye'}
                  size={16}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            {/* Confirm Password (Register only) */}
            {!isLogin && (
              <View style={styles.inputContainer}>
                <FontAwesome6 name="lock" size={16} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('confirm_password_placeholder')}
                  placeholderTextColor="#94A3B8"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={styles.submitButton}
              onPress={isLogin ? handleLogin : handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>{isLogin ? t('login') : t('register')}</Text>
              )}
            </TouchableOpacity>

            {/* Toggle Login/Register */}
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
            >
              <Text style={styles.toggleText}>
                {isLogin ? t('no_account') : t('has_account')}
                <Text style={styles.toggleLink}>{isLogin ? t('go_register') : t('go_login')}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = {
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  headerSection: {
    alignItems: 'center' as const,
    marginBottom: 40,
  },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 12,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#1E293B',
    marginBottom: 4,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  langSwitchContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 12,
    marginBottom: 24,
  },
  langButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  langButtonActive: {
    backgroundColor: '#5B6AF7',
  },
  langButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#64748B',
  },
  langButtonTextActive: {
    color: '#FFFFFF',
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#5B6AF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1E293B',
    marginBottom: 20,
  },
  errorContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#F0F0F5',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
    height: 50,
  },
  submitButton: {
    backgroundColor: '#5B6AF7',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginTop: 6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  toggleButton: {
    marginTop: 16,
    alignItems: 'center' as const,
  },
  toggleText: {
    fontSize: 14,
    color: '#64748B',
  },
  toggleLink: {
    color: '#5B6AF7',
    fontWeight: '600' as const,
  },
};
