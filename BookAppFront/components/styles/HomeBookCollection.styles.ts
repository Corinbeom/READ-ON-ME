import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing, Typography } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';

export function getHomeBookCollectionStyles(theme: 'light' | 'dark') {
  const c = Colors[theme];
  return StyleSheet.create({
    section: { marginHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg, paddingBottom: Spacing.lg, borderBottomWidth: 1, borderBottomColor: c.line },
    eyebrow: { ...Typography.caption, color: c.inkSoft, marginBottom: Spacing.xs },
    title: { ...Typography.section, color: c.text },
    description: { ...Typography.body, color: c.inkSoft, marginTop: Spacing.xs, marginBottom: Spacing.md },
    books: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'stretch' },
    book: { flex: 1, minWidth: 0 },
    coverFrame: { width: '100%', maxWidth: 132, alignSelf: 'center', borderWidth: 2, borderColor: 'transparent', padding: 3 },
    selectedCover: { borderColor: c.text },
    cover: { width: '100%', aspectRatio: 110 / 158, backgroundColor: c.surface2 },
    placeholder: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xs },
    placeholderText: { ...Typography.caption, color: c.inkSoft, textAlign: 'center' },
    selectionLabel: { ...Typography.caption, color: c.inkSoft, height: Typography.caption.lineHeight, marginTop: Spacing.xxs },
    angle: { ...Typography.compactLabel, color: c.text, marginTop: Spacing.xxs },
    bookTitle: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.xxs },
    selection: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: c.line },
    selectionTitle: { ...Typography.bookTitle, color: c.text },
    author: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.xxs },
    invitation: { ...Typography.body, color: c.inkSoft, marginTop: Spacing.xs, minHeight: Typography.body.lineHeight * 3 },
    detailAction: { alignSelf: 'flex-start', paddingHorizontal: 0 },
    primaryAction: { marginTop: Spacing.sm },
    basis: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.sm },
  });
}
