import { StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';

export const getHomeScreenStyles = (colorScheme: 'light' | 'dark') => {
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
    mastheadTitle: {
      fontSize: 28,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      letterSpacing: -0.5,
    },
    mastheadRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },

    // ── Issue Bar ─────────────────────────────────────────
    issueBar: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 22,
      paddingVertical: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: c.background,
    },
    issueBarText: {
      fontSize: 10,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
    },

    // ── Auth Buttons ──────────────────────────────────────
    authButtons: {
      flexDirection: 'row',
      gap: 10,
    },
    loginButton: {
      borderWidth: 1,
      borderColor: c.text,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 5,
    },
    loginButtonText: {
      color: c.text,
      fontSize: 11,
      letterSpacing: 0.12,
      fontFamily: 'Pretendard-SemiBold',
    },
    registerButton: {
      backgroundColor: c.text,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 5,
    },
    registerButtonText: {
      color: c.background,
      fontSize: 11,
      letterSpacing: 0.12,
      fontFamily: 'Pretendard-SemiBold',
    },

    // ── Notification Bell ─────────────────────────────────
    notificationBellButton: {
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
    },
    notificationDot: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.danger,
    },

    // ── AI Section ────────────────────────────────────────
    aiSection: {
      marginHorizontal: 22,
      marginTop: 28,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    aiLabel: {
      fontSize: 10,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      marginBottom: 10,
    },
    aiQuote: {
      fontSize: 22,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkFaint,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      lineHeight: 28,
    },
    aiPromptText: {
      fontSize: 17,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      lineHeight: 26,
      marginTop: 6,
    },
    aiSubText: {
      fontSize: 12,
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      marginTop: 12,
      letterSpacing: 0.1,
    },

    // ── Section Header ────────────────────────────────────
    sectionHeader: {
      paddingHorizontal: 22,
      paddingTop: 28,
      paddingBottom: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    sectionTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      letterSpacing: -0.3,
    },
    sectionCount: {
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkFaint,
      letterSpacing: 0.1,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: c.line,
      marginHorizontal: 22,
    },
    birthYearHint: {
      paddingHorizontal: 22,
      paddingBottom: 12,
      fontSize: 11,
      color: c.inkFaint,
      fontFamily: 'Pretendard-SemiBold',
      letterSpacing: 0.1,
    },

    // ── Recommendation Header ─────────────────────────────
    recommendationHeaderTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
    },

    // ── Modal ─────────────────────────────────────────────
    centeredView: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalView: {
      margin: 24,
      backgroundColor: c.card,
      padding: 32,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.line,
    },
    modalTitle: {
      marginBottom: 12,
      textAlign: 'center',
      fontSize: 16,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
    },
    modalText: {
      marginBottom: 20,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 22,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkSoft,
    },
    button: {
      paddingVertical: 10,
      paddingHorizontal: 24,
    },
    buttonClose: {
      backgroundColor: c.text,
    },
    textStyle: {
      color: c.background,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 12,
      letterSpacing: 0.14,
      textTransform: 'uppercase',
    },

    // Legacy
    logo: { width: 140, height: 40 },
    headerContainer: { backgroundColor: c.background },
    headerContentWrapper: { flexDirection: 'row', justifyContent: 'space-between' },
    authContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    chatBubble: { marginHorizontal: 22, marginTop: 20 },
    chatEmoji: { fontSize: 20 },
    chatTextWrapper: { flex: 1 },
    chatTitle: { fontSize: 15, fontFamily: 'Pretendard-SemiBold', color: c.text },
    chatDesc: { fontSize: 12, color: c.inkSoft },
  });
};
