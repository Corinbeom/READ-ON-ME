import { FontDisplay, useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import 'react-native-reanimated';
import { Provider, useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/useColorScheme';
import { store, AppDispatch } from '../src/store';
import { Colors } from '@/constants/Colors';
import { ThemedView } from '@/components/ThemedView';
import NotificationListener from '@/components/NotificationListener';
import WebAlertHost from '@/components/WebAlertHost';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { Typography } from '@/src/styles/designTokens';
import { getProfile, setToken, logout } from '@/src/store/authSlice';

function SessionRestorer() {
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    const restoreSession = async () => {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) return;
      dispatch(setToken(token));
      const result = await dispatch(getProfile(token));
      if (getProfile.rejected.match(result)) {
        // Token is invalid/expired — clear everything silently
        dispatch(logout());
      }
    };
    restoreSession();
  }, [dispatch]);
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
          <Stack.Screen name="auth/register" options={{ title: '회원가입' }} />
          <Stack.Screen name="ai-books" options={{ headerShown: false }} />
          <Stack.Screen name="reading-keywords" options={{ headerShown: false, title: '요즘 내가 읽는 세계' }} />
          <Stack.Screen
            name="book/[isbn]"
            options={{
              title: '',
              headerBackTitle: ' ',
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemedView>
      </View>
    </Provider>
  );
}
