import { FontDisplay, useFonts } from 'expo-font';
import { router, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform, View } from 'react-native';
import 'react-native-reanimated';
import { Provider, useDispatch, useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/useColorScheme';
import { store, AppDispatch, RootState } from '../src/store';
import { Colors } from '@/constants/Colors';
import { ThemedView } from '@/components/ThemedView';
import NotificationListener from '@/components/NotificationListener';
import AppButton from '@/components/ui/AppButton';
import WebAlertHost from '@/components/WebAlertHost';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { Typography } from '@/src/styles/designTokens';
import { getProfile, setToken, logout } from '@/src/store/authSlice';

import { observeSessionExpiry } from '@/src/services/api';
import { authReturnParams } from '@/src/utils/aiSearchEntry';
import { sessionExpiresAt } from '@/src/utils/sessionExpiry';
import customAlert from '@/src/utils/alert';

function HomeHeaderButton() {
  return <AppButton title="홈으로" variant="ghost" onPress={() => router.replace('/')} />;
}

function SessionRestorer() {
  const dispatch = useDispatch<AppDispatch>();
  const { token, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const path = usePathname();
  const { prompt, tags } = useGlobalSearchParams();
  const route = useRef({ path, prompt, tags });
  useEffect(() => { route.current = { path, prompt, tags }; }, [path, prompt, tags]);

  const expire = useCallback((rejectedToken: string) => {
    if (store.getState().auth.token !== rejectedToken) return;
    const { path, prompt, tags } = route.current;
    const book = path.match(/^\/book\/([^/]+)$/);
    const params = authReturnParams(book ? 'book-detail' : path.slice(1), prompt, book?.[1], tags);
    dispatch(logout());
    if (path.startsWith('/auth/')) return;
    customAlert('다시 로그인해주세요', '로그인 세션이 만료되었어요.', [
      { text: '나중에', style: 'cancel' },
      { text: '로그인하기', onPress: () => {
        if (!store.getState().auth.token) router.push({ pathname: '/auth/login', params });
      } },
    ]);
  }, [dispatch]);

  useEffect(() => observeSessionExpiry(expire), [expire]);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem('accessToken').then(saved => {
      if (active && saved && !store.getState().auth.token) dispatch(setToken(saved));
    });
    return () => { active = false; };
  }, [dispatch]);

  useEffect(() => {
    if (!token) return;
    const end = sessionExpiresAt(token);
    if (end === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      const remaining = end - Date.now();
      if (remaining <= 0) {
        if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') expire(token);
      } else {
        timer = setTimeout(check, Math.min(remaining, 2147483647));
      }
    };
    check();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [token, expire]);

  useEffect(() => {
    if (!token || isAuthenticated || store.getState().auth.token !== token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const restore = async () => {
      const result = await dispatch(getProfile(token));
      if (!active || store.getState().auth.token !== token || !getProfile.rejected.match(result)) return;
      if (result.payload === 401 || result.payload === 403) expire(token);
      else timer = setTimeout(restore, 30000);
    };
    void restore();
    return () => { active = false; clearTimeout(timer); };
  }, [dispatch, token, isAuthenticated, expire]);
  return null;
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const [loaded, fontError] = useFonts({
    SpaceMono: { uri: require('../assets/fonts/SpaceMono-Regular.ttf'), display: FontDisplay.SWAP },
    'Pretendard-SemiBold': { uri: require('../assets/fonts/Pretendard-SemiBold.otf'), display: FontDisplay.SWAP },
    'NotoSerifKR-Regular': { uri: require('../assets/fonts/NotoSerifKR-Regular.ttf'), display: FontDisplay.SWAP },
  });

  useEffect(() => {
    if (Platform.OS === 'web' || loaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [loaded, fontError]);

  useEffect(() => {
    if (fontError) console.warn('Custom fonts could not load; using system fonts.');
  }, [fontError]);

  // Web must remain usable while fonts download. Native keeps its splash
  // until fonts finish, and can continue with system fonts if loading fails.
  if (Platform.OS !== 'web' && !loaded && !fontError) {
    return null;
  }

  const colors = Colors[colorScheme];

  return (
    <Provider store={store}>
      <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <ThemedView style={[{ flex: 1 }, Platform.OS === 'web' && { width: '100%', maxWidth: SCREEN_LAYOUT.maxWidth, alignSelf: 'center' }]}>
        <SessionRestorer />
        <NotificationListener />
        <WebAlertHost />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerTitleStyle: {
              fontFamily: Typography.section.fontFamily,
              fontSize: Typography.section.fontSize,
            },
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              title: '',         // ★★★ 이게 있어야 '이전 화면 title = (tabs)' 가 사라짐
              headerBackTitle: '', // 안전하게 back title도 제거
            }}
          />
          <Stack.Screen name="auth/login" options={{ title: '로그인' }} />
          <Stack.Screen name="auth/kakao/callback" options={{ title: '카카오 로그인', headerBackVisible: false }} />
          <Stack.Screen name="auth/register" options={{ title: '회원가입' }} />
          <Stack.Screen name="ai-books" options={{ headerShown: false }} />
          <Stack.Screen name="reading-keywords" options={{ headerShown: false, title: '요즘 내가 읽는 세계' }} />
          <Stack.Screen name="notifications/index" options={({ navigation }) => ({
            title: '알림',
            headerLeft: navigation.canGoBack() ? undefined : () => <HomeHeaderButton />,
          })} />
          <Stack.Screen name="feedback" options={({ navigation }) => ({
            title: '의견 보내기',
            headerLeft: navigation.canGoBack() ? undefined : () => <HomeHeaderButton />,
          })} />
          <Stack.Screen name="operations" options={({ navigation }) => ({
            title: '서비스 운영',
            headerLeft: navigation.canGoBack() ? undefined : () => <HomeHeaderButton />,
          })} />
          <Stack.Screen
            name="book/[isbn]"
            options={({ navigation }) => ({
              title: '',
              headerBackTitle: ' ',
              headerLeft: navigation.canGoBack() ? undefined : () => <HomeHeaderButton />,
            })}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemedView>
      </View>
    </Provider>
  );
}
