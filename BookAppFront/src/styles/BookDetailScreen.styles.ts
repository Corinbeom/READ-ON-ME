import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

const colors = Colors.light;

export default StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingBottom: 60,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },

  // ✅ Header Section
  coverWrap: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  cover: {
    width: 180,
    height: 260,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9d9d9', // 밝은 회색 (배경색과 부드럽게 대비)
  },
  
  coverPlaceholder: { backgroundColor: colors.lightGray },
  coverOverlay: { // Overlay for book cover image
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 250, 240, 0.05)',
    borderRadius: 8, // Assuming cover has borderRadius 8
  },

  // ✅ Card Section
  card: {
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 12,
    padding: 16,
    marginTop: -10,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Pretendard-SemiBold',
    marginBottom: 4,
    color: colors.text,
  },
  meta: { color: colors.darkGray, marginBottom: 16, fontFamily: 'NotoSerifKR-Regular' },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard-SemiBold',
    marginBottom: 8,
    color: colors.text,
  },
  description: { lineHeight: 22, color: colors.text, fontFamily: 'NotoSerifKR-Regular' },

  // ✅ Editions Section
  editionsItem: {
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  editionTitle: {
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
    color: colors.primary,
  },
  editionMeta: {
    fontSize: 12,
    color: colors.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
    marginTop: 4,
  },

  // ✅ Add to Library Section
  addToLibraryContainer: {
    marginTop: 20,
    marginHorizontal: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  addToLibraryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    width: '80%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  addToLibraryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
  },
  statusPickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  statusOptionButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.lightGray,
    margin: 5,
    backgroundColor: colors.card,
  },
  statusOptionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusOptionButtonText: {
    color: colors.text,
    fontFamily: 'NotoSerifKR-Regular',
    fontSize: 14,
  },
  statusOptionButtonTextActive: {
    color: '#fff',
  },
  cancelButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.darkGray,
    backgroundColor: colors.background,
  },
  cancelButtonText: {
    color: colors.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
    fontSize: 14,
  },

  // ✅ Review Section
  reviewSection: {
    paddingHorizontal: 16,
    marginTop: 16,
    paddingBottom: 20,
  },
  reviewSectionTitle: {
    fontSize: 17,
    fontFamily: 'Pretendard-SemiBold',
    marginBottom: 8,
    color: colors.text,
  },

  // ✅ Sort Buttons
  sortContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  sortButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.lightGray,
    marginLeft: 8,
  },
  sortButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortButtonText: {
    color: colors.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
  },
  sortButtonTextActive: {
    color: '#fff',
    fontFamily: 'Pretendard-SemiBold',
  },

  // ✅ Review Input
  reviewInputContainer: {
    backgroundColor: colors.card, // 기존과 통일
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: colors.lightGray,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.background,
    fontFamily: 'NotoSerifKR-Regular',
  },
  ratingContainer: {
    flexDirection: 'row',
    marginVertical: 10,
    justifyContent: 'center',
  },
  starEmpty: {
    fontSize: 30,
    color: colors.lightGray,
    marginHorizontal: 5,
  },
  starFilled: {
    fontSize: 30,
    color: colors.accent,
    marginHorizontal: 5,
  },
  submitButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontFamily: 'Pretendard-SemiBold',
    fontSize: 16,
  },

  // ✅ 로그인 안내문
  loginPrompt: {
    color: colors.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
    textAlign: 'center',
    marginVertical: 20,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 8,
  },

  // ✅ Review Card (리뷰 아이템)
  reviewItem: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  // ✅ 리뷰 타이틀과 정렬 버튼을 같은 줄에
  reviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  reviewAuthor: {
    fontFamily: 'Pretendard-SemiBold',
    fontSize: 16,
    color: colors.text,
  },
  reviewRating: {
    color: colors.accent,
    fontFamily: 'NotoSerifKR-Regular',
    fontSize: 14,
  },
  reviewCommentText: {
    lineHeight: 22,
    color: colors.text,
    fontFamily: 'NotoSerifKR-Regular',
    fontSize: 14,
  },

  // ✅ Footer with "도움이 돼요" 버튼
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
    paddingTop: 8,
  },
  reviewDate: {
    color: colors.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
    fontSize: 12,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  likeText: {
    color: colors.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
    fontSize: 13,
  },
  likeTextLiked: {
    color: colors.primary,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
  },

  // ✅ No Reviews
  noReviews: {
    textAlign: 'center',
    color: colors.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
    marginTop: 10,
    marginBottom: 20,
    fontSize: 14,
  },  
});