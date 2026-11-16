import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';

import { StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';

export const getBookDetailScreenStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];

  return StyleSheet.create({
    container: { backgroundColor: c.background, paddingBottom: 60 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background, padding: SCREEN_LAYOUT.gutter },
    coverSection: { backgroundColor: c.background, paddingTop: 32, paddingBottom: 28, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.line },
    cover: { width: 130, height: 186, borderRadius: 0 },
    coverPlaceholder: { backgroundColor: c.surface2 },
    titleSection: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: 24, paddingBottom: Spacing.lg, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.background },
    title: { ...Typography.display, color: c.text, fontStyle: Platform.OS === 'android' ? 'normal' : 'italic', letterSpacing: -0.5, marginBottom: 10 },
    meta: { ...Typography.caption, color: c.inkSoft, letterSpacing: 0.15, textTransform: 'uppercase' },
    descriptionSection: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.background },
    sectionLabel: { ...Typography.label, letterSpacing: 0.2, textTransform: 'uppercase', color: c.inkSoft, marginBottom: 12 },
    sectionMark: { fontSize: 20, fontFamily: 'NotoSerifKR-Regular', color: c.inkFaint, fontStyle: Platform.OS === 'android' ? 'normal' : 'italic', lineHeight: 26 },
    description: { ...Typography.body, color: c.text, marginTop: 6 },
    statusSection: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.background },
    statusLabel: { ...Typography.label, letterSpacing: 0.2, textTransform: 'uppercase', color: c.inkSoft, marginBottom: 12 },
    segmentedControl: { flexDirection: 'row', borderWidth: 1, borderColor: c.text, borderRadius: UI.controlRadius, overflow: 'hidden' },
    segmentButton: { paddingVertical: 10, alignItems: 'center', backgroundColor: c.background, flex: 1, borderRadius: 0, paddingHorizontal: Spacing.xs, minHeight: UI.controlHeight },
    segmentDivider: { width: 1, backgroundColor: c.text },
    reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: 28, paddingBottom: 16, backgroundColor: c.background, alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
    reviewSectionTitle: { ...Typography.section, color: c.text, letterSpacing: -0.3 },
    sortContainer: { flexDirection: 'row', gap: Spacing.xs },
    reviewDividerTop: { height: 2, backgroundColor: c.text, marginHorizontal: SCREEN_LAYOUT.gutter },
    reviewDivider: { height: 1, backgroundColor: c.line, marginHorizontal: SCREEN_LAYOUT.gutter },
    reviewItem: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 18, backgroundColor: c.background },
    reviewItemOwn: { backgroundColor: c.surface2 },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    reviewAuthor: { ...Typography.label, color: c.text, letterSpacing: 0.1 },
    reviewRating: { ...Typography.label, color: c.star, letterSpacing: 2 },
    reviewCommentText: { ...Typography.body, color: c.text },
    reviewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
    reviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    reviewDate: { ...Typography.caption, color: c.inkSoft, letterSpacing: 0.1 },
    noReviews: { ...Typography.body, textAlign: 'center', color: c.inkSoft, marginHorizontal: SCREEN_LAYOUT.gutter, marginVertical: 28 },
    reviewInputContainer: { marginHorizontal: SCREEN_LAYOUT.gutter, marginTop: 24, marginBottom: 40, borderTopWidth: 2, borderTopColor: c.text, paddingTop: 20, backgroundColor: c.background },
    editingBanner: { flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: c.line, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, backgroundColor: c.surface2, alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
    editingBannerText: { ...Typography.label, color: c.inkSoft },
    reviewInput: { padding: 12, textAlignVertical: 'top', backgroundColor: c.background, fontFamily: 'NotoSerifKR-Regular', color: c.text, minHeight: 112, maxHeight: 180, fontSize: Typography.input.fontSize, lineHeight: Typography.input.lineHeight, borderRadius: UI.controlRadius },
    reviewCharCount: { ...Typography.caption, textAlign: 'right', color: c.inkSoft, marginBottom: 14, letterSpacing: 0.1 },
    ratingWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    ratingTouchArea: { paddingHorizontal: 4, paddingVertical: 4, minWidth: UI.iconButtonSize, minHeight: UI.iconButtonSize, alignItems: 'center', justifyContent: 'center' },
    starEmpty: { fontSize: 24, color: c.line, lineHeight: 30 },
    starFilled: { fontSize: 24, color: c.star, lineHeight: 30 },
    loginPrompt: { ...Typography.body, color: c.inkSoft, textAlign: 'center', marginVertical: 20 },
  });
};
