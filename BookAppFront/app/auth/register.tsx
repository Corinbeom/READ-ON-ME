import React, { useState, useCallback } from 'react';
import {
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  View,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/src/store';
import { signUp } from '@/src/store/authSlice';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

const screenWidth = Dimensions.get('window').width;

// Validation rules
const validationRules = {
  nickname: { minLength: 2, maxLength: 10, message: '닉네임은 2-10자 사이여야 합니다' },
  email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '올바른 이메일 형식이 아닙니다' },
  password: { pattern: /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,20}$/, message: '비밀번호는 8~20자, 영문/숫자/특수문자를 포함해야 합니다' },
};

// Dynamic stylesheet function
const getStyles = (colorScheme: 'light' | 'dark') => {
  const colors = Colors[colorScheme];
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContainer: { flexGrow: 1 },
    content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    logo: { width: screenWidth * 0.55,   // 전체 화면 폭의 55%
      height: (screenWidth * 0.55) / 4.7, // 원본 비율 유지 (470:100)
      resizeMode: 'contain',
      alignSelf: 'center',
      marginBottom: 48, },
    title: { textAlign: 'center', marginBottom: 8, color: colors.primary },
    subtitle: { textAlign: 'center', marginBottom: 40, color: colors.darkGray },
    form: { gap: 12 },
    inputContainer: { marginBottom: 4 }, // Add a container for input and error
    input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lightGray, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
    inputError: { borderColor: '#dc3545' },
    errorText: { color: '#dc3545', fontSize: 12, marginTop: 4, marginLeft: 8 },
    button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
    buttonDisabled: { backgroundColor: colors.darkGray },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    linkContainer: { alignItems: 'center', paddingVertical: 12 },
    link: { color: colors.primary },
    backButtonText: { color: colors.darkGray, fontSize: 14 },
  });
};

export default function RegisterScreen() {
  const [nickname, setNickName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const dispatch = useDispatch<AppDispatch>();
  const { isLoading } = useSelector((state: RootState) => state.auth);

  const colorScheme = useColorScheme() ?? 'light';
  const styles = getStyles(colorScheme);
  const colors = Colors[colorScheme];

  const validateField = useCallback((field: string, value: string) => {
    let error = '';
    switch (field) {
      case 'nickname': if (value.length < validationRules.nickname.minLength || value.length > validationRules.nickname.maxLength) error = validationRules.nickname.message; break;
      case 'email': if (!validationRules.email.pattern.test(value)) error = validationRules.email.message; break;
      case 'password': if (!validationRules.password.pattern.test(value)) error = validationRules.password.message; break;
      case 'confirmPassword': if (password !== value) error = '비밀번호가 일치하지 않습니다'; break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return !error;
  }, [password]);

  const handleRegister = async () => {
    setErrors({});
    const isValid = ['nickname', 'email', 'password', 'confirmPassword'].every(f => validateField(f, { nickname, email, password, confirmPassword }[f]));
    if (!isValid) return;

    try {
      const result = await dispatch(signUp({ nickname, email, password }));
      if (signUp.fulfilled.match(result)) {
        Alert.alert('성공', '회원가입이 완료되었습니다!', [{ text: '로그인하기', onPress: () => router.replace('/auth/login') }]);
      } else {
        const payload = result.payload as any;
        if (payload?.errors) {
          const backendErrors = payload.errors.reduce((acc: any, error: any) => ({ ...acc, [error.field]: error.defaultMessage }), {});
          setErrors(backendErrors);
        } else if (payload?.code) {
          const field = payload.code === 'EMAIL_DUPLICATE' ? 'email' : payload.code === 'NICKNAME_DUPLICATE' ? 'nickname' : '';
          if (field) setErrors(prev => ({ ...prev, [field]: payload.message }));
          else Alert.alert('회원가입 실패', payload.message || '알 수 없는 오류가 발생했습니다.');
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
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.content}>
                    <Image 
            source={colorScheme === 'dark' 
              ? require('@/assets/images/login_register_logo_dark.png') 
              : require('@/assets/images/login_register_logo.png')} 
            style={styles.logo} 
          />
          <ThemedText type="title" style={styles.title}>회원가입</ThemedText>
          <ThemedText style={styles.subtitle}>새 계정을 만들어보세요</ThemedText>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <TextInput style={[styles.input, errors.nickname && styles.inputError]} placeholder="닉네임 (2-10자)" value={nickname} onChangeText={(text) => onInputChange('nickname', text, setNickName)} onBlur={() => validateField('nickname', nickname)} autoCapitalize="words" autoCorrect={false} placeholderTextColor={colors.darkGray} />
              {errors.nickname && <ThemedText style={styles.errorText}>{errors.nickname}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <TextInput style={[styles.input, errors.email && styles.inputError]} placeholder="이메일" value={email} onChangeText={(text) => onInputChange('email', text, setEmail)} onBlur={() => validateField('email', email)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.darkGray} />
              {errors.email && <ThemedText style={styles.errorText}>{errors.email}</ThemedText>}
            </View>
            
            <View style={styles.inputContainer}>
              <TextInput style={[styles.input, errors.password && styles.inputError]} placeholder="비밀번호 (8-20자, 영문/숫자/특수문자)" value={password} onChangeText={(text) => onInputChange('password', text, setPassword)} onBlur={() => validateField('password', password)} secureTextEntry autoCapitalize="none" placeholderTextColor={colors.darkGray} />
              {errors.password && <ThemedText style={styles.errorText}>{errors.password}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <TextInput style={[styles.input, errors.confirmPassword && styles.inputError]} placeholder="비밀번호 확인" value={confirmPassword} onChangeText={(text) => onInputChange('confirmPassword', text, setConfirmPassword)} onBlur={() => validateField('confirmPassword', confirmPassword)} secureTextEntry autoCapitalize="none" placeholderTextColor={colors.darkGray} />
              {errors.confirmPassword && <ThemedText style={styles.errorText}>{errors.confirmPassword}</ThemedText>}
            </View>

            <TouchableOpacity style={[styles.button, (isLoading || Object.values(errors).some(e => e)) && styles.buttonDisabled]} onPress={handleRegister} disabled={isLoading || Object.values(errors).some(e => e)}>
              <ThemedText style={styles.buttonText}>{isLoading ? '회원가입 중...' : '회원가입'}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkContainer} onPress={() => router.replace('/auth/login')}>
              <ThemedText type="link" style={styles.link}>이미 계정이 있으신가요? 로그인</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkContainer} onPress={() => router.back()}>
              <ThemedText style={styles.backButtonText}>뒤로 가기</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}