
import { StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';

export const getBookDetailScreenStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];

  return StyleSheet.create({
    container: {
      backgroundColor: c.background,
      paddingBottom: 60,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },

    // ── Cover ─────────────────────────────────────────────
    coverSection: {
      backgroundColor: c.background,
      paddingTop: 32,
      paddingBottom: 28,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    cover: {
      width: 130,
      height: 186,
      borderRadius: 0,
    },
    coverPlaceholder: {
      backgroundColor: c.surface2,
    },

    // ── Title / Meta ───────────────────────────────────────
    titleSection: {
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 22,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: c.background,
    },
    title: {
      fontSize: 26,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      letterSpacing: -0.5,
      marginBottom: 10,
      lineHeight: 36,
    },
    meta: {
      fontSize: 11,
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      letterSpacing: 0.15,
      textTransform: 'uppercase',
    },

    // ── Description ────────────────────────────────────────
    descriptionSection: {
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 24,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: c.background,
    },
    sectionLabel: {
      fontSize: 10,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      marginBottom: 12,
    },
    sectionMark: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkFaint,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      lineHeight: 26,
    },
    description: {
      fontSize: 15,
      lineHeight: 26,
      color: c.text,
      fontFamily: 'NotoSerifKR-Regular',
      marginTop: 6,
    },
    descriptionToggle: {
      marginTop: 14,
      alignSelf: 'flex-start',
    },
    descriptionToggleText: {
      fontSize: 10,
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      letterSpacing: 0.15,
      textTransform: 'uppercase',
      textDecorationLine: 'underline',
    },

    // ── Status Segmented Control ───────────────────────────
    statusSection: {
      paddingHorizontal: 22,
      paddingVertical: 22,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: c.background,
    },
    statusLabel: {
      fontSize: 10,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      marginBottom: 12,
    },
    segmentedControl: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: c.text,
    },
    segmentButton: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: c.background,
    },
    segmentButtonActive: {
      backgroundColor: c.text,
    },
    segmentButtonText: {
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      color: c.text,
      letterSpacing: 0.1,
    },
    segmentButtonTextActive: {
      color: c.background,
    },
    segmentDivider: {
      width: 1,
      backgroundColor: c.text,
    },

    // ── Reviews Header ─────────────────────────────────────
    reviewHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: 22,
      paddingTop: 28,
      paddingBottom: 16,
      backgroundColor: c.background,
    },
    reviewSectionTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      letterSpacing: -0.3,
    },
    sortContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    sortButton: {},
    sortButtonActive: {},
    sortButtonText: {
      fontSize: 11,
      color: c.inkFaint,
      fontFamily: 'Pretendard-SemiBold',
      letterSpacing: 0.1,
    },
    sortButtonTextActive: {
      color: c.text,
      textDecorationLine: 'underline',
    },

    // ── Review Items ───────────────────────────────────────
    reviewDividerTop: {
      height: 2,
      backgroundColor: c.text,
      marginHorizontal: 22,
    },
    reviewDivider: {
      height: 1,
      backgroundColor: c.line,
      marginHorizontal: 22,
    },
    reviewItem: {
      paddingHorizontal: 22,
      paddingVertical: 18,
      backgroundColor: c.background,
    },
    reviewItemOwn: {
      backgroundColor: c.surface2,
    },
    reviewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    reviewAuthor: {
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 13,
      color: c.text,
      letterSpacing: 0.1,
    },
    reviewRating: {
      color: c.star,
      fontSize: 12,
      letterSpacing: 2,
    },
    reviewCommentText: {
      lineHeight: 22,
      color: c.text,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 14,
    },
    reviewFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
    },
    reviewDate: {
      color: c.inkFaint,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 10,
      letterSpacing: 0.1,
    },
    likeButton: {},
    likeText: {
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 11,
      letterSpacing: 0.05,
    },
    likeTextLiked: {
      color: c.text,
    },
    noReviews: {
      textAlign: 'center',
      color: c.inkSoft,
      fontFamily: 'NotoSerifKR-Regular',
      marginHorizontal: 22,
      marginVertical: 28,
      fontSize: 14,
      lineHeight: 22,
    },

    // ── Review Input ───────────────────────────────────────
    reviewInputContainer: {
      marginHorizontal: 22,
      marginTop: 24,
      marginBottom: 40,
      borderTopWidth: 2,
      borderTopColor: c.text,
      paddingTop: 20,
      backgroundColor: c.background,
    },
    editingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
      backgroundColor: c.surface2,
    },
    editingBannerText: {
      color: c.inkSoft,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 12,
    },
    cancelEditButton: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: c.line,
    },
    cancelEditButtonText: {
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.1,
    },
    reviewInputScrollWrapper: {
      maxHeight: 180,
      borderWidth: 1,
      borderColor: c.line,
      marginBottom: 8,
      backgroundColor: c.background,
    },
    reviewInput: {
      padding: 12,
      minHeight: 100,
      maxHeight: 180,
      textAlignVertical: 'top',
      backgroundColor: c.background,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontSize: 14,
    },
    reviewCharCount: {
      textAlign: 'right',
      fontSize: 10,
      color: c.inkFaint,
      marginBottom: 14,
      fontFamily: 'Pretendard-SemiBold',
      letterSpacing: 0.1,
    },
    ratingWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    ratingTouchArea: {
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    starEmpty: {
      fontSize: 24,
      color: c.line,
      lineHeight: 30,
    },
    starFilled: {
      fontSize: 24,
      color: c.star,
      lineHeight: 30,
    },
    submitButton: {
      backgroundColor: c.text,
      paddingVertical: 13,
      alignItems: 'center',
    },
    submitButtonText: {
      color: c.background,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 11,
      letterSpacing: 0.14,
      textTransform: 'uppercase',
    },
    loginPrompt: {
      color: c.inkSoft,
      fontFamily: 'NotoSerifKR-Regular',
      textAlign: 'center',
      marginVertical: 20,
      fontSize: 14,
    },

    // Legacy (kept for compat)
    ratingContainer: {},
    card: { backgroundColor: c.background },
    section: { backgroundColor: c.background },
    sectionTitle: { color: c.text, fontFamily: 'NotoSerifKR-Regular' },
    addToLibraryContainer: {},
    addToLibraryButton: {},
    addToLibraryButtonText: { color: c.text },
    statusPickerContainer: {},
    statusOptionButton: {},
    statusOptionButtonActive: {},
    statusOptionButtonText: { color: c.text },
    statusOptionButtonTextActive: { color: c.background },
    cancelButton: {},
    cancelButtonText: { color: c.inkSoft },
    editionsItem: {},
    editionTitle: { color: c.text },
    editionMeta: { color: c.inkSoft },
    reviewSection: {},
    coverWrap: { backgroundColor: c.background, alignItems: 'center', paddingVertical: 24 },
    coverOverlay: {},
  });
};
