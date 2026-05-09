
import { StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';

export const getMyLibraryScreenStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },

    // ── Masthead ──────────────────────────────────────────
    masthead: {
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingHorizontal: 22,
      paddingBottom: 12,
      backgroundColor: c.background,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      letterSpacing: -0.5,
    },
    logoutButton: {},
    logoutButtonText: {
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkSoft,
      letterSpacing: 0.1,
      textDecorationLine: 'underline',
    },

    // ── Profile Bar (like issueBar) ────────────────────────
    profileBar: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 22,
      paddingVertical: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: c.background,
    },
    profileBarText: {
      fontSize: 10,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
    },

    // ── Login Prompt ───────────────────────────────────────
    loginSection: {
      paddingHorizontal: 22,
      paddingVertical: 48,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      alignItems: 'center',
    },
    loginPrompt: { backgroundColor: c.background },
    loginPromptText: {
      fontSize: 15,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkSoft,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      marginBottom: 20,
    },
    loginButton: {
      borderWidth: 1,
      borderColor: c.text,
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    loginButtonText: {
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      color: c.text,
      letterSpacing: 0.1,
    },

    // ── Stats Row ──────────────────────────────────────────
    statsRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: c.background,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 24,
    },
    statDivider: {
      width: 1,
      backgroundColor: c.line,
      marginVertical: 16,
    },
    statCount: {
      fontSize: 28,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      letterSpacing: -0.5,
    },
    statLabel: {
      fontSize: 10,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      marginTop: 6,
    },

    // ── Reviews Summary Row ────────────────────────────────
    reviewsSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: 22,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: c.background,
    },
    reviewsSummaryLeft: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    reviewsSummaryCount: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
    },
    reviewsSummaryLabel: {
      fontSize: 10,
      textTransform: 'uppercase',
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      letterSpacing: 0.2,
    },
    reviewsSummaryArrow: {
      fontSize: 11,
      color: c.inkFaint,
      fontFamily: 'Pretendard-SemiBold',
      letterSpacing: 0.1,
    },

    // ── Section Header ─────────────────────────────────────
    sectionHeader: {
      paddingHorizontal: 22,
      paddingTop: 28,
      paddingBottom: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      backgroundColor: c.background,
    },
    sectionTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      letterSpacing: -0.3,
    },
    sectionDividerTop: {
      height: 2,
      backgroundColor: c.text,
      marginHorizontal: 22,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: c.line,
      marginHorizontal: 22,
    },

    // ── Notification Items ─────────────────────────────────
    notificationHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    notificationTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      letterSpacing: -0.3,
    },
    notificationHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    notificationBadge: {
      fontSize: 10,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkFaint,
      letterSpacing: 0.1,
    },
    notificationMarkAll: {
      fontSize: 10,
      fontFamily: 'Pretendard-SemiBold',
      color: c.text,
      letterSpacing: 0.1,
      textDecorationLine: 'underline',
    },
    notificationMarkAllDisabled: {
      color: c.inkFaint,
      textDecorationLine: 'none',
    },
    notificationSection: { backgroundColor: c.background },
    notificationItem: {
      paddingHorizontal: 22,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.background,
    },
    notificationUnreadItem: {
      backgroundColor: c.surface2,
    },
    notificationUnreadDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: c.text,
      marginRight: 12,
      flexShrink: 0,
    },
    notificationCopy: { flex: 1 },
    notificationMessage: {
      fontSize: 13,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      lineHeight: 20,
    },
    notificationMeta: {
      fontSize: 10,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkFaint,
      marginTop: 4,
      letterSpacing: 0.1,
    },

    // ── Recent Reviews ─────────────────────────────────────
    recentReviewsSection: { backgroundColor: c.background },
    recentReviewsTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      letterSpacing: -0.3,
    },
    recentReviewsListContent: {},
    reviewItemContainer: {
      paddingHorizontal: 22,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: c.background,
    },
    reviewBookThumbnail: {
      width: 48,
      height: 68,
      borderRadius: 0,
      backgroundColor: c.surface2,
      marginRight: 14,
    },
    reviewBookThumbnailOverlay: {},
    reviewInfoContainer: { flex: 1 },
    reviewItemTitle: {
      fontSize: 13,
      fontFamily: 'Pretendard-SemiBold',
      color: c.text,
      marginBottom: 4,
      letterSpacing: 0.05,
    },
    reviewItemRating: {
      fontSize: 11,
      color: c.star,
      letterSpacing: 2,
      marginBottom: 6,
    },
    reviewItemComment: {
      fontSize: 12,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkSoft,
      lineHeight: 18,
    },

    // ── Summary card (legacy compat) ───────────────────────
    summaryContainer: { flexDirection: 'row', backgroundColor: c.background },
    summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 24 },
    summaryCount: { fontSize: 28, fontFamily: 'NotoSerifKR-Regular', color: c.text },
    summaryLabel: { fontSize: 10, textTransform: 'uppercase', color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', marginTop: 6 },
    summaryIcon: {},
    myReviewsSummaryCard: { backgroundColor: c.background },
    myReviewsSummaryIcon: {},
    myReviewsSummaryCount: { fontSize: 20, fontFamily: 'NotoSerifKR-Regular', color: c.text },
    myReviewsSummaryLabel: { fontSize: 10, textTransform: 'uppercase', color: c.inkSoft, fontFamily: 'Pretendard-SemiBold' },

    // ── Misc ───────────────────────────────────────────────
    emptySectionText: {
      paddingHorizontal: 22,
      paddingVertical: 20,
      color: c.inkSoft,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 13,
    },
    loadingText: {
      paddingHorizontal: 22,
      paddingVertical: 20,
      color: c.inkSoft,
      fontFamily: 'NotoSerifKR-Regular',
    },
    errorText: {
      paddingHorizontal: 22,
      paddingVertical: 10,
      color: c.danger,
      fontFamily: 'NotoSerifKR-Regular',
    },
    profileSection: { backgroundColor: c.background },
    greeting: { fontSize: 22, fontFamily: 'NotoSerifKR-Regular', color: c.text },
    email: { fontSize: 11, color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', letterSpacing: 0.1 },

    // ── Modal (bottom sheet) ───────────────────────────────
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.7)',
    },
    modalContent: {
      backgroundColor: c.card,
      borderTopWidth: 2,
      borderTopColor: c.text,
      maxHeight: '80%',
    },
    modalTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      letterSpacing: -0.3,
    },
    modalCloseButton: {},
    modalCloseButtonText: {
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkSoft,
      letterSpacing: 0.1,
      textDecorationLine: 'underline',
    },
    modalBookListContent: {
      padding: 16,
    },
    modalReviewListContent: {},

    // ── Book item in modal ─────────────────────────────────
    bookItemContainer: {
      flex: 1,
      margin: 8,
      alignItems: 'center',
    },
    bookThumbnail: {
      width: 90,
      height: 130,
      borderRadius: 0,
      backgroundColor: c.surface2,
      marginBottom: 8,
    },
    bookThumbnailOverlay: {},
    bookInfoContainer: { alignItems: 'center' },
    bookTitle: {
      fontSize: 12,
      fontFamily: 'Pretendard-SemiBold',
      color: c.text,
      textAlign: 'center',
      lineHeight: 16,
    },
    bookAuthor: {
      fontSize: 10,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkSoft,
      textAlign: 'center',
      marginTop: 4,
    },
  });
};
