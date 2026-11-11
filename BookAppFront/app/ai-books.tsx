import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { isAxiosError } from 'axios';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import AiBookChoiceCard from '@/components/AiBookChoiceCard';
import BookmarkMascot from '@/components/BookmarkMascot';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { aiJobApi, type AiSearchJob } from '@/src/services/api';
import type { RootState } from '@/src/store';

const STORAGE_PREFIX = 'ai-book-selection-job';
const SEARCH_EXAMPLES = ['마음이 편안해지는 소설', '몰입감 있는 짧은 책'];
type SelectionStep = 'results' | 'compare' | 'selected';

const isPending = (job: AiSearchJob | null) => job?.status === 'QUEUED' || job?.status === 'RUNNING';

function failedMessage(job: AiSearchJob) {
  if (job.error_code === 'INTERRUPTED') return '서버가 다시 시작되어 검색이 중단됐어요.';
  if (job.error_code === 'TIMEOUT') return '검색 시간이 초과됐어요.';
  return '책을 찾는 중 문제가 생겼어요.';
}

export default function AiBookSelectionScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const theme = useColorScheme() ?? 'dark';
  const c = Colors[theme];
  const styles = getStyles(theme);
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const storageKey = user?.id ? `${STORAGE_PREFIX}:${user.id}` : null;
  const scrollRef = useRef<ScrollView>(null);
  const pendingSubmission = useRef<{ query: string; key: string } | null>(null);
  const resetInProgress = useRef(false);
  const [query, setQuery] = useState('');
  const [job, setJob] = useState<AiSearchJob | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [selectionMessage, setSelectionMessage] = useState('');
  const [selectedIsbns, setSelectedIsbns] = useState<string[]>([]);
  const [chosenIsbn, setChosenIsbn] = useState<string | null>(null);
  const [step, setStep] = useState<SelectionStep>('results');
  const jobId = job?.id;
  const jobStatus = job?.status;

  useEffect(() => {
    setJob(null);
    setSelectedIsbns([]);
    setChosenIsbn(null);
    setStep('results');
    setErrorText('');
    if (!isAuthenticated || !storageKey) {
      setRestoring(false);
      setRestoreFailed(false);
      return;
    }
    let active = true;
    setRestoring(true);
    setRestoreFailed(false);
    const restore = async () => {
      try {
        const id = await AsyncStorage.getItem(storageKey);
        if (!id) return;
        try {
          const response = await aiJobApi.get(id);
          if (active) {
            setJob(response.data.data);
            setQuery(response.data.data.query);
          }
        } catch (error) {
          if (isAxiosError(error) && error.response?.status === 404) {
            await AsyncStorage.removeItem(storageKey);
          } else if (active) {
            setRestoreFailed(true);
          }
        }
      } catch {
        if (active) setRestoreFailed(true);
      } finally {
        if (active) setRestoring(false);
      }
    };
    void restore();
    return () => { active = false; };
  }, [isAuthenticated, storageKey, restoreAttempt]);

  useEffect(() => {
    if (!isFocused || !jobId || (jobStatus !== 'QUEUED' && jobStatus !== 'RUNNING')) return;
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await aiJobApi.get(jobId);
        if (active) {
          setJob(response.data.data);
          setErrorText('');
        }
      } catch {
        if (active) setErrorText('검색 상태를 확인하지 못했어요. 연결을 확인해 주세요.');
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [isFocused, jobId, jobStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step, job?.id, job?.status]);

  const startSearch = async (queryOverride?: string) => {
    if (!isAuthenticated || !storageKey || isSubmitting || isPending(job)) return;
    const trimmed = (queryOverride ?? query).trim();
    if (!trimmed) return;
    const submission = pendingSubmission.current?.query === trimmed
      ? pendingSubmission.current
      : { query: trimmed, key: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    pendingSubmission.current = submission;
    Keyboard.dismiss();
    setIsSubmitting(true);
    setErrorText('');
    try {
      const response = await aiJobApi.submit(submission.query, submission.key);
      setJob(response.data.data);
      setQuery(submission.query);
      setSelectedIsbns([]);
      setChosenIsbn(null);
      setStep('results');
      pendingSubmission.current = null;
      try {
        await AsyncStorage.setItem(storageKey, response.data.data.id);
      } catch (storageError) {
        console.warn('AI 검색 복원 정보 저장 실패:', storageError);
      }
    } catch (error) {
      setErrorText(isAxiosError(error) && error.response?.status === 503
        ? '지금은 대기 중인 요청이 많아요. 잠시 후 다시 시도해 주세요.'
        : '검색 요청을 접수하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startOver = async () => {
    if (isPending(job) || resetInProgress.current) return;
    resetInProgress.current = true;
    if (storageKey) {
      try {
        await AsyncStorage.removeItem(storageKey);
      } catch (error) {
        console.warn('AI 검색 복원 정보 삭제 실패:', error);
      }
    }
    setJob(null);
    setQuery('');
    setSelectedIsbns([]);
    setChosenIsbn(null);
    setStep('results');
    setErrorText('');
    setSelectionMessage('');
    pendingSubmission.current = null;
    resetInProgress.current = false;
  };

  const toggleCandidate = (isbn: string) => {
    if (selectedIsbns.includes(isbn)) {
      setSelectedIsbns(selectedIsbns.filter((selected) => selected !== isbn));
      setSelectionMessage('');
    } else if (selectedIsbns.length < 2) {
      setSelectedIsbns([...selectedIsbns, isbn]);
      setSelectionMessage('');
    } else {
      setSelectionMessage('두 권까지 비교할 수 있어요. 다른 책을 고르려면 먼저 하나를 해제해 주세요.');
    }
  };

  const chooseBook = (isbn: string) => {
    setChosenIsbn(isbn);
    setStep('selected');
  };

  const openDetail = (isbn: string) => router.push(`/book/${isbn}`);
  const books = job?.status === 'SUCCEEDED' ? (job.results ?? []).slice(0, 5) : [];
  const compareBooks = books.filter((book) => selectedIsbns.includes(book.isbn));
  const chosenBook = books.find((book) => book.isbn === chosenIsbn);
  const showCompareAction = job?.status === 'SUCCEEDED' && step === 'results' && selectedIsbns.length === 2;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="뒤로 가기">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle}>AI 사서</Text>
          <Text style={styles.headerSubtitle}>함께 한 권을 골라요</Text>
        </View>
        <BookmarkMascot state="idle" size={36} compact />
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!isAuthenticated ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="idle" size={190} />
            <Text style={styles.title}>로그인 후 함께 골라요</Text>
            <Text style={styles.description}>AI 사서가 취향에 맞는 책을 찾아드릴게요.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/auth/login')} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>로그인하기</Text>
            </TouchableOpacity>
          </View>
        ) : restoring ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="idle" size={170} />
            <ActivityIndicator color={c.text} style={styles.indicator} />
            <Text style={styles.description}>진행 중이던 추천을 확인하고 있어요.</Text>
          </View>
        ) : restoreFailed ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="idle" size={170} />
            <Text style={styles.title}>이전 검색을 확인하지 못했어요</Text>
            <Text style={styles.description}>연결을 확인한 뒤 다시 시도해 주세요.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setRestoreAttempt((value) => value + 1)} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>다시 확인하기</Text>
            </TouchableOpacity>
          </View>
        ) : !job ? (
          <View style={styles.startStage}>
            <View style={styles.startMascot}><BookmarkMascot state="idle" size={190} /></View>
            <Text style={styles.eyebrow}>FIND YOUR NEXT BOOK</Text>
            <Text style={styles.title}>오늘 읽을 한 권을{`\n`}함께 골라볼까요?</Text>
            <Text style={styles.description}>찾고 싶은 분위기나 주제를 적어주세요. 책을 찾은 뒤 마음에 드는 후보를 비교할 수 있어요.</Text>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="예: 조용한 밤에 읽을 짧은 소설"
              placeholderTextColor={c.inkFaint}
              multiline
              maxLength={500}
              accessibilityLabel="찾고 싶은 책의 조건"
            />
            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
            <TouchableOpacity style={[styles.primaryButton, (!query.trim() || isSubmitting) && styles.disabledButton]} onPress={() => { void startSearch(); }} disabled={!query.trim() || isSubmitting} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>{isSubmitting ? '요청을 보내는 중...' : '책 찾아보기 →'}</Text>
            </TouchableOpacity>
            <View style={styles.exampleRow}>
              {SEARCH_EXAMPLES.map((example) => (
                <TouchableOpacity key={example} style={styles.exampleButton} onPress={() => setQuery(example)} accessibilityRole="button">
                  <Text style={styles.exampleText}>{example}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : isPending(job) ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="searching" size={230} active={isFocused} />
            <Text style={styles.eyebrow}>BOOK SEARCH</Text>
            <Text style={styles.title}>{job.status === 'QUEUED' ? '차례를 기다리고 있어요' : '책을 찾고 있어요'}</Text>
            <Text style={styles.description}>{job.status === 'QUEUED' ? '요청을 받았어요. 잠시만 기다려주세요.' : 'AI 사서가 어울리는 책을 살펴보고 있어요.'}</Text>
            <View style={styles.queryBox}><Text style={styles.queryLabel}>찾고 있는 책</Text><Text style={styles.queryText}>{job.query}</Text></View>
            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
            <Text style={styles.helperText}>화면을 닫아도 검색은 계속돼요. 다시 열면 결과를 확인할 수 있어요.</Text>
          </View>
        ) : job.status === 'FAILED' ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="idle" size={170} />
            <Text style={styles.title}>{failedMessage(job)}</Text>
            <Text style={styles.description}>같은 조건으로 다시 찾아볼 수 있어요.</Text>
            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
            <TouchableOpacity style={styles.primaryButton} onPress={() => { void startSearch(job.query); }} disabled={isSubmitting} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>{isSubmitting ? '요청을 보내는 중...' : '다시 찾아보기'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={() => { void startOver(); }}><Text style={styles.textButtonText}>다른 조건으로 찾기</Text></TouchableOpacity>
          </View>
        ) : books.length === 0 ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="empty" size={220} />
            <Text style={styles.title}>{job.result_outcome === 'DEGRADED_EMPTY' ? '지금은 추천을 확인하지 못했어요' : '맞는 책을 찾지 못했어요'}</Text>
            <Text style={styles.description}>{job.result_outcome === 'DEGRADED_EMPTY'
              ? '책을 찾는 서비스에 일시적인 문제가 있어요. 잠시 후 같은 조건으로 다시 찾아주세요.'
              : '분위기나 주제를 조금 바꿔 다시 찾아볼까요?'}</Text>
            {job.result_outcome === 'DEGRADED_EMPTY' ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => { void startSearch(job.query); }} disabled={isSubmitting} accessibilityRole="button">
                <Text style={styles.primaryButtonText}>{isSubmitting ? '요청을 보내는 중...' : '같은 조건으로 다시 찾기'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.primaryButton} onPress={() => { void startOver(); }} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>다른 조건으로 찾기</Text>
            </TouchableOpacity>
          </View>
        ) : step === 'selected' && chosenBook ? (
          <View style={styles.stage}>
            <View style={styles.stageMascot}><BookmarkMascot state="selected" size={190} /></View>
            <Text style={styles.eyebrow}>YOUR PICK</Text>
            <Text style={styles.title}>이번에는 이 책으로 골랐어요</Text>
            <Text style={styles.description}>책 상세에서 내용을 더 살펴보고 서재에 담을 수 있어요.</Text>
            <AiBookChoiceCard book={chosenBook} label="선택한 책" showDetailsAction={false} onDetails={() => openDetail(chosenBook.isbn)} />
            <TouchableOpacity style={styles.primaryButton} onPress={() => openDetail(chosenBook.isbn)} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>책 상세 보기 →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={() => setStep(selectedIsbns.length === 2 ? 'compare' : 'results')}><Text style={styles.textButtonText}>다른 후보 살펴보기</Text></TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={() => { void startOver(); }}><Text style={styles.textButtonText}>새 추천 받기</Text></TouchableOpacity>
          </View>
        ) : step === 'compare' ? (
          <View style={styles.stage}>
            <View style={styles.stageMascot}><BookmarkMascot state="comparing" size={128} /></View>
            <Text style={styles.eyebrow}>COMPARE TWO BOOKS</Text>
            <Text style={styles.title}>두 권을 살펴볼까요?</Text>
            <Text style={styles.description}>추천 이유와 책 소개의 근거를 차례로 확인해 보세요. 마음이 가는 한 권을 직접 고를 수 있어요.</Text>
            {compareBooks.map((book, index) => (
              <AiBookChoiceCard key={`${book.isbn}-${index}`} book={book} position={index + 1} showEvidence onDetails={() => openDetail(book.isbn)} onChoose={() => chooseBook(book.isbn)} />
            ))}
            <TouchableOpacity style={styles.textButton} onPress={() => setStep('results')}><Text style={styles.textButtonText}>다른 후보 비교하기</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.stage}>
            <View style={styles.resultIntro}>
              <BookmarkMascot state="idle" size={82} compact />
              <View style={styles.resultIntroText}>
                <Text style={styles.eyebrow}>RECOMMENDATIONS</Text>
                <Text style={styles.title}>한 권을 골라요</Text>
              </View>
            </View>
            <Text style={styles.description}>두 권을 고르면 추천 이유를 비교할 수 있어요. 바로 한 권을 결정해도 좋아요.</Text>
            <View style={styles.queryBox}><Text style={styles.queryLabel}>찾은 조건</Text><Text style={styles.queryText} numberOfLines={2}>{job.query}</Text></View>
            {job.result_outcome === 'FALLBACK' || books.some((book) => book.ranking_status === 'FALLBACK') ? (
              <Text style={styles.helperText}>{job.result_basis === 'SHARED_THEMES'
                ? 'AI 재정렬이 어려워 기준 작가의 작품과 공통 주제가 확인된 책을 골랐어요.'
                : 'AI 재정렬이 어려워 검색 결과를 기준으로 책을 골랐어요.'}</Text>
            ) : null}
            <Text style={styles.countText}>추천 후보 {books.length}권</Text>
            {books.map((book, index) => (
              <AiBookChoiceCard
                key={`${book.isbn}-${index}`}
                book={book}
                position={index + 1}
                selected={selectedIsbns.includes(book.isbn)}
                onToggle={() => toggleCandidate(book.isbn)}
                onChoose={() => chooseBook(book.isbn)}
                onDetails={() => openDetail(book.isbn)}
              />
            ))}
            {selectionMessage ? <Text style={styles.helperText}>{selectionMessage}</Text> : null}
            <TouchableOpacity style={styles.textButton} onPress={() => { void startOver(); }}><Text style={styles.textButtonText}>새 추천 받기</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
      {showCompareAction ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity style={styles.footerButton} onPress={() => setStep('compare')} accessibilityRole="button">
            <Text style={styles.footerButtonText}>선택한 두 권 비교하기 →</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: 'light' | 'dark') => {
  const c = Colors[theme];
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backText: { color: c.text, fontSize: 26, lineHeight: 32 },
    headerTitleBlock: { flex: 1 },
    headerTitle: { color: c.text, fontFamily: 'NotoSerifKR-Regular', fontSize: 20, lineHeight: 28 },
    headerSubtitle: { color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 11, marginTop: 2 },
    scroll: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 48 },
    centerStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
    startStage: { flex: 1, paddingTop: 8 },
    stage: { flex: 1 },
    startMascot: { alignItems: 'center', marginBottom: 4 },
    stageMascot: { alignItems: 'center', marginBottom: 4 },
    eyebrow: { alignSelf: 'flex-start', color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 10, letterSpacing: 1.2, marginBottom: 12 },
    title: { alignSelf: 'stretch', color: c.text, fontFamily: 'NotoSerifKR-Regular', fontSize: 23, lineHeight: 34, marginBottom: 12 },
    description: { alignSelf: 'stretch', color: c.inkSoft, fontFamily: 'NotoSerifKR-Regular', fontSize: 13, lineHeight: 21, marginBottom: 20 },
    indicator: { marginBottom: 18 },
    input: { minHeight: 100, maxHeight: 170, padding: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, fontFamily: 'NotoSerifKR-Regular', fontSize: 14, lineHeight: 22, textAlignVertical: 'top', marginBottom: 12 },
    primaryButton: { minHeight: 52, alignSelf: 'stretch', backgroundColor: c.text, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
    primaryButtonText: { color: c.background, fontFamily: 'Pretendard-SemiBold', fontSize: 13 },
    disabledButton: { opacity: 0.45 },
    exampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
    exampleButton: { borderWidth: 1, borderColor: c.line, paddingVertical: 10, paddingHorizontal: 12 },
    exampleText: { color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 11 },
    errorText: { alignSelf: 'stretch', color: c.danger, fontFamily: 'NotoSerifKR-Regular', fontSize: 12, lineHeight: 18, marginBottom: 12 },
    helperText: { alignSelf: 'stretch', color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 11, lineHeight: 18, marginTop: 16, marginBottom: 14 },
    queryBox: { alignSelf: 'stretch', borderLeftWidth: 2, borderLeftColor: c.text, paddingLeft: 12, paddingVertical: 4, marginBottom: 22 },
    queryLabel: { color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 10, marginBottom: 6 },
    queryText: { color: c.text, fontFamily: 'NotoSerifKR-Regular', fontSize: 13, lineHeight: 20 },
    textButton: { minHeight: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
    textButtonText: { color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 12, textDecorationLine: 'underline' },
    resultIntro: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    resultIntroText: { flex: 1 },
    countText: { color: c.text, fontFamily: 'NotoSerifKR-Regular', fontSize: 15, marginBottom: 12 },
    footer: { paddingHorizontal: 22, paddingTop: 12, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line },
    footerButton: { minHeight: 48, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' },
    footerButtonText: { color: c.background, fontFamily: 'Pretendard-SemiBold', fontSize: 13 },
  });
};
