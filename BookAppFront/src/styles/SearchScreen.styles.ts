import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing, Typography, UI } from './designTokens';
import { SCREEN_LAYOUT } from './screenLayout';

export function getSearchScreenStyles(theme: 'light' | 'dark') {
  const c = Colors[theme];
  return StyleSheet.create({
    searchSection: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: c.line },
    searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.line, borderRadius: UI.controlRadius, overflow: 'hidden', backgroundColor: c.card },
    searchInput: { flex: 1 },
    searchButton: { borderRadius: 0 },
    clearInput: { width: UI.iconButtonSize, minHeight: UI.controlHeight, alignItems: 'center', justifyContent: 'center' },
    list: { flex: 1 },
    content: { paddingBottom: SCREEN_LAYOUT.bottomPadding },
    section: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg },
    sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs, marginBottom: Spacing.xs },
    sectionTitle: { ...Typography.section, color: c.text, flexShrink: 1 },
    intro: { ...Typography.body, color: c.inkSoft, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg },
    historyRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.line },
    historySearch: { flex: 1, minHeight: UI.controlHeight, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs, paddingRight: Spacing.xs },
    historyText: { ...Typography.body, color: c.text, flex: 1 },
    historyDelete: { width: UI.iconButtonSize, minHeight: UI.controlHeight, alignItems: 'center', justifyContent: 'center' },
    historyError: { ...Typography.caption, color: c.inkSoft, paddingHorizontal: SCREEN_LAYOUT.gutter, marginTop: Spacing.sm },
    aiCard: { marginHorizontal: SCREEN_LAYOUT.gutter, marginTop: Spacing.lg, padding: Spacing.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: UI.cardRadius, gap: Spacing.md },
    aiHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    aiCopy: { flex: 1 },
    aiDescription: { ...Typography.body, color: c.inkSoft },
    aiExamples: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    aiExample: { paddingHorizontal: Spacing.sm },
    bookItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.md },
    thumbnail: { width: 52, height: 74, backgroundColor: c.surface2 },
    bookInfo: { flex: 1, marginLeft: Spacing.md },
    title: { ...Typography.bookTitle, color: c.text, marginBottom: Spacing.xxs },
    authors: { ...Typography.caption, color: c.inkSoft },
    chevron: { ...Typography.label, color: c.inkSoft, marginLeft: Spacing.xs },
    divider: { height: 1, backgroundColor: c.line, marginHorizontal: SCREEN_LAYOUT.gutter },
    refreshRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    refreshText: { ...Typography.caption, color: c.inkSoft, flex: 1 },
    resultLabel: { ...Typography.caption, color: c.inkSoft, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    previewHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    previewHint: { ...Typography.caption, color: c.inkSoft, flex: 1 },
    suggestionItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.sm, minHeight: 64 },
    suggestionThumbnail: { width: 28, height: 40, backgroundColor: c.surface2, marginRight: Spacing.sm },
    suggestionTitle: { ...Typography.label, color: c.text },
    suggestionAuthor: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.xxs },
  });
}
