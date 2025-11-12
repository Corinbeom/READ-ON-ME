import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Image,
  TouchableWithoutFeedback,
  Keyboard,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { api } from '../src/services/api';
import customAlert from '../src/utils/alert';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface AiChatModalProps {
  isVisible: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  text: string;
  results?: any[];
}

export default function AiChatModal({ isVisible, onClose }: AiChatModalProps) {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const styles = getStyles(colorScheme);
  const colors = Colors[colorScheme];
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { id: '1', type: 'ai', text: "안녕하세요! 어떤 책을 추천해 드릴까요?" },
  ]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [chatHistory]);

  const handleSendMessage = async () => {
    if (!isAuthenticated) {
      customAlert('알림', 'AI 추천을 사용하려면 로그인이 필요합니다.');
      return;
    }
    if (!currentInput.trim()) return;

    const userMessage: ChatMessage = { id: String(Date.now()), type: 'user', text: currentInput };
    setChatHistory((prev) => [...prev, userMessage]);
    setCurrentInput('');
    setIsLoading(true);

    try {
      const response = await api.post('/api/ai/search', { query: userMessage.text });
      const aiResponse: ChatMessage = {
        id: String(Date.now() + 1),
        type: 'ai',
        text: response.data.length > 0 ? "이런 책들을 추천해 드려요!" : "죄송해요, 추천할 만한 책을 찾지 못했어요.",
        results: response.data,
      };
      setChatHistory((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error('AI search failed:', error);
      customAlert('오류', 'AI 추천을 받는 중 오류가 발생했습니다.');
      setChatHistory((prev) => [
        ...prev,
        { id: String(Date.now() + 1), type: 'ai', text: "죄송해요, 추천을 가져오는 데 실패했어요." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecommendAgain = async () => {
    if (!isAuthenticated) {
      customAlert('알림', 'AI 추천을 사용하려면 로그인이 필요합니다.');
      return;
    }
    const lastUserQuery = chatHistory.filter(msg => msg.type === 'user').pop()?.text;
    if (!lastUserQuery) {
      customAlert('알림', '이전 검색어가 없습니다. 새로운 질문을 해주세요.');
      return;
    }

    setChatHistory((prev) => [...prev, { id: String(Date.now()), type: 'user', text: '다시 추천해줘' }]);
    setIsLoading(true);

    try {
      const response = await api.post('/api/ai/search', { query: lastUserQuery });
      const aiResponse: ChatMessage = {
        id: String(Date.now() + 1),
        type: 'ai',
        text: response.data.length > 0 ? "다른 책들을 찾아봤어요!" : "죄송해요, 다른 추천을 찾지 못했어요.",
        results: response.data,
      };
      setChatHistory((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error('AI re-recommendation failed:', error);
      customAlert('오류', '다시 추천을 받는 중 오류가 발생했습니다.');
      setChatHistory((prev) => [
        ...prev,
        { id: String(Date.now() + 1), type: 'ai', text: "죄송해요, 다시 추천을 가져오는 데 실패했어요." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToDetail = (isbn: string) => {
    onClose();
    router.push(`/book/${isbn}`);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[styles.messageBubble, item.type === 'user' ? styles.userBubble : styles.aiBubble]}>
      <Text style={item.type === 'user' ? styles.userText : styles.aiText}>{item.text}</Text>

      {item.results && item.results.length > 0 && (
        <FlatList
          horizontal
          data={item.results}
          keyExtractor={(book) => book.isbn}
          renderItem={({ item: book }) => (
            <TouchableOpacity style={styles.bookResultItem} onPress={() => navigateToDetail(book.isbn)}>
              <Image source={{ uri: book.thumbnail || 'https://via.placeholder.com/100x150.png?text=No+Image' }} style={styles.bookThumbnail} />
              <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
          style={styles.bookResultsList}
        />
      )}

    </View>
  );

  return (
    <Modal animationType="slide" transparent visible={isVisible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalWrapper}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>AI 도서 추천</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {isAuthenticated ? (
                <>
                  <FlatList
                    ref={flatListRef}
                    data={chatHistory}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    style={styles.chatList}
                    contentContainerStyle={styles.chatListContent}
                  />

                  {isLoading && <ActivityIndicator size="small" color={colors.primary} style={styles.loadingIndicator} />}

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="어떤 책을 찾으세요?"
                      placeholderTextColor={colors.darkGray}
                      value={currentInput}
                      onChangeText={setCurrentInput}
                      onSubmitEditing={handleSendMessage}
                      returnKeyType="send"
                      editable={!isLoading}
                    />
                    <TouchableOpacity onPress={handleSendMessage} style={styles.sendButton} disabled={isLoading}>
                      <Ionicons name="send" size={22} color={colors.background} />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.authPromptContainer}>
                  <Text style={styles.authPromptTitle}>로그인이 필요해요 !</Text>
                  <Text style={styles.authPromptSubtitle}>
                    AI 추천 검색 기능은 로그인 후 이용할 수 있어요.
                  </Text>
                  <View style={styles.authButtonRow}>
                    <TouchableOpacity
                      style={styles.authPrimaryButton}
                      onPress={() => {
                        onClose();
                        router.push('/auth/login');
                      }}
                    >
                      <Text style={styles.authPrimaryButtonText}>로그인</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.authSecondaryButton}
                      onPress={() => {
                        onClose();
                        router.push('/auth/register');
                      }}
                    >
                      <Text style={styles.authSecondaryButtonText}>회원가입</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const getStyles = (colorScheme: 'light' | 'dark') => {
  const colors = Colors[colorScheme];
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalWrapper: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      paddingHorizontal: 12,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      flex: 1,
      maxHeight: SCREEN_HEIGHT * 0.8,
      width: '100%',
      paddingTop: 10,
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.lightGray,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: 'Pretendard-SemiBold',
      color: colors.text,
    },
    closeButton: { padding: 5 },
    chatList: {
      flex: 1,
      paddingHorizontal: 12,
    },
    chatListContent: {
      paddingVertical: 10,
    },
    messageBubble: {
      maxWidth: '85%',
      padding: 10,
      borderRadius: 15,
      marginVertical: 5,
      flexShrink: 1,
    },
    userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primary,
    },
    aiBubble: {
      alignSelf: 'flex-start',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.lightGray,
    },
    userText: {
      color: colors.background,
      fontFamily: 'NotoSerifKR-Regular',
    },
    aiText: {
      color: colors.text,
      fontFamily: 'NotoSerifKR-Regular',
    },
    bookResultsList: {
      marginTop: 8,
      maxHeight: 150,
    },
    bookResultItem: {
      width: 100,
      marginRight: 10,
      alignItems: 'center',
    },
    bookThumbnail: {
      width: 80,
      height: 120,
      borderRadius: 8,
      backgroundColor: colors.lightGray,
    },
    bookTitle: {
      fontSize: 13,
      textAlign: 'center',
      marginTop: 4,
      fontFamily: 'NotoSerifKR-Regular',
      color: colors.text,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.lightGray,
      paddingVertical: 10,
      paddingHorizontal: 15,
      backgroundColor: colors.background,
    },
    textInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.lightGray,
      borderRadius: 25,
      paddingHorizontal: 15,
      paddingVertical: 10,
      marginRight: 10,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 16,
      backgroundColor: colors.card,
      color: colors.text,
    },
    sendButton: {
      backgroundColor: colors.primary,
      borderRadius: 25,
      width: 45,
      height: 45,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingIndicator: {
      marginVertical: 8,
    },
    authPromptContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    authPromptTitle: {
      fontSize: 20,
      fontFamily: 'Pretendard-SemiBold',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    authPromptSubtitle: {
      fontSize: 15,
      color: colors.darkGray,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 22,
      fontFamily: 'NotoSerifKR-Regular',
    },
    authButtonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    authPrimaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 22,
      paddingVertical: 12,
      paddingHorizontal: 28,
    },
    authPrimaryButtonText: {
      color: colors.background,
      fontFamily: 'Pretendard-SemiBold',
    },
    authSecondaryButton: {
      borderRadius: 22,
      paddingVertical: 12,
      paddingHorizontal: 28,
      borderWidth: 1,
      borderColor: colors.lightGray,
      backgroundColor: colors.card,
    },
    authSecondaryButtonText: {
      color: colors.text,
      fontFamily: 'Pretendard-SemiBold',
    },
  });
};
