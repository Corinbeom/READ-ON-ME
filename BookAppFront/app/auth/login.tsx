import customAlert from '@/src/utils/alert';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch } from 'react-redux';
import { signIn } from '@/src/store/authSlice';
import type { AppDispatch } from '@/src/store';
import AuthScreen from '@/components/AuthScreen';
import KakaoLoginButton from '@/components/KakaoLoginButton';
import AppButton from '@/components/ui/AppButton';
import { FormField } from '@/components/ui/AppTextInput';
import { authReturnHref, authReturnParams } from '@/src/utils/aiSearchEntry';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; prompt?: string | string[]; isbn?: string }>();
  const returnParams = authReturnParams(params.returnTo, params.prompt, params.isbn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch<AppDispatch>();


  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      customAlert('알림', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const result = await dispatch(signIn({ email, password }));
      
      if (signIn.fulfilled.match(result)) {
        customAlert('성공', '로그인되었습니다.', [
          { text: '확인', onPress: () => {
            const destination = authReturnHref(returnParams);
            if (destination === '/') router.replace(destination);
            else router.dismissTo(destination);
          } }
        ]);
      } else {
        customAlert('로그인 실패', '이메일 또는 비밀번호를 확인해주세요.');
      }
    } catch {
      customAlert('오류', '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen title="로그인" description={returnParams.returnTo === 'book-detail' ? '로그인하면 보던 책으로 돌아가 서재에 담을 수 있어요.' : '다시 찾아주셔서 감사합니다'}>
      <KakaoLoginButton returnParams={returnParams} disabled={loading} />
      <FormField label="이메일" placeholder="이메일 주소" value={email} onChangeText={setEmail}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
      <FormField label="비밀번호" placeholder="비밀번호" value={password} onChangeText={setPassword}
        secureTextEntry autoCapitalize="none" autoComplete="current-password" onSubmitEditing={() => { if (!loading) void handleLogin(); }} />
      <AppButton title="로그인" onPress={handleLogin} loading={loading} />
      <AppButton title="계정이 없으신가요? 회원가입" variant="ghost" onPress={() => router.push({ pathname: '/auth/register', params: returnParams })} />
      <AppButton title="홈으로 돌아가기" variant="ghost" onPress={() => router.replace('/')} />
    </AuthScreen>
  );
}
