import { useState, type KeyboardEvent } from 'react';
import { Platform, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useLinkBuilder } from '@react-navigation/native';
import { PlatformPressable } from '@react-navigation/elements';
import { BookOpen, House, Search } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Typography } from '@/src/styles/designTokens';
import { getMainTabBarStyles } from '@/components/styles/MainTabBar.styles';

const tabs = {
  index: { label: '홈', icon: House },
  search: { label: '검색', icon: Search },
  'my-library': { label: '서재', icon: BookOpen },
} as const;

export default function MainTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const styles = getMainTabBarStyles(scheme, insets);
  const { buildHref } = useLinkBuilder();
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  return (
    <View testID="main-tab-bar-space" style={styles.space}>
      <View testID="main-tab-bar" role="tablist" accessibilityLabel="주 메뉴" style={styles.bar}>
        {state.routes.map((route, index) => {
          const item = tabs[route.name as keyof typeof tabs];
          if (!item) return null;
          const selected = state.index === index;
          const Icon = item.icon;
          const color = selected ? c.text : c.inkSoft;
          return (
            <PlatformPressable key={route.key} role="tab" accessibilityLabel={item.label}
              accessibilityState={{ selected }} aria-selected={selected} testID={`main-tab-${route.name}`}
              href={buildHref(route.name, route.params)} style={styles.target} pressOpacity={0.7}
              {...(Platform.OS === 'web' ? { onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                // Anchors activate with Enter; role=tab also needs Space activation.
                if (event.key === ' ') { event.preventDefault(); event.currentTarget.click(); }
              } } : {})}
              onFocus={() => setFocusedKey(route.key)} onBlur={() => setFocusedKey(null)}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}>
              <View style={[styles.content, {
                backgroundColor: selected ? c.surface2 : 'transparent',
                borderColor: focusedKey === route.key ? c.text : 'transparent',
              }]}>
                <Icon size={22} color={color} strokeWidth={selected ? 2 : 1.6} aria-hidden />
                <Text style={[Typography.compactLabel, { color }]}>{item.label}</Text>
              </View>
            </PlatformPressable>
          );
        })}
      </View>
    </View>
  );
}
