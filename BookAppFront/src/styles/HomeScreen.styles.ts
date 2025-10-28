import { StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';

// Using light theme colors for the new design
const colors = Colors.light;

export default StyleSheet.create({
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
    width: 140,
    height: 42,
    resizeMode: 'contain',
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
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard-SemiBold',
    color: colors.text,
    marginBottom: 12,
  },
  popularBookItem: { 
    width: 140, 
    marginRight: 12, 
    alignItems: 'center'
  },
  popularThumbnail: { 
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
  popularTitle: { 
    fontSize: 13, 
    fontFamily: 'NotoSerifKR-Regular',
    color: colors.text, 
    textAlign: 'center', 
    lineHeight: 18, 
    width: 120,
  },
  popularAuthor: {
    fontSize: 12,
    fontFamily: 'NotoSerifKR-Regular',
    color: colors.darkGray, // warmGray
    textAlign: 'center',
    width: 120,
    marginTop: 4,
  },
  
  // Sections
  recommendationSection: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.lightGray,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  recommendationTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard-SemiBold',
    color: colors.text,
    marginBottom: 8,
  },
  recommendationText: {
    fontSize: 14,
    fontFamily: 'NotoSerifKR-Regular',
    color: colors.darkGray,
    textAlign: 'center',
    paddingVertical: 16,
    lineHeight: 22, // Increased line height
  },  
  popularSection: {
    marginTop: 24,
  },
  popularHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  popularHeaderTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard-SemiBold',
    color: colors.text,
  },
  userRecommendationSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  userRecommendationTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard-SemiBold',
    color: colors.text,
    marginBottom: 8,
  },
  userRecommendationText: {
    fontSize: 14,
    fontFamily: 'NotoSerifKR-Regular',
    color: colors.darkGray,
    textAlign: 'center',
    paddingVertical: 16,
    lineHeight: 22, // Increased line height
  },
  
});
