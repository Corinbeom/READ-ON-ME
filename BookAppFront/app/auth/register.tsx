import React, { useState, useCallback } from 'react';
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

// Validation rules based on backend
const validationRules = {
  nickname: {
    minLength: 2,
    maxLength: 10,
    message: '닉네임은 2-10자 사이여야 합니다',
  },
  email: {
    pattern: /^[^\\s@]+@[^\\s@]+\.[^\\s@]+$/,
    message: '올바른 이메일 형식이 아닙니다',
  },
  password: {
    pattern: /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,20}$/,
    message: '비밀번호는 8~20자, 영문/숫자/특수문자를 포함해야 합니다',
  },
};

export default function RegisterScreen() {
  const [nickname, setNickName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const dispatch = useDispatch<AppDispatch>();
  const { isLoading } = useSelector((state: RootState) => state.auth);

  const validateField = useCallback((field: string, value: string) => {
    let error = '';
    switch (field) {
      case 'nickname':
        if (value.length < validationRules.nickname.minLength || value.length > validationRules.nickname.maxLength) {
          error = validationRules.nickname.message;
        }
        break;
      case 'email':
        if (!validationRules.email.pattern.test(value)) {
          error = validationRules.email.message;
        }
        break;
      case 'password':
        if (!validationRules.password.pattern.test(value)) {
          error = validationRules.password.message;
        }
        break;
      case 'confirmPassword':
        if (password !== value) {
          error = '비밀번호가 일치하지 않습니다';
        }
        break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return !error;
  }, [password]);

  const handleRegister = async () => {
    setErrors({});

    const isNicknameValid = validateField('nickname', nickname);
    const isEmailValid = validateField('email', email);
    const isPasswordValid = validateField('password', password);
    const isConfirmPasswordValid = validateField('confirmPassword', confirmPassword);

    if (!isNicknameValid || !isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
      return;
    }

    try {
      const result = await dispatch(signUp({ nickname, email, password }));
      
      if (signUp.fulfilled.match(result)) {
        Alert.alert('성공', '회원가입이 완료되었습니다!', [
          { text: '로그인하기', onPress: () => router.replace('/auth/login') }
        ]);
      } else {
        const payload = result.payload as any;
        if (payload?.errors) {
          // Handle @Valid errors
          const backendErrors = payload.errors.reduce((acc: any, error: any) => {
            acc[error.field] = error.defaultMessage;
            return acc;
          }, {});
          setErrors(backendErrors);
        } else if (payload?.code) {
          // Handle custom AppExceptions
          switch (payload.code) {
            case 'EMAIL_DUPLICATE':
              setErrors(prev => ({ ...prev, email: payload.message }));
              break;
            case 'NICKNAME_DUPLICATE':
              setErrors(prev => ({ ...prev, nickname: payload.message }));
              break;
            default:
              Alert.alert('회원가입 실패', payload.message || '알 수 없는 오류가 발생했습니다.');
          }
        } else {
          Alert.alert('회원가입 실패', payload?.message || '회원가입에 실패했습니다');
        }
      }
    } catch (error) {
      console.error('Register error:', error);
      Alert.alert('오류', '회원가입 중 오류가 발생했습니다');
    }
  };

  const onInputChange = (field: string, value: string, setter: (val: string) => void) => {
    setter(value);
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <Text style={styles.title}>회원가입</Text>
          <Text style={styles.subtitle}>새 계정을 만들어보세요</Text>

          <View style={styles.form}>
            <View>
              <TextInput
                style={[styles.input, errors.nickname && styles.inputError]}
                placeholder="닉네임 (2-10자)"
                value={nickname}
                onChangeText={(text) => onInputChange('nickname', text, setNickName)}
                onBlur={() => validateField('nickname', nickname)}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {errors.nickname && <Text style={styles.errorText}>{errors.nickname}</Text>}
            </View>

            <View>
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="이메일"
                value={email}
                onChangeText={(text) => onInputChange('email', text, setEmail)}
                onBlur={() => validateField('email', email)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>
            
            <View>
              <TextInput
                style={[styles.input, errors.password && styles.inputError]}
                placeholder="비밀번호 (8-20자, 영문/숫자/특수문자)"
                value={password}
                onChangeText={(text) => onInputChange('password', text, setPassword)}
                onBlur={() => validateField('password', password)}
                secureTextEntry
                autoCapitalize="none"
              />
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>

            <View>
              <TextInput
                style={[styles.input, errors.confirmPassword && styles.inputError]}
                placeholder="비밀번호 확인"
                value={confirmPassword}
                onChangeText={(text) => onInputChange('confirmPassword', text, setConfirmPassword)}
                onBlur={() => validateField('confirmPassword', confirmPassword)}
                secureTextEntry
                autoCapitalize="none"
              />
              {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
            </View>

            <TouchableOpacity
              style={[styles.registerButton, (isLoading || Object.values(errors).some(e => e)) && styles.registerButtonDisabled]}
              onPress={handleRegister}
              disabled={isLoading || Object.values(errors).some(e => e)}
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
    gap: 12, // Adjusted gap
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
  inputError: {
    borderColor: '#dc3545', // Red border for errors
  },
  errorText: {
    color: '#dc3545',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 8,
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