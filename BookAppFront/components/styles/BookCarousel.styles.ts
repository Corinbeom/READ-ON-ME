import { Typography } from '@/src/styles/designTokens';
import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';

export const getBookCarouselStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];

  return StyleSheet.create({
    container: { marginTop: 8 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SCREEN_LAYOUT.gutter, marginBottom: 12 },
    headerTitle: { ...Typography.section, color: c.text, letterSpacing: -0.3 },
    listContentContainer: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingBottom: 8, gap: 16 },
    bookItem: { width: 120 },
    bookThumbnail: { width: 110, height: 158, borderRadius: 0, backgroundColor: c.surface2, marginBottom: 8 },
    bookTitle: { ...Typography.label, color: c.text, width: 110, fontFamily: 'NotoSerifKR-Regular', minHeight: 40 },
    bookAuthor: { ...Typography.caption, color: c.inkSoft, width: 110, marginTop: 4, letterSpacing: 0.1, textTransform: 'uppercase' },
    loadingIndicator: { height: 158 },
    emptyText: { ...Typography.body, color: c.inkSoft, fontStyle: 'italic', paddingVertical: 16, paddingHorizontal: SCREEN_LAYOUT.gutter },
  });
};
