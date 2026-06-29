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

export default function LoginScreen() {
  const { isLoading: configLoading, error: configError } = useSupabaseConfig();
  const { signInWithEmail, signUpWithEmail, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useSafeRouter();

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
      setError('请填写邮箱和密码');
      return;
    }
    setError('');
    setLoading(true);
    const { error } = await signInWithEmail(email.trim(), password);
    setLoading(false);
    if (error) {
      setError('邮箱或密码错误');
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      setError('请填写邮箱和密码');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }
    setError('');
    setLoading(true);
    const { error } = await signUpWithEmail(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(error.includes('already') ? '该邮箱已注册' : '注册失败，请重试');
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
            <Text style={styles.appName}>语音翻译通</Text>
            <Text style={styles.appSubtitle}>中文 · 高棉语 实时翻译</Text>
          </View>

          {/* Form Section */}
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>{isLogin ? '登录' : '注册'}</Text>

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
                placeholder="邮箱地址"
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
                placeholder="密码"
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
                  placeholder="确认密码"
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
                <Text style={styles.submitButtonText}>{isLogin ? '登录' : '注册'}</Text>
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
                {isLogin ? '还没有账号？' : '已有账号？'}
                <Text style={styles.toggleLink}>{isLogin ? '去注册' : '去登录'}</Text>
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
