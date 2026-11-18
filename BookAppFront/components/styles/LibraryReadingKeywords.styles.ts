import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';

export function getLibraryReadingKeywordsStyles(theme: 'light' | 'dark') {
  const c = Colors[theme];
  return StyleSheet.create({
    section: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: c.line, gap: Spacing.sm },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs },
    title: { ...Typography.section, color: c.text },
    caption: { ...Typography.caption, color: c.inkSoft },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    chip: { maxWidth: '100%' },
    cloud: { borderTopWidth: 1, borderTopColor: c.line, paddingVertical: Spacing.sm },
    cloudRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: Spacing.sm },
    cloudWord: { minWidth: UI.iconButtonSize, minHeight: UI.compactControlHeight, maxWidth: '100%', paddingHorizontal: Spacing.xs,
      paddingVertical: Spacing.xxs, borderRadius: UI.controlRadius, alignItems: 'center', justifyContent: 'center' },
    cloudWordFocused: { backgroundColor: c.surface2 },
    cloudLabel: { ...Typography.bookTitle, color: c.inkSoft, textAlign: 'center' },
    cloudMainLabel: { color: c.text, letterSpacing: -0.5 },
    body: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.md, gap: Spacing.md },
    books: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
    preview: { width: '100%', maxWidth: 340, alignSelf: 'center', aspectRatio: 1, backgroundColor: c.surface2 },
    error: { ...Typography.caption, color: c.danger },
  });
}
