import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

export const getBookCarouselStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];

  return StyleSheet.create({
    container: {
      marginTop: 8,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 22,
      marginBottom: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      letterSpacing: -0.3,
    },
    listContentContainer: {
      paddingHorizontal: 22,
      paddingBottom: 8,
      gap: 16,
    },
    bookItem: {
      width: 120,
    },
    bookThumbnail: {
      width: 110,
      height: 158,
      borderRadius: 0,
      backgroundColor: c.surface2,
      marginBottom: 8,
    },
    thumbnailOverlay: {},
    bookTitle: {
      fontSize: 12,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      lineHeight: 17,
      width: 110,
    },
    bookAuthor: {
      fontSize: 10,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkSoft,
      width: 110,
      marginTop: 4,
      letterSpacing: 0.1,
      textTransform: 'uppercase',
    },
    loadingIndicator: {
      height: 158,
    },
    emptyText: {
      fontSize: 13,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkSoft,
      fontStyle: 'italic',
      paddingVertical: 16,
      lineHeight: 22,
      paddingHorizontal: 22,
    },
  });
};