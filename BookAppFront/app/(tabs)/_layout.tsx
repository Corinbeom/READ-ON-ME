import { Tabs } from 'expo-router';
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

function EdTabIcon({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  return (
    <View style={styles.tabItem}>
      {focused && <View style={[styles.tabLine, { backgroundColor: color }]} />}
      <Text style={[styles.tabLabel, { color, fontWeight: focused ? '600' : '400' }]}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          height: Platform.OS === 'ios' ? 80 : 60,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <EdTabIcon label="홈" focused={focused} color={color} />
          ),
          tabBarActiveTintColor: colors.tabIconSelected,
          tabBarInactiveTintColor: colors.tabIconDefault,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <EdTabIcon label="검색" focused={focused} color={color} />
          ),
          tabBarActiveTintColor: colors.tabIconSelected,
          tabBarInactiveTintColor: colors.tabIconDefault,
        }}
      />
      <Tabs.Screen
        name="my-library"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <EdTabIcon label="서재" focused={focused} color={color} />
          ),
          tabBarActiveTintColor: colors.tabIconSelected,
          tabBarInactiveTintColor: colors.tabIconDefault,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    width: 60,
  },
  tabLine: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 1,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.14,
    marginTop: 4,
    fontFamily: 'Pretendard-SemiBold',
  },
});
