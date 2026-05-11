import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { Provider, useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/useColorScheme';
import { store, AppDispatch } from '../src/store';
import { Colors } from '@/constants/Colors';
import { ThemedView } from '@/components/ThemedView';
import NotificationListener from '@/components/NotificationListener';
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
  }, []);
  return null;
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'NotoSerifKR-Regular': require('../assets/fonts/NotoSerifKR-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  const colors = Colors[colorScheme];

  return (
    <Provider store={store}>
      <ThemedView style={{ flex: 1 }}>
        <SessionRestorer />
        <NotificationListener />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.card,
            },
            headerTintColor: colors.text,
            headerTitleStyle: {
              fontFamily: 'Pretendard-SemiBold',
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
    </Provider>
  );
}
