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

  aiCard: {
    backgroundColor: '#fffaf3',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard-SemiBold',
    color: colors.text,
    marginLeft: 8,
  },
  aiDescription: {
    fontSize: 14,
    fontFamily: 'NotoSerifKR-Regular',
    color: colors.darkGray,
    lineHeight: 22,
    marginBottom: 16,
  },
  aiButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  aiButtonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Pretendard-Medium',
  },

  chatBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f2e8',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
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
    color: '#3e2723',
    marginBottom: 4,
  },
  chatDesc: {
    fontSize: 13,
    fontFamily: 'NotoSerifKR-Regular',
    color: '#6b4e34',
    lineHeight: 20,
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
  recommendationHeaderTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard-SemiBold',
    color: colors.text,
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

  // Modal Styles
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
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
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'NotoSerifKR-Regular',
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
