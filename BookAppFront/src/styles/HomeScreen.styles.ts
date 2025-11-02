import { StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';

// It's now a function that accepts a color scheme
export const getHomeScreenStyles = (colorScheme: 'light' | 'dark') => {
  const colors = Colors[colorScheme];

  return StyleSheet.create({
    container: { 
      flex: 1, 
      backgroundColor: colors.background 
    },
    headerContainer: {
      backgroundColor: colors.card,
      paddingTop: Platform.OS === 'ios' ? 60 : 40, // SafeArea
      paddingHorizontal: 20,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.lightGray,
    },
    headerContentWrapper: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    logo: {
      width: 140,          // 살짝 더 키움 (140 → 160)
      height: 40,          // 비율 유지하면서 높이도 약간 증가
      
      
      marginTop: 6,        // 상단 여백
    },
    authContainer: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 10 
    },
    welcomeText: { 
      fontSize: 16, 
      color: colors.primary, 
      fontFamily: 'Pretendard-SemiBold',
    },
    authButtons: { 
      flexDirection: 'row', 
      gap: 10 
    },
    loginButton: { 
      backgroundColor: colors.primary,
      paddingHorizontal: 16, 
      paddingVertical: 8, 
      borderRadius: 20 
    },
    loginButtonText: { 
      color: '#fff', 
      fontSize: 14, 
      fontFamily: 'Pretendard-SemiBold',
    },
    registerButton: { 
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 16, 
      paddingVertical: 8, 
      borderRadius: 20 
    },
    registerButtonText: { 
      color: colors.primary, 
      fontSize: 14, 
      fontFamily: 'Pretendard-SemiBold',
    },

    chatBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colorScheme === 'light' ? '#f8f2e8' : '#2c2c2c', // Differentiated color for dark mode
      marginHorizontal: 16,
      marginTop: 24,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOpacity: colorScheme === 'light' ? 0.06 : 0.2,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    chatEmoji: {
      fontSize: 28,
      marginRight: 12,
    },
    chatTextWrapper: { flex: 1 },
    chatTitle: {
      fontSize: 16,
      fontFamily: 'Pretendard-SemiBold',
      color: colorScheme === 'light' ? '#3e2723' : colors.text,
      marginBottom: 4,
    },
    chatDesc: {
      fontSize: 13,
      fontFamily: 'NotoSerifKR-Regular',
      color: colorScheme === 'light' ? '#6b4e34' : colors.darkGray,
      lineHeight: 20,
    },
    
    recommendationHeaderTitle: {
      fontSize: 20,
      fontFamily: 'Pretendard-SemiBold',
      color: colors.text,
    },

    // Modal Styles
    centeredView: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalView: {
      margin: 20,
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 35,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    modalTitle: {
      marginBottom: 15,
      textAlign: 'center',
      fontSize: 18,
      fontFamily: 'Pretendard-SemiBold',
      color: colors.text,
    },
    modalText: {
      marginBottom: 15,
      textAlign: 'center',
      fontSize: 15,
      lineHeight: 22,
      fontFamily: 'NotoSerifKR-Regular',
      color: colors.darkGray,
    },
    button: {
      borderRadius: 20,
      padding: 10,
      paddingHorizontal: 20,
      elevation: 2,
    },
    buttonClose: {
      backgroundColor: colors.primary,
    },
    textStyle: {
      color: 'white',
      fontFamily: 'Pretendard-SemiBold',
      textAlign: 'center',
    },
  });
};