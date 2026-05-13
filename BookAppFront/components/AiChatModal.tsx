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
  ScrollView,
  Image,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  Dimensions
} from 'react-native';
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

const INITIAL_CHAT_MESSAGE: ChatMessage = {
  id: '1',
  type: 'ai',
  text: "안녕하세요! 어떤 책을 추천해 드릴까요?",
};

export default function AiChatModal({ isVisible, onClose }: AiChatModalProps) {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getStyles(colorScheme);
  const c = Colors[colorScheme];
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([INITIAL_CHAT_MESSAGE]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
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
        text: response.data.length > 0 ? "질문에 맞는 책을 찾아봤어요." : "추천할 만한 책을 찾지 못했어요.",
        results: response.data,
      };
      setChatHistory((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error('AI search failed:', error);
      customAlert('오류', 'AI 추천을 받는 중 오류가 발생했습니다.');
      setChatHistory((prev) => [
        ...prev,
        { id: String(Date.now() + 1), type: 'ai', text: "추천을 가져오는 데 실패했어요." },
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
        text: response.data.length > 0 ? "다른 책들을 찾아봤어요." : "다른 추천을 찾지 못했어요.",
        results: response.data,
      };
      setChatHistory((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error('AI re-recommendation failed:', error);
      customAlert('오류', '다시 추천을 받는 중 오류가 발생했습니다.');
      setChatHistory((prev) => [
        ...prev,
        { id: String(Date.now() + 1), type: 'ai', text: "다시 추천을 가져오는 데 실패했어요." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    Alert.alert('채팅 초기화', '채팅창을 초기화 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '확인', style: 'destructive', onPress: () => setChatHistory([INITIAL_CHAT_MESSAGE]) },
    ]);
  };

  const navigateToDetail = (isbn: string) => {
    onClose();
    router.push(`/book/${isbn}`);
  };

  const renderMessage = ({ item }: { item: ChatMessage }): React.ReactElement => (
    <View style={[styles.messageBubble, item.type === 'user' ? styles.userBubble : styles.aiBubble]}>
      <Text style={item.type === 'user' ? styles.userText : styles.aiText}>{item.text}</Text>
      {item.results && item.results.length > 0 && (
        <>
          <View style={styles.bookResultsList}>
            {item.results.slice(0, 6).map((book: any) => (
              <TouchableOpacity
                key={book.isbn}
                style={styles.bookResultItem}
                onPress={() => navigateToDetail(book.isbn)}
              >
                <Image
                  source={{ uri: book.thumbnail }}
                  style={styles.bookThumbnail}
                  resizeMode="cover"
                />
                <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {item.results.some((b: any) => b.reason) && (
            <View style={styles.reasonList}>
              {item.results.filter((b: any) => b.reason).slice(0, 5).map((book: any, i: number) => (
                <Text key={book.isbn} style={styles.reasonItem}>
                  {i + 1}. {book.title} — {book.reason}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <Modal animationType="slide" transparent visible={isVisible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.overlayBackground} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrapper}
        >
            <View style={styles.modalContent}>
              {/* ── Header ── */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>AI 사서</Text>
                <View style={styles.headerActions}>
                  <TouchableOpacity onPress={handleClearChat} style={styles.clearButton}>
                    <Text style={styles.clearButtonText}>↺</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isAuthenticated ? (
                <>
                  <ScrollView
                    ref={scrollViewRef}
                    style={styles.chatList}
                    contentContainerStyle={styles.chatListContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    {chatHistory.map((item) => (
                      <React.Fragment key={item.id}>
                        {renderMessage({ item })}
                      </React.Fragment>
                    ))}
                  </ScrollView>

                  {isLoading && (
                    <ActivityIndicator size="small" color={c.inkSoft} style={styles.loadingIndicator} />
                  )}

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="어떤 책을 찾으세요?"
                      placeholderTextColor={c.inkFaint}
                      value={currentInput}
                      onChangeText={setCurrentInput}
                      onSubmitEditing={handleSendMessage}
                      returnKeyType="send"
                      editable={!isLoading}
                    />
                    <TouchableOpacity onPress={handleSendMessage} style={styles.sendButton} disabled={isLoading}>
                      <Text style={styles.sendButtonText}>→</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.authPromptContainer}>
                  <Text style={styles.authPromptTitle}>로그인이 필요해요</Text>
                  <Text style={styles.authPromptSubtitle}>
                    AI 추천 검색 기능은 로그인 후 이용할 수 있어요.
                  </Text>
                  <View style={styles.authButtonRow}>
                    <TouchableOpacity
                      style={styles.authPrimaryButton}
                      onPress={() => { onClose(); router.push('/auth/login'); }}
                    >
                      <Text style={styles.authPrimaryButtonText}>로그인</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.authSecondaryButton}
                      onPress={() => { onClose(); router.push('/auth/register'); }}
                    >
                      <Text style={styles.authSecondaryButtonText}>회원가입</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
    </Modal>
  );
}

const getStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    overlayBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalWrapper: {
      width: '100%',
      height: SCREEN_HEIGHT * 0.85,
    },
    modalContent: {
      flex: 1,
      backgroundColor: c.card,
      borderTopWidth: 2,
      borderTopColor: c.text,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 22,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      letterSpacing: -0.3,
    },
    closeButton: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonText: {
      fontSize: 22,
      color: c.text,
      lineHeight: 26,
      fontFamily: 'Pretendard-SemiBold',
    },
    clearButton: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.line,
    },
    clearButtonText: {
      fontSize: 16,
      color: c.inkSoft,
      lineHeight: 22,
    },
    chatList: {
      flex: 1,
      paddingHorizontal: 16,
    },
    chatListContent: {
      paddingVertical: 16,
    },
    messageBubble: {
      maxWidth: '85%',
      padding: 12,
      marginBottom: 10,
      flexGrow: 0,
      flexShrink: 0,
    },
    userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: c.text,
    },
    aiBubble: {
      alignSelf: 'flex-start',
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.line,
    },
    userText: {
      color: c.background,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 14,
      lineHeight: 20,
    },
    aiText: {
      color: c.text,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 14,
      lineHeight: 20,
    },
    bookResultsList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 12,
      gap: 8,
    },
    bookResultItem: {
      width: 72,
      alignItems: 'center',
    },
    bookThumbnail: {
      width: 72,
      height: 104,
      borderRadius: 0,
      backgroundColor: c.surface2,
    },
    bookTitle: {
      fontSize: 11,
      textAlign: 'center',
      marginTop: 6,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      lineHeight: 15,
    },
    reasonList: {
      marginTop: 12,
      gap: 6,
    },
    reasonItem: {
      fontSize: 12,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkSoft,
      lineHeight: 18,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: c.card,
    },
    textInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginRight: 10,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 14,
      backgroundColor: c.background,
      color: c.text,
    },
    sendButton: {
      backgroundColor: c.text,
      width: 42,
      height: 42,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonText: {
      color: c.background,
      fontSize: 18,
      fontFamily: 'Pretendard-SemiBold',
    },
    loadingIndicator: {
      marginVertical: 8,
    },
    authPromptContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingVertical: 40,
    },
    authPromptTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      marginBottom: 10,
      textAlign: 'center',
    },
    authPromptSubtitle: {
      fontSize: 14,
      color: c.inkSoft,
      textAlign: 'center',
      marginBottom: 28,
      lineHeight: 22,
      fontFamily: 'NotoSerifKR-Regular',
    },
    authButtonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    authPrimaryButton: {
      backgroundColor: c.text,
      paddingVertical: 10,
      paddingHorizontal: 24,
    },
    authPrimaryButtonText: {
      color: c.background,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 12,
      letterSpacing: 0.1,
    },
    authSecondaryButton: {
      paddingVertical: 10,
      paddingHorizontal: 24,
      borderWidth: 1,
      borderColor: c.text,
    },
    authSecondaryButtonText: {
      color: c.text,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 12,
      letterSpacing: 0.1,
    },
  });
};
