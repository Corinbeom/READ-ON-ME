import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';

export default function TabScreen({ children, testID }: { children: ReactNode; testID: string }) {
  const colorScheme = useColorScheme() ?? 'light';
  return (
    <SafeAreaView
      testID={testID}
      style={[styles.screen, { backgroundColor: Colors[colorScheme].background }]}
      edges={['top', 'left', 'right']}
    >
      {children}
    </SafeAreaView>
  );
}

export function TabHeader({ title, children }: { title: string; children?: ReactNode }) {
  const colorScheme = useColorScheme() ?? 'light';
  return (
    <View testID="tab-header" style={styles.header}>
      <Text style={[styles.title, { color: Colors[colorScheme].text }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingTop: Platform.OS === 'web' ? 40 : 16,
    paddingHorizontal: SCREEN_LAYOUT.gutter,
    paddingBottom: SCREEN_LAYOUT.headerBottomPadding,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    flexShrink: 0,
    fontSize: SCREEN_LAYOUT.headerFontSize,
    lineHeight: SCREEN_LAYOUT.headerLineHeight,
    fontFamily: 'NotoSerifKR-Regular',
    fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
    letterSpacing: -0.5,
  },
});
