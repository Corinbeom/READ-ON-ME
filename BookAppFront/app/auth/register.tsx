import customAlert from '@/src/utils/alert';
import { useState, useCallback } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/src/store';
import { signUp } from '@/src/store/authSlice';
import AuthScreen from '@/components/AuthScreen';
import AppButton from '@/components/ui/AppButton';
import { FormField } from '@/components/ui/AppTextInput';
import { ThemedText } from '@/components/ThemedText';
import { Spacing, Typography } from '@/src/styles/designTokens';
import { authReturnParams } from '@/src/utils/aiSearchEntry';

const validationRules = {
  nickname: { minLength: 2, maxLength: 10, message: '닉네임은 2-10자 사이여야 합니다' },
  email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '올바른 이메일 형식이 아닙니다' },
  password: { pattern: /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,20}$/, message: '비밀번호는 8~20자, 영문/숫자/특수문자를 포함해야 합니다' },
};

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; prompt?: string | string[] }>();
  const returnParams = authReturnParams(params.returnTo, params.prompt);
  const [nickname, setNickName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const dispatch = useDispatch<AppDispatch>();
  const { isLoading } = useSelector((state: RootState) => state.auth);


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
    const values = { nickname, email, password, confirmPassword };
    const fields = ['nickname', 'email', 'password', 'confirmPassword'] as const;
    const isValid = fields.map(field => validateField(field, values[field])).every(Boolean);
    if (!isValid) return;

    // 선택한 나이대 → 대표 출생연도 (나이대 중간값 사용)
    const birthYear = selectedAgeGroup
      ? new Date().getFullYear() - (selectedAgeGroup + 5)
      : undefined;

    try {
      const result = await dispatch(signUp({ nickname, email, password, birth_year: birthYear }));
      if (signUp.fulfilled.match(result)) {
        customAlert('성공', '회원가입이 완료되었습니다!', [{ text: '로그인하기', onPress: () => router.replace({ pathname: '/auth/login', params: returnParams }) }]);
      } else {
        const payload = result.payload as any;
        if (payload?.errors) {
          const backendErrors = payload.errors.reduce((acc: any, error: any) => ({ ...acc, [error.field]: error.defaultMessage }), {});
          setErrors(backendErrors);
        } else if (payload?.code) {
          const field = payload.code === 'EMAIL_DUPLICATE' ? 'email' : payload.code === 'NICKNAME_DUPLICATE' ? 'nickname' : '';
          if (field) setErrors(prev => ({ ...prev, [field]: payload.message }));
          else customAlert('회원가입 실패', payload.message || '알 수 없는 오류가 발생했습니다.');
        } else {
          customAlert('회원가입 실패', payload?.message || '회원가입에 실패했습니다');
        }
      }
    } catch (error) {
      console.error('Register error:', error);
      customAlert('오류', '회원가입 중 오류가 발생했습니다');
    }
  };

  const onInputChange = (field: string, value: string, setter: (val: string) => void) => {
    setter(value);
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <AuthScreen title="회원가입" description="나에게 맞는 책을 찾아볼까요?">
      <FormField label="닉네임" placeholder="어떻게 불러드릴까요?" hint="2~10자로 입력해주세요."
        value={nickname} onChangeText={(text) => onInputChange('nickname', text, setNickName)}
        onBlur={() => validateField('nickname', nickname)} autoCorrect={false} error={errors.nickname} />
      <FormField label="이메일" placeholder="이메일 주소" keyboardType="email-address" autoCapitalize="none" autoComplete="email"
        value={email} onChangeText={(text) => onInputChange('email', text, setEmail)} onBlur={() => validateField('email', email)} error={errors.email} />
      <FormField label="비밀번호" placeholder="비밀번호" hint="8~20자, 영문·숫자·특수문자를 포함해주세요."
        secureTextEntry autoCapitalize="none" autoComplete="new-password" value={password}
        onChangeText={(text) => onInputChange('password', text, setPassword)} onBlur={() => validateField('password', password)} error={errors.password} />
      <FormField label="비밀번호 확인" placeholder="비밀번호를 한 번 더 입력해주세요" secureTextEntry autoCapitalize="none" autoComplete="new-password"
        value={confirmPassword} onChangeText={(text) => onInputChange('confirmPassword', text, setConfirmPassword)}
        onBlur={() => validateField('confirmPassword', confirmPassword)} error={errors.confirmPassword} />
      <View style={{ gap: Spacing.xs }}>
        <ThemedText style={Typography.label}>연령대 (선택)</ThemedText>
        <ThemedText style={Typography.caption}>선택하면 나이대에 맞는 인기 책을 볼 수 있어요.</ThemedText>
        <View role="radiogroup" accessibilityLabel="연령대" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
          {[10, 20, 30, 40, 50, 60].map((age) => <AppButton key={age} compact
            title={age === 60 ? '60대 이상' : `${age}대`} variant={selectedAgeGroup === age ? 'primary' : 'secondary'}
            accessibilityRole="radio" accessibilityState={{ checked: selectedAgeGroup === age }}
            onPress={() => setSelectedAgeGroup(selectedAgeGroup === age ? null : age)} />)}
        </View>
      </View>
      <AppButton title="회원가입" loading={isLoading} onPress={handleRegister} />
      <AppButton title="이미 계정이 있으신가요? 로그인" variant="ghost" onPress={() => router.replace({ pathname: '/auth/login', params: returnParams })} />
      <AppButton title="홈으로 돌아가기" variant="ghost" onPress={() => router.replace('/')} />
    </AuthScreen>
  );
}
