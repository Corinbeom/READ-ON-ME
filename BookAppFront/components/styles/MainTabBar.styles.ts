import { Platform, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing, UI } from '@/src/styles/designTokens';

export function getMainTabBarStyles(scheme: 'light' | 'dark', insets: { bottom: number; left: number; right: number }) {
  const c = Colors[scheme];
  return StyleSheet.create({
    space: {
      backgroundColor: c.background,
      paddingTop: Spacing.xs,
      paddingBottom: insets.bottom + Spacing.sm,
      paddingLeft: Math.max(Spacing.md, insets.left),
      paddingRight: Math.max(Spacing.md, insets.right),
    },
    bar: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      flexDirection: 'row',
      padding: Spacing.xxs,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 20,
      backgroundColor: c.card,
      ...Platform.select({
        web: { boxShadow: `0 4px 16px rgba(0, 0, 0, ${scheme === 'dark' ? 0.24 : 0.08})` },
        default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: scheme === 'dark' ? 0.24 : 0.08, shadowRadius: 12, elevation: 4 },
      }),
    },
    target: { flex: 1, minHeight: UI.tabHeight, paddingHorizontal: Spacing.xxs, paddingVertical: Spacing.xxs },
    content: { pointerEvents: 'none', flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: Spacing.xxs, borderRadius: 14, borderWidth: 2 },
  });
}
