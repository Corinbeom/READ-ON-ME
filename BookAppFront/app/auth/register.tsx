import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../src/store';
import { signUp } from '../../src/store/authSlice';

export default function RegisterScreen() {
  const [nickname, setNickName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading } = useSelector((state: RootState) => state.auth);

  const handleRegister = async () => {
    if (!nickname.trim()) {
      Alert.alert('알림', '이름을 입력해주세요.');
      return;
    }

    if (!email.trim()) {
      Alert.alert('알림', '이메일을 입력해주세요.');
      return;
    }

    if (!password.trim()) {
      Alert.alert('알림', '비밀번호를 입력해주세요.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('알림', '비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('알림', '비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    try {
      const result = await dispatch(signUp({ nickname, email, password }));
      
      if (signUp.fulfilled.match(result)) {
        Alert.alert('성공', '회원가입이 완료되었습니다!', [
          { text: '로그인하기', onPress: () => router.replace('/auth/login') }
        ]);
      } else {
        Alert.alert('회원가입 실패', result.payload as string || '회원가입에 실패했습니다');
      }
    } catch (error) {
      console.error('Register error:', error);
      Alert.alert('오류', '회원가입 중 오류가 발생했습니다');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.content}>
          <Text style={styles.title}>회원가입</Text>
          <Text style={styles.subtitle}>새 계정을 만들어보세요</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="이름"
              value={nickname}
              onChangeText={setNickName}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="이메일"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            
            <TextInput
              style={styles.input}
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <TextInput
              style={styles.input}
              placeholder="비밀번호 확인"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
            >
              <Text style={styles.registerButtonText}>
                {isLoading ? '회원가입 중...' : '회원가입'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => router.replace('/auth/login')}
            >
              <Text style={styles.loginLinkText}>이미 계정이 있으신가요? 로그인</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>뒤로 가기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  registerButton: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonDisabled: {
    backgroundColor: '#adb5bd',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loginLinkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#6c757d',
    fontSize: 14,
  },
});