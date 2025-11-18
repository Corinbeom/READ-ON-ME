import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { Provider } from 'react-redux';

import { useColorScheme } from '@/hooks/useColorScheme';
import { store } from '../src/store';
import { Colors } from '@/constants/Colors';
import { ThemedView } from '@/components/ThemedView';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'NotoSerifKR-Regular': require('../assets/fonts/NotoSerifKR-Variable.ttf'),
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
              headerBackTitle: '',              // ← 뒤로가기 텍스트 제거
              headerBackButtonMenuEnabled: false, // ← iOS 메뉴도 제거(선택)
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemedView>
    </Provider>
  );
}