import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Dimensions,
  Animated,
  AccessibilityInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { aiJobApi, type AiSearchBook, type AiSearchJob } from '../src/services/api';
import AiRecommendationCards from './AiRecommendationCards';
import customAlert from '../src/utils/alert';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { isAxiosError } from 'axios';
import { RootState } from '@/src/store';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const NEAR_BOTTOM_THRESHOLD = 80;

type NewResponseKind = 'results' | 'status' | null;

const isTerminalJob = (job: AiSearchJob) => job.status === 'SUCCEEDED' || job.status === 'FAILED';

interface AiChatModalProps {
  isVisible: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'status';
  text: string;
  results?: AiSearchBook[];
}

const INITIAL_CHAT_MESSAGE: ChatMessage = {
  id: '1',
  type: 'ai',
  text: '찾고 싶은 책의 분위기, 주제, 장르를 한 번에 알려주세요.',
};

function ShimmerStatusText({ text, style, containerStyle, active }: {
  text: string;
  style: TextStyle;
  containerStyle: ViewStyle;
  active: boolean;
}) {
  const sweep = useRef(new Animated.Value(-2)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const characters = Array.from(text);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    sweep.setValue(-2);
    if (!active || reduceMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(sweep, {
        toValue: characters.length + 2,
        duration: 2200,
        useNativeDriver: true,
      }),
      Animated.delay(700),
    ]));
    animation.start();
    return () => animation.stop();
  }, [active, reduceMotion, sweep, text, characters.length]);

  return (
    <View style={containerStyle} accessible accessibilityRole="text" accessibilityLabel={text}>
      {characters.map((character, index) => (
        <Animated.Text
          key={index}
          accessible={false}
          style={[style, {
            opacity: reduceMotion ? 0.6 : sweep.interpolate({
              inputRange: [index - 2, index - 1, index, index + 1, index + 2],
              outputRange: [0.42, 0.62, 0.98, 0.62, 0.42],
              extrapolate: 'clamp',
            }),
          }]}
        >
          {character}
        </Animated.Text>
      ))}
    </View>
  );
}

