import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

export const getBookCarouselStyles = (colorScheme: 'light' | 'dark') => {
  const colors = Colors[colorScheme];

  return StyleSheet.create({
    container: {
      marginTop: 24,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: 'Pretendard-SemiBold',
      color: colors.text, // Dynamic color
    },
    listContentContainer: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 10,
    },
    bookItem: {
      width: 140,
    },
    bookThumbnail: {
      width: 130,
      height: 190,
      borderRadius: 10,
      backgroundColor: colors.lightGray, // Dynamic color
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.lightGray, // Dynamic color
    },
    thumbnailOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colorScheme === 'light' ? 'rgba(255, 250, 240, 0.05)' : 'rgba(0, 0, 0, 0.1)',
      borderRadius: 10,
    },
    bookTitle: {
      fontSize: 13,
      fontFamily: 'NotoSerifKR-Regular',
      color: colors.text, // Dynamic color
      textAlign: 'center',
      lineHeight: 18,
      width: 120,
      alignSelf: 'center',
    },
    bookAuthor: {
      fontSize: 12,
      fontFamily: 'NotoSerifKR-Regular',
      color: colors.darkGray, // Dynamic color
      textAlign: 'center',
      width: 120,
      marginTop: 4,
      alignSelf: 'center',
    },
    loadingIndicator: {
      height: 190, // Match book thumbnail height
      color: colors.primary, // Dynamic color
    },
    emptyText: {
      fontSize: 14,
      fontFamily: 'NotoSerifKR-Regular',
      color: colors.darkGray, // Dynamic color
      textAlign: 'center',
      paddingVertical: 16,
      lineHeight: 22,
      paddingHorizontal: 16,
    },
  });
};