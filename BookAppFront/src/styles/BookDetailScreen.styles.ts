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
  cover: { width: 180, height: 260, borderRadius: 8 },
  coverPlaceholder: { backgroundColor: colors.lightGray },

  // ✅ Card Section
  card: {
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 12,
    padding: 16,
    marginTop: -40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
    color: colors.text,
  },
  meta: { color: colors.darkGray, marginBottom: 16 },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.text,
  },
  description: { lineHeight: 22, color: colors.text },

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
    fontWeight: 'bold',
    color: colors.primary,
  },
  editionMeta: {
    fontSize: 12,
    color: colors.darkGray,
    marginTop: 4,
  },

  // ✅ Review Section
  reviewSection: {
    paddingHorizontal: 16,
    marginTop: 16,
    paddingBottom: 20,
  },
  reviewSectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
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
  },
  sortButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },

  // ✅ Review Input
  reviewInputContainer: {
    backgroundColor: colors.card, // 기존과 통일
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: colors.lightGray,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.background,
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
    fontWeight: 'bold',
    fontSize: 16,
  },

  // ✅ 로그인 안내문
  loginPrompt: {
    color: colors.darkGray,
    textAlign: 'center',
    marginVertical: 20,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 8,
  },

  // ✅ Review Card (리뷰 아이템)
  reviewItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
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
    fontWeight: 'bold',
    fontSize: 16,
    color: colors.text,
  },
  reviewRating: {
    color: colors.accent,
    fontSize: 14,
  },
  reviewCommentText: {
    lineHeight: 22,
    color: colors.text,
    fontSize: 14,
    marginBottom: 8,
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
    fontSize: 12,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  likeText: {
    color: colors.darkGray,
    fontSize: 13,
  },
  likeTextLiked: {
    color: colors.primary,
    fontWeight: '600',
  },

  // ✅ No Reviews
  noReviews: {
    textAlign: 'center',
    color: colors.darkGray,
    marginTop: 10,
    marginBottom: 20,
    fontSize: 14,
  },  
});