export default function AiChatModal({ isVisible, onClose }: AiChatModalProps) {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getStyles(colorScheme);
  const c = Colors[colorScheme];
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const [jobs, setJobs] = useState<AiSearchJob[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [newResponseKind, setNewResponseKind] = useState<NewResponseKind>(null);
  const [inputHeight, setInputHeight] = useState(67);
  const pendingSubmission = useRef<{ query: string; key: string } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const jobsRef = useRef<AiSearchJob[]>([]);
  const nearBottomRef = useRef(true);
  const scrollInitializedRef = useRef(false);
  const userScrolledRef = useRef(false);
  const visibleRef = useRef(isVisible);
  const pendingScrollRef = useRef<{ animated: boolean } | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlightRef = useRef(false);

  const flushPendingScroll = useCallback(() => {
    const request = pendingScrollRef.current;
    if (!request) return;
    pendingScrollRef.current = null;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = null;
    if (!visibleRef.current) return;
    scrollViewRef.current?.scrollToEnd({ animated: request.animated });
    scrollInitializedRef.current = true;
    nearBottomRef.current = true;
    setNewResponseKind(null);
  }, []);

  const requestScrollToEnd = useCallback((animated: boolean) => {
    pendingScrollRef.current = { animated };
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(flushPendingScroll, 80);
  }, [flushPendingScroll]);

  const handleChatScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!scrollInitializedRef.current && !userScrolledRef.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    nearBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
    if (nearBottomRef.current) setNewResponseKind(null);
  };

  useEffect(() => {
    jobsRef.current = [];
    setJobs([]);
    setNewResponseKind(null);
    pendingSubmission.current = null;
  }, [user?.id]);

  useEffect(() => {
    visibleRef.current = isVisible;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = null;
    pendingScrollRef.current = null;
    if (isVisible) {
      nearBottomRef.current = true;
      scrollInitializedRef.current = false;
      userScrolledRef.current = false;
      requestScrollToEnd(false);
    } else {
      setNewResponseKind(null);
    }
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [isVisible, requestScrollToEnd]);

  const chatHistory: ChatMessage[] = [INITIAL_CHAT_MESSAGE, ...[...jobs].reverse().flatMap((job): ChatMessage[] => [
    { id: `${job.id}-user`, type: 'user', text: job.query },
    {
      id: `${job.id}-ai`, type: job.status === 'QUEUED' || job.status === 'RUNNING' ? 'status' : 'ai',
      text: job.status === 'QUEUED' ? '요청을 받았어요. 순서를 기다리고 있어요.'
        : job.status === 'RUNNING' ? 'AI 사서가 서재에서 책을 찾고 있어요.'
        : job.status === 'FAILED' ? (job.error_code === 'INTERRUPTED'
          ? '서버가 다시 시작되어 검색이 중단됐어요. 다시 요청해 주세요.'
          : job.error_code === 'TIMEOUT' ? '검색 시간이 초과됐어요. 다시 요청해 주세요.'
          : '책을 찾는 중 문제가 생겼어요. 다시 요청해 주세요.')
        : job.results?.length
          ? job.results.some((book) => book.ranking_status === 'FALLBACK')
            ? 'AI 재정렬이 어려워 검색 결과를 기준으로 책을 골랐어요.'
            : '질문에 맞는 책을 찾아봤어요.'
          : '추천할 만한 책을 찾지 못했어요.',
      results: job.status === 'SUCCEEDED' ? job.results ?? [] : undefined,
    },
  ])];

  useEffect(() => {
    if (!isVisible || !isAuthenticated) return;
    let active = true;
    aiJobApi.recent().then((response) => {
      if (active) {
        const serverJobs = response.data.data;
        const known = new Set(serverJobs.map((job) => job.id));
        const nextJobs = [...serverJobs, ...jobsRef.current.filter((job) => !known.has(job.id))];
        jobsRef.current = nextJobs;
        setJobs(nextJobs);
        if (!userScrolledRef.current) requestScrollToEnd(false);
        setErrorText('');
      }
    }).catch(() => { if (active) setErrorText('최근 검색을 불러오지 못했어요. 잠시 후 다시 열어 주세요.'); });
    return () => { active = false; };
  }, [isVisible, isAuthenticated, user?.id, requestScrollToEnd]);

  const hasPendingJob = jobs.some((job) => job.status === 'QUEUED' || job.status === 'RUNNING');
  useEffect(() => {
    if (!isVisible || !isAuthenticated || !hasPendingJob) return;
    let active = true;
    const timer = setInterval(() => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      aiJobApi.recent().then((response) => {
        if (!active) return;
        const nextJobs = response.data.data;
        const previousJobs = jobsRef.current;
        const previousById = new Map(previousJobs.map((job) => [job.id, job]));
        const changed = nextJobs.length !== previousJobs.length || nextJobs.some((job) => {
          const previous = previousById.get(job.id);
          return !previous || previous.status !== job.status || previous.error_code !== job.error_code
            || (previous.results?.length ?? 0) !== (job.results?.length ?? 0);
        });
        const newTerminal = nextJobs.find((job) => {
          const previous = previousById.get(job.id);
          return isTerminalJob(job) && (!previous || !isTerminalJob(previous));
        });
        jobsRef.current = nextJobs;
        if (changed) {
          setJobs(nextJobs);
          if (nearBottomRef.current) {
            // Capture the position before the new content changes the scroll distance.
            // A drag that starts before this runs cancels the pending scroll.
            requestScrollToEnd(true);
          } else if (newTerminal) {
            setNewResponseKind(newTerminal.status === 'SUCCEEDED' && newTerminal.results?.length ? 'results' : 'status');
          }
        }
        setErrorText('');
      }).catch(() => { if (active) setErrorText('검색 상태를 확인하지 못했어요. 연결을 확인해 주세요.'); })
        .finally(() => { pollInFlightRef.current = false; });
    }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [isVisible, isAuthenticated, hasPendingJob, requestScrollToEnd]);

  const handleSendMessage = async () => {
    if (!isAuthenticated) {
      customAlert('알림', 'AI 추천을 사용하려면 로그인이 필요합니다.');
      return;
    }
    const query = currentInput.trim();
    if (!query || isSubmitting) return;
    const submission = pendingSubmission.current?.query === query
      ? pendingSubmission.current
      : { query, key: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    pendingSubmission.current = submission;
    setIsSubmitting(true);
    setErrorText('');

    try {
      const response = await aiJobApi.submit(submission.query, submission.key);
      const nextJobs = [response.data.data, ...jobsRef.current.filter((job) => job.id !== response.data.data.id)];
      jobsRef.current = nextJobs;
      setJobs(nextJobs);
      requestScrollToEnd(true);
      setCurrentInput('');
      pendingSubmission.current = null;
    } catch (error) {
      console.error('AI search failed:', error);
      setErrorText(isAxiosError(error) && error.response?.status === 503
        ? '지금은 대기 중인 요청이 많아요. 잠시 후 다시 보내 주세요.'
        : '요청을 접수하지 못했어요. 잠시 후 다시 보내 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const navigateToDetail = (isbn: string) => {
    onClose();
    router.push(`/book/${isbn}`);
  };

  const renderMessage = ({ item }: { item: ChatMessage }): React.ReactElement => {
    if (item.type === 'status') {
      return <ShimmerStatusText text={item.text} style={styles.statusText} containerStyle={styles.statusRow} active={isVisible} />;
    }
    const hasBooks = item.results && item.results.length > 0;
    return (
      <>
        <View style={[
          styles.messageBubble,
          item.type === 'user' ? styles.userBubble : styles.aiBubble,
        ]}>
          <Text style={item.type === 'user' ? styles.userText : styles.aiText}>{item.text}</Text>
        </View>
        {hasBooks ? (
          <AiRecommendationCards books={item.results!} onPressBook={navigateToDetail} />
        ) : null}
      </>
    );
  };

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
                <View style={styles.modalTitleGroup}>
                  <Text style={styles.modalTitle}>AI 사서</Text>
                  <Text style={styles.modalSubtitle}>이전 질문과 연결되지 않아요</Text>
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isAuthenticated ? (
                <View style={styles.chatArea}>
                  <ScrollView
                    ref={scrollViewRef}
                    style={styles.chatList}
                    contentContainerStyle={[
                      styles.chatListContent,
                      newResponseKind ? styles.chatListContentWithFloatingButton : null,
                    ]}
                    keyboardShouldPersistTaps="handled"
                    onScroll={handleChatScroll}
                    onScrollBeginDrag={() => {
                      userScrolledRef.current = true;
                      scrollInitializedRef.current = true;
                      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
                      scrollTimerRef.current = null;
                      pendingScrollRef.current = null;
                    }}
                    onContentSizeChange={flushPendingScroll}
                    onLayout={flushPendingScroll}
                    scrollEventThrottle={16}
                  >
                    {chatHistory.map((item) => (
                      <React.Fragment key={item.id}>
                        {renderMessage({ item })}
                      </React.Fragment>
                    ))}
                  </ScrollView>

                  {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

                  <View style={styles.inputContainer} onLayout={(event) => setInputHeight(event.nativeEvent.layout.height)}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="원하는 책의 조건을 적어주세요"
                      placeholderTextColor={c.inkFaint}
                      accessibilityHint="이전 질문은 반영되지 않아요. 원하는 조건을 함께 적어주세요."
                      value={currentInput}
                      onChangeText={setCurrentInput}
                      onSubmitEditing={handleSendMessage}
                      returnKeyType="send"
                      maxLength={500}
                      editable={!isSubmitting}
                    />
                    <TouchableOpacity onPress={handleSendMessage} style={styles.sendButton} disabled={isSubmitting}>
                      <Text style={styles.sendButtonText}>→</Text>
                    </TouchableOpacity>
                  </View>
                  {newResponseKind ? (
                    <View style={[styles.newResponseRow, { bottom: inputHeight + 8 }]} pointerEvents="box-none">
                      <TouchableOpacity
                        style={styles.newResponseButton}
                        onPress={() => requestScrollToEnd(true)}
                        accessibilityRole="button"
                        accessibilityLabel={newResponseKind === 'results' ? '새 결과 보기' : '검색 상태 보기'}
                      >
                        <Text style={styles.newResponseText}>
                          {newResponseKind === 'results' ? '새 결과 보기 ↓' : '검색 상태 보기 ↓'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
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
    errorText: {
      color: '#B84848',
      fontSize: 12,
      paddingHorizontal: 16,
      paddingBottom: 8,
      fontFamily: 'NotoSerifKR-Regular',
    },
    chatArea: {
      flex: 1,
    },
    newResponseRow: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 1,
    },
    newResponseButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.text,
      borderRadius: 22,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 4,
    },
    newResponseText: {
      color: c.background,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 12,
      lineHeight: 18,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      letterSpacing: -0.3,
    },
    modalTitleGroup: {
      gap: 3,
    },
    modalSubtitle: {
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 11,
      lineHeight: 16,
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
    chatList: {
      flex: 1,
      paddingHorizontal: 16,
    },
    chatListContent: {
      paddingVertical: 16,
    },
    chatListContentWithFloatingButton: {
      paddingBottom: 68,
    },
    statusRow: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      marginLeft: 12,
      marginVertical: 8,
    },
    statusText: {
      color: c.text,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 11,
      lineHeight: 16,
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
