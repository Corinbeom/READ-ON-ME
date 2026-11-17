import { Tabs } from 'expo-router';
import MainTabBar from '@/components/navigation/MainTabBar';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <MainTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="search" options={{ title: '검색' }} />
      <Tabs.Screen name="my-library" options={{ title: '서재' }} />
    </Tabs>
  );
}
