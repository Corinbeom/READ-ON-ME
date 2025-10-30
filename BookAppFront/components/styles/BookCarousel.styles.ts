import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

const colors = Colors.light;

export default StyleSheet.create({
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
    color: colors.text,
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
    backgroundColor: colors.lightGray,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 250, 240, 0.05)',
    borderRadius: 10,
  },
  bookTitle: {
    fontSize: 13,
    fontFamily: 'NotoSerifKR-Regular',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 18,
    width: 120,
    alignSelf: 'center',
  },
  bookAuthor: {
    fontSize: 12,
    fontFamily: 'NotoSerifKR-Regular',
    color: colors.darkGray,
    textAlign: 'center',
    width: 120,
    marginTop: 4,
    alignSelf: 'center',
  },
  loadingIndicator: {
    height: 190, // Match book thumbnail height
    color: colors.primary,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'NotoSerifKR-Regular',
    color: colors.darkGray,
    textAlign: 'center',
    paddingVertical: 16,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
});
