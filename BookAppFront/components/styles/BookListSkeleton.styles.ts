import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';

export function getBookListSkeletonStyles(theme: 'light' | 'dark') {
  const c = Colors[theme];
  return StyleSheet.create({
    outer: { overflow: 'hidden', pointerEvents: 'none' },
    bone: { backgroundColor: c.line, borderRadius: 3 },
    cards: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingBottom: Spacing.xs },
    card: { width: 120, flexShrink: 0 },
    cover: { width: 110, height: 158, marginBottom: Spacing.xs, borderRadius: 0 },
    titleLines: { height: 40, justifyContent: 'center', gap: Spacing.xs },
    line: { width: '90%', height: 10 },
    shortLine: { width: '65%', height: 10 },
    authorLine: { width: '55%', height: 10, marginTop: 8, marginBottom: 4 },
    resultsHeading: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg, paddingBottom: Spacing.sm, height: Spacing.lg + Spacing.sm + Typography.caption.lineHeight, justifyContent: 'center' },
    headingLine: { width: 112, height: 16 },
    resultCount: { width: 72, height: 10 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.md },
    rowCover: { width: 52, height: 74, borderRadius: 0 },
    rowText: { flex: 1, marginLeft: Spacing.md, gap: Spacing.sm },
    rowTitle: { width: '85%', height: 14 },
    rowAuthor: { width: '45%', height: 10 },
    rowDivider: { marginHorizontal: SCREEN_LAYOUT.gutter, height: 1, backgroundColor: c.line },
    stats: { flexDirection: 'row', height: 81, borderBottomWidth: 1, borderBottomColor: c.line },
    stat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
    statCount: { width: 24, height: 24 },
    statLabel: { width: 48, height: 10 },
    shelf: { paddingTop: Spacing.lg, paddingBottom: Spacing.xs },
    shelfHeading: { minHeight: UI.compactControlHeight, marginBottom: Spacing.sm, paddingHorizontal: SCREEN_LAYOUT.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    allBooksLine: { width: 56, height: 12 },
    libraryCard: { width: 112, flexShrink: 0 },
    libraryCover: { width: 104, height: 148, marginBottom: Spacing.xs, borderRadius: 0 },
  });
}
