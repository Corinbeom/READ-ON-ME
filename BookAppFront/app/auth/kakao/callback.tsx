import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { useDispatch } from 'react-redux';
import AuthScreen from '@/components/AuthScreen';
import AppButton from '@/components/ui/AppButton';
import type { AppDispatch } from '@/src/store';
import { signInWithKakao } from '@/src/store/authSlice';
import { authReturnHref, authReturnParams } from '@/src/utils/aiSearchEntry';
import { consumeKakaoCallback } from '@/src/utils/kakaoLogin';

type CallbackResult = {
  returnParams: ReturnType<typeof authReturnParams>;
  failure?: string;
};

async function completeCallback(dispatch: AppDispatch): Promise<CallbackResult> {
  const expired = { returnParams: {}, failure: '로그인 요청이 만료됐어요. 다시 시작해주세요.' };
  if (Platform.OS !== 'web') return expired;

  const search = window.location.search;
  window.history.replaceState(window.history.state, '', window.location.pathname);
  const callback = consumeKakaoCallback(window.sessionStorage, search);
  if (!callback) return expired;
  const { returnParams, exchange, cancelled } = callback;
  if (!exchange) {
    return { returnParams, failure: cancelled ? '카카오 로그인을 취소했어요.' : '카카오 인증을 완료할 수 없어요.' };
  }
  try {
    await dispatch(signInWithKakao(exchange)).unwrap();
    return { returnParams };
  } catch {
    return { returnParams, failure: '카카오 로그인에 실패했어요. 다시 시도해주세요.' };
  }
}

export default function KakaoCallbackScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const request = useRef<Promise<CallbackResult> | null>(null);
  const [error, setError] = useState<CallbackResult | null>(null);

  useEffect(() => {
    let active = true;
    request.current ??= completeCallback(dispatch);
    void request.current.then(result => {
      if (!active) return;
      if (result.failure) setError(result);
      else router.replace(authReturnHref(result.returnParams));
    }).catch(() => {
      if (active) setError({ returnParams: {}, failure: '로그인 정보를 불러올 수 없어요. 다시 시도해주세요.' });
    });
    return () => { active = false; };
  }, [dispatch]);

  return (
    <AuthScreen title="카카오 로그인" description={error?.failure ?? '로그인하고 원래 화면으로 돌아가는 중이에요.'}>
      {error ? (
        <AppButton title="로그인 화면으로 돌아가기" onPress={() => router.replace({ pathname: '/auth/login', params: error.returnParams })} />
      ) : <ActivityIndicator accessibilityLabel="카카오 로그인 처리 중" />}
    </AuthScreen>
  );
}
