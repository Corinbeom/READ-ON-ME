import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';

export function getLibraryShelfStyles(theme: 'light' | 'dark') {
  const c = Colors[theme];
  return StyleSheet.create({
    shelf: { paddingTop: Spacing.lg, paddingBottom: Spacing.xs },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, paddingHorizontal: SCREEN_LAYOUT.gutter, marginBottom: Spacing.sm },
    heading: { flexDirection: 'row', alignItems: 'baseline', flex: 1, gap: Spacing.xs },
    title: { ...Typography.section, color: c.text, flexShrink: 1 },
    count: { ...Typography.caption, color: c.inkSoft },
    books: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingBottom: Spacing.xs, gap: Spacing.md },
    book: { width: 112, minHeight: UI.controlHeight },
    cover: { width: 104, height: 148, backgroundColor: c.surface2 },
    placeholder: { alignItems: 'center', justifyContent: 'center' },
    coverLabel: { ...Typography.caption, color: c.inkSoft },
    bookTitle: { ...Typography.label, fontFamily: 'NotoSerifKR-Regular', color: c.text, marginTop: Spacing.xs, minHeight: 40 },
    author: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.xxs },
    discovery: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.md },
    discoveryTitle: { ...Typography.title, color: c.text, textAlign: 'center' },
    description: { ...Typography.body, color: c.inkSoft, textAlign: 'center' },
    actions: { alignSelf: 'stretch', gap: Spacing.sm },
    compact: { marginTop: Spacing.md, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, gap: Spacing.sm },
    compactTitle: { ...Typography.label, color: c.inkSoft },
    compactActions: { flexDirection: 'row', gap: Spacing.xs },
    compactAction: { flex: 1, paddingHorizontal: Spacing.xs },
  });
}
