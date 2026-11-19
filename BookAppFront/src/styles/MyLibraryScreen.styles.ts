import { Spacing, Typography, UI } from '@/src/styles/designTokens';

import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { SCREEN_LAYOUT } from './screenLayout';

export const getMyLibraryScreenStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingBottom: SCREEN_LAYOUT.bottomPadding },
    headerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.xxs },
    statsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.background },
    statItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, minHeight: 80 },
    statDivider: { width: 1, backgroundColor: c.line, marginVertical: 16 },
    statCount: { ...Typography.title, color: c.text, letterSpacing: -0.5 },
    statLabel: { ...Typography.caption, letterSpacing: 0.2, textTransform: 'uppercase', color: c.inkSoft, marginTop: Spacing.xxs },
    retryNotice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.md, backgroundColor: c.surface2 },
    retryText: { ...Typography.body, color: c.inkSoft, flex: 1 },
    reviewsSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.background },
    reviewsSummaryLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    reviewsSummaryCount: { ...Typography.section, color: c.text },
    reviewsSummaryLabel: { ...Typography.label, textTransform: 'uppercase', color: c.inkSoft, letterSpacing: 0.2 },
    reviewsSummaryArrow: { ...Typography.caption, color: c.inkSoft, letterSpacing: 0.1 },
    sectionHeader: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: 28, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.background, gap: Spacing.sm, alignItems: 'center' },
    sectionTitle: { ...Typography.section, color: c.text, letterSpacing: -0.3, flexShrink: 1 },
    sectionDividerTop: { height: 2, backgroundColor: c.text, marginHorizontal: SCREEN_LAYOUT.gutter },
    sectionDivider: { height: 1, backgroundColor: c.line, marginHorizontal: SCREEN_LAYOUT.gutter },
    notificationHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    notificationBadge: { ...Typography.caption, color: c.inkSoft, letterSpacing: 0.1 },
    notificationItem: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: c.background, minHeight: UI.controlHeight },
    notificationUnreadItem: { backgroundColor: c.surface2 },
    notificationUnreadDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.text, marginRight: 12, flexShrink: 0 },
    notificationCopy: { flex: 1 },
    notificationMessage: { ...Typography.body, color: c.text },
    notificationMeta: { ...Typography.caption, color: c.inkSoft, marginTop: 4, letterSpacing: 0.1 },
    reviewItemContainer: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.background },
    reviewBookThumbnail: { width: 48, height: 68, borderRadius: 0, backgroundColor: c.surface2, marginRight: 14 },
    reviewInfoContainer: { flex: 1 },
    reviewItemTitle: { ...Typography.label, color: c.text, marginBottom: 4, letterSpacing: 0.05 },
    reviewItemRating: { ...Typography.caption, color: c.star, letterSpacing: 2, marginBottom: 6 },
    reviewItemComment: { ...Typography.body, color: c.inkSoft },
    emptySectionText: { ...Typography.body, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 20, color: c.inkSoft },
    loadingText: { ...Typography.body, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 20, color: c.inkSoft },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
    modalContent: { backgroundColor: c.card, borderTopWidth: 2, borderTopColor: c.text, maxHeight: '80%', maxWidth: SCREEN_LAYOUT.maxWidth, width: '100%', alignSelf: 'center', borderTopLeftRadius: UI.dialogRadius, borderTopRightRadius: UI.dialogRadius },
    modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.line, alignItems: 'center', gap: Spacing.sm },
    modalTitle: { ...Typography.section, color: c.text, letterSpacing: -0.3, flexShrink: 1 },
    modalBookListContent: { padding: 16 },
    modalReviewListContent: { paddingVertical: Spacing.xs },
    bookActions: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.lg, gap: Spacing.sm },
    actionDescription: { ...Typography.body, color: c.inkSoft },
    bookItemContainer: { flex: 1, margin: 8, alignItems: 'center' },
  });
};
