import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { authApi } from '@/src/services/api';
import { Spacing, UI } from '@/src/styles/designTokens';
import type { authReturnParams } from '@/src/utils/aiSearchEntry';
import customAlert from '@/src/utils/alert';
import { createKakaoVerifier, isKakaoStartForOrigin, loadKakaoSdk, saveKakaoFlow } from '@/src/utils/kakaoLogin';

type ReturnParams = ReturnType<typeof authReturnParams>;

async function prepareKakao(signal: AbortSignal) {
  const startedAt = Date.now();
  const { verifier, challenge } = await createKakaoVerifier();
  const { data, status } = await authApi.startKakao(challenge, signal);
  if (status === 204 || signal.aborted || !data || !isKakaoStartForOrigin(data, window.location.origin)) return null;
  const sdk = await loadKakaoSdk();
  if (signal.aborted) return null;
  if (!sdk.isInitialized()) sdk.init(data.javascript_key);
  return { sdk, data, verifier, expiresAt: startedAt + data.expires_in_seconds * 1000 };
}

export default function KakaoLoginButton({ returnParams, disabled }: { returnParams: ReturnParams; disabled: boolean }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [ready, setReady] = useState<Awaited<ReturnType<typeof prepareKakao>>>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const controller = new AbortController();
    void prepareKakao(controller.signal).then(prepared => {
      if (!controller.signal.aborted) setReady(prepared);
    }).catch(() => {
      if (!controller.signal.aborted) setReady(null);
    });
    return () => controller.abort();
  }, [attempt]);

  if (!ready) return null;

  const start = () => {
    if (ready.expiresAt <= Date.now() + 5000) {
      setReady(null);
      setAttempt(value => value + 1);
      customAlert('카카오 로그인', '로그인을 다시 준비하고 있어요. 버튼이 나타나면 눌러주세요.');
      return;
    }
    try {
      saveKakaoFlow(window.sessionStorage, {
        state: ready.data.state, verifier: ready.verifier, expiresAt: ready.expiresAt, returnParams,
      });
      ready.sdk.Auth.authorize({ redirectUri: ready.data.redirect_uri, state: ready.data.state, throughTalk: true });
    } catch {
      customAlert('카카오 로그인', '카카오 로그인을 시작할 수 없어요. 다시 시도해주세요.');
    }
  };

  return (
    <View style={[styles.section, { borderColor: colors.line }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="카카오 로그인"
        disabled={disabled} accessibilityState={{ disabled }} onPress={start}
        style={[styles.button, disabled && styles.disabled]}>
        <Image accessible={false} source={require('@/assets/images/kakao-login.png')} style={styles.image} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, paddingTop: Spacing.md },
  button: { width: '100%', maxWidth: 224, minHeight: UI.compactControlHeight, alignSelf: 'center', justifyContent: 'center' },
  image: { width: '100%', height: 46, resizeMode: 'contain' },
  disabled: { opacity: 0.45 },
});
