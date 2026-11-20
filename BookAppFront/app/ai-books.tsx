import AppButton from '@/components/ui/AppButton';
import AppTextInput from '@/components/ui/AppTextInput';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isAxiosError } from 'axios';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import AiBookChoiceCard from '@/components/AiBookChoiceCard';
import BookmarkMascot from '@/components/BookmarkMascot';
import RecommendationFeedback from '@/components/RecommendationFeedback';
import { ArrowLeft } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { aiJobApi, type AiSearchJob } from '@/src/services/api';
import type { RootState } from '@/src/store';
import { AI_SEARCH_EXAMPLES } from '@/src/constants/aiSearchExamples';
import { watchAiJob } from '@/src/utils/aiJobStatusWatcher';
import { normalizeAiPrompt, resolveAiSearchEntry } from '@/src/utils/aiSearchEntry';

const STORAGE_PREFIX = 'ai-book-selection-job';
const STATUS_POLL_INTERVAL_MS = 3000;
const COMPLETION_SIGNAL_CHECK_INTERVAL_MS = 6000;
type SelectionStep = 'results' | 'compare' | 'selected';

const isPending = (job: AiSearchJob | null) => job?.status === 'QUEUED' || job?.status === 'RUNNING';

function failedMessage(job: AiSearchJob) {
  if (job.error_code === 'INTERRUPTED') return '서버가 다시 시작되어 검색이 중단됐어요.';
  if (job.error_code === 'TIMEOUT') return '검색 시간이 초과됐어요.';
  return '책을 찾는 중 문제가 생겼어요.';
}

export default function AiBookSelectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string | string[] }>();
  const entryPrompt = normalizeAiPrompt(params.prompt);
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const theme = useColorScheme() ?? 'dark';
  const c = Colors[theme];
  const styles = getStyles(theme);
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const storageKey = user?.id ? `${STORAGE_PREFIX}:${user.id}` : null;
  const scrollRef = useRef<ScrollView>(null);
  const feedbackOffset = useRef(0);
  const revealFeedbackAfterLayout = useRef(false);
  const pendingSubmission = useRef<{ query: string; key: string } | null>(null);
  const resetInProgress = useRef(false);
  const submittedEntryKey = useRef<string | null>(null);
  const [query, setQuery] = useState(entryPrompt);
  const [deferredPrompt, setDeferredPrompt] = useState('');
  const [job, setJob] = useState<AiSearchJob | null>(null);
  const [restoring, setRestoring] = useState(isAuthenticated);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [selectionMessage, setSelectionMessage] = useState('');
  const [selectedIsbns, setSelectedIsbns] = useState<string[]>([]);
  const [chosenIsbn, setChosenIsbn] = useState<string | null>(null);
  const [step, setStep] = useState<SelectionStep>('results');
  const pendingJobId = isAuthenticated && isPending(job) ? job?.id : undefined;
  const aiSearchStreamReady = useSelector((state: RootState) => state.notifications.aiSearchStreamReady);
  const completionSignaled = useSelector((state: RootState) =>
    !!pendingJobId && state.notifications.completedAiSearchIds.includes(pendingJobId),
  );

  useEffect(() => {
    if (submittedEntryKey.current && submittedEntryKey.current === storageKey && isAuthenticated && !entryPrompt) {
      submittedEntryKey.current = null;
      return;
    }
    submittedEntryKey.current = null;
    setJob(null);
    setQuery(entryPrompt);
    setDeferredPrompt('');
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
        if (!id || !active) return;
        try {
          const response = await aiJobApi.get(id);
          if (active) {
            const entry = resolveAiSearchEntry(entryPrompt, response.data.data);
            setJob(entry.job);
            setQuery(entry.query);
            setDeferredPrompt(entry.deferredPrompt);
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
  }, [isAuthenticated, storageKey, restoreAttempt, entryPrompt]);

  useEffect(() => {
    if (!isFocused || !pendingJobId) return;
    const intervalMs = aiSearchStreamReady && !completionSignaled
      ? COMPLETION_SIGNAL_CHECK_INTERVAL_MS
      : STATUS_POLL_INTERVAL_MS;
    const watcher = watchAiJob(async (signal) => {
      try {
        const response = await aiJobApi.get(pendingJobId, signal);
        if (signal.aborted) return false;
        const current = response.data.data;
        setJob(current);
        setErrorText('');
        return isPending(current);
      } catch {
        if (!signal.aborted) setErrorText('검색 상태를 확인하지 못했어요. 연결을 확인해 주세요.');
        return true;
      }
    }, intervalMs);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void watcher.checkNow();
    });
    return () => {
      appState?.remove();
      watcher.stop();
    };
  }, [aiSearchStreamReady, completionSignaled, isFocused, pendingJobId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step, job?.id, job?.status]);

  const startSearch = async (queryOverride?: string) => {
    if (!isAuthenticated || !storageKey || restoring || restoreFailed || isSubmitting || isPending(job)) return;
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
        // Refresh should restore the submitted job, rather than reapply its entry draft.
        if (entryPrompt) {
          submittedEntryKey.current = storageKey;
          router.setParams({ prompt: undefined });
        }
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

  const startOver = async (nextQuery = '') => {
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
    setQuery(nextQuery);
    setDeferredPrompt('');
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
  const hasFallback = job?.result_outcome === 'FALLBACK' || books.some((book) => book.ranking_status === 'FALLBACK');
  const chosenBook = books.find((book) => book.isbn === chosenIsbn);
  const showCompareAction = job?.status === 'SUCCEEDED' && step === 'results' && selectedIsbns.length === 2;
  const feedbackJob = isAuthenticated && user && !restoring && !restoreFailed
    && job?.status === 'SUCCEEDED' && job.result_outcome !== 'DEGRADED_EMPTY' ? job : null;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backButton} accessibilityRole="button" accessibilityLabel="뒤로 가기">
          <ArrowLeft size={22} color={c.text} aria-hidden />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle}>AI 사서 갈피</Text>
          <Text style={styles.headerSubtitle}>함께 한 권을 골라요</Text>
        </View>
        <BookmarkMascot state="idle" size={36} compact />
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {deferredPrompt && job && !restoring ? (
          <View style={styles.fallbackNotice}>
            <Text style={styles.fallbackTitle}>새로 선택한 조건을 기억하고 있어요</Text>
            <Text style={styles.fallbackText}>{deferredPrompt}</Text>
            <Text style={styles.helperText}>{isPending(job) ? '진행 중인 검색이 끝나면 새 조건으로 찾아볼 수 있어요.' : '이전 검색을 마쳤어요. 선택한 조건으로 새 추천을 준비할까요?'}</Text>
            <AppButton title="선택한 조건으로 새로 찾기" variant="secondary" disabled={isPending(job)}
              onPress={() => { void startOver(deferredPrompt); }} />
          </View>
        ) : null}
        {!isAuthenticated ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="idle" size={150} />
            <Text style={styles.title}>로그인 후 함께 골라요</Text>
            <Text style={styles.description}>갈피와 취향에 맞는 책을 함께 찾아봐요.</Text>
            {entryPrompt ? <View style={[styles.queryBox, { alignSelf: 'stretch' }]}>
              <Text style={styles.queryLabel}>선택한 조건</Text>
              <Text style={styles.queryText}>{entryPrompt}</Text>
            </View> : null}
            <AppButton title="로그인하고 이어서 고르기" style={styles.primaryButton}
              onPress={() => router.push({ pathname: '/auth/login', params: { returnTo: 'ai-books', prompt: entryPrompt } })} />
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
            <AppButton title={"다시 확인하기"} variant="primary" style={styles.primaryButton} onPress={() => setRestoreAttempt((value) => value + 1)} accessibilityRole="button" />
          </View>
        ) : !job ? (
          <View style={styles.startStage}>
            <View style={styles.startMascot}><BookmarkMascot state="idle" size={150} /></View>
            <Text style={styles.eyebrow}>FIND YOUR NEXT BOOK</Text>
            <Text style={styles.title}>갈피와 오늘 읽을{`\n`}한 권을 골라볼까요?</Text>
            <Text style={styles.description}>찾고 싶은 분위기나 주제를 적어주세요. 책을 찾은 뒤 마음에 드는 후보를 비교할 수 있어요.</Text>
            <AppTextInput
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
            <AppButton title={isSubmitting ? '요청을 보내는 중...' : '책 찾아보기 →'}
              style={styles.primaryButton} onPress={() => { void startSearch(); }}
              disabled={!query.trim()} loading={isSubmitting} />
            <View style={styles.exampleRow}>
              {AI_SEARCH_EXAMPLES.map((example) => (
                <AppButton title={example.label} variant="secondary" compact key={example.label} style={styles.exampleButton} onPress={() => setQuery(example.query)} accessibilityRole="button" />
              ))}
            </View>
          </View>
        ) : isPending(job) ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="searching" size={230} active={isFocused} />
            <Text style={styles.eyebrow}>BOOK SEARCH</Text>
            <Text style={styles.title}>{job.status === 'QUEUED' ? '차례를 기다리고 있어요' : '책을 찾고 있어요'}</Text>
            <Text style={styles.description}>{job.status === 'QUEUED' ? '요청을 받았어요. 잠시만 기다려주세요.' : '갈피가 어울리는 책을 살펴보고 있어요.'}</Text>
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
            <AppButton title={isSubmitting ? '요청을 보내는 중...' : '다시 찾아보기'} variant="primary" style={styles.primaryButton} onPress={() => { void startSearch(job.query); }} disabled={isSubmitting} accessibilityRole="button" />
            <AppButton title={"다른 조건으로 찾기"} variant="ghost" compact style={styles.textButton} onPress={() => { void startOver(); }} />
          </View>
        ) : books.length === 0 ? (
          <View style={styles.centerStage}>
            <BookmarkMascot state="empty" size={220} />
            <Text style={styles.title}>{job.result_outcome === 'DEGRADED_EMPTY' ? '지금은 추천을 확인하지 못했어요' : '맞는 책을 찾지 못했어요'}</Text>
            <Text style={styles.description}>{job.result_outcome === 'DEGRADED_EMPTY'
              ? '책을 찾는 서비스에 일시적인 문제가 있어요. 잠시 후 같은 조건으로 다시 찾아주세요.'
              : '분위기나 주제를 조금 바꿔 다시 찾아볼까요?'}</Text>
            {job.result_outcome === 'DEGRADED_EMPTY' ? (
              <AppButton title={isSubmitting ? '요청을 보내는 중...' : '같은 조건으로 다시 찾기'} variant="primary" style={styles.primaryButton} onPress={() => { void startSearch(job.query); }} disabled={isSubmitting} accessibilityRole="button" />
            ) : null}
            <AppButton title={"다른 조건으로 찾기"} variant="primary" style={styles.primaryButton} onPress={() => { void startOver(); }} accessibilityRole="button" />
          </View>
        ) : step === 'selected' && chosenBook ? (
          <View style={styles.stage}>
            <View style={styles.stageMascot}><BookmarkMascot state="selected" size={150} /></View>
            <Text style={styles.eyebrow}>YOUR PICK</Text>
            <Text style={styles.title}>이번에는 이 책으로 골랐어요</Text>
            <Text style={styles.description}>책 상세에서 내용을 더 살펴보고 서재에 담을 수 있어요.</Text>
            <AiBookChoiceCard book={chosenBook} label="선택한 책" showDetailsAction={false} onDetails={() => openDetail(chosenBook.isbn)} />
            <AppButton title={"책 상세 보기 →"} variant="primary" style={styles.primaryButton} onPress={() => openDetail(chosenBook.isbn)} accessibilityRole="button" />
            <AppButton title={"다른 후보 살펴보기"} variant="ghost" compact style={styles.textButton} onPress={() => setStep(selectedIsbns.length === 2 ? 'compare' : 'results')} />
          </View>
        ) : step === 'compare' ? (
          <View style={styles.stage}>
            <View style={styles.stageMascot}><BookmarkMascot state="comparing" size={128} /></View>
            <Text style={styles.eyebrow}>COMPARE TWO BOOKS</Text>
            <Text style={styles.title}>두 권을 살펴볼까요?</Text>
            <Text style={styles.description}>{hasFallback
              ? '두 권의 제목과 저자를 살펴보고, 책 상세에서 소개를 확인해 보세요. 마음이 가는 한 권을 고를 수 있어요.'
              : '갈피와 함께 추천 이유와 책 소개의 근거를 살펴봐요. 마음이 가는 한 권을 직접 고를 수 있어요.'}</Text>
            {compareBooks.map((book, index) => (
              <AiBookChoiceCard key={`${book.isbn}-${index}`} book={book} position={index + 1} showEvidence onDetails={() => openDetail(book.isbn)} onChoose={() => chooseBook(book.isbn)} />
            ))}
            <AppButton title={"다른 후보 비교하기"} variant="ghost" compact style={styles.textButton} onPress={() => setStep('results')} />
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
            <Text style={styles.description}>{hasFallback
              ? '책을 살펴보고 마음에 드는 한 권을 골라보세요.'
              : '두 권을 고르면 추천 이유를 비교할 수 있어요. 바로 한 권을 결정해도 좋아요.'}</Text>
            <View style={styles.queryBox}><Text style={styles.queryLabel}>찾은 조건</Text><Text style={styles.queryText} numberOfLines={2}>{job.query}</Text></View>
            {hasFallback ? (
              <View style={styles.fallbackNotice} accessibilityRole="summary">
                <Text style={styles.fallbackTitle}>AI 추천 이유를 지금은 보여드릴 수 없어요</Text>
                <Text style={styles.fallbackText}>{job.result_basis === 'SHARED_THEMES'
                  ? '기준 작가와 공통 주제가 있는 책이에요. 상세에서 소개를 확인해 주세요.'
                  : '조건에 맞는 책을 찾았어요. 상세에서 소개를 확인해 주세요.'}</Text>
              </View>
            ) : null}
            <View style={styles.countRow}>
              <Text style={styles.countText}>{hasFallback ? '찾은 책' : '추천 후보'} {books.length}권</Text>
              {feedbackJob && books.length >= 3 ? (
                <AppButton title="추천 평가 ↓" compact variant="ghost" style={styles.feedbackShortcut}
                  onPress={() => scrollRef.current?.scrollTo({ y: feedbackOffset.current, animated: true })} />
              ) : null}
            </View>
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
          </View>
        )}
        {feedbackJob ? (
          <View key={`${user?.id}:${feedbackJob.id}`} style={styles.feedbackStage}
            onLayout={event => {
              feedbackOffset.current = event.nativeEvent.layout.y;
              if (revealFeedbackAfterLayout.current) {
                revealFeedbackAfterLayout.current = false;
                scrollRef.current?.scrollTo({ y: feedbackOffset.current, animated: true });
              }
            }}>
            <RecommendationFeedback jobId={feedbackJob.id} hasBooks={books.length > 0}
              onExpand={() => { revealFeedbackAfterLayout.current = true; }} />
            {books.length > 0 && step !== 'compare' ? (
              <AppButton title="새 추천 받기" variant="ghost" compact style={styles.textButton} onPress={() => { void startOver(); }} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {showCompareAction ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <AppButton title={"선택한 두 권 비교하기 →"} variant="primary" style={styles.footerButton} onPress={() => setStep('compare')} accessibilityRole="button" />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: 'light' | 'dark') => {
  const c = Colors[theme];
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.xs, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.line },
    backButton: { width: UI.iconButtonSize, height: UI.iconButtonSize, alignItems: 'center', justifyContent: 'center', borderRadius: UI.controlRadius },
    headerTitleBlock: { flex: 1 },
    headerTitle: { ...Typography.section, color: c.text },
    headerSubtitle: { ...Typography.caption, color: c.inkSoft, marginTop: 2 },
    scroll: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg, paddingBottom: SCREEN_LAYOUT.bottomPadding },
    centerStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: Spacing.xl },
    startStage: { flex: 1, paddingTop: Spacing.xs },
    stage: { flex: 1 },
    startMascot: { alignItems: 'center', marginBottom: Spacing.xxs },
    stageMascot: { alignItems: 'center', marginBottom: Spacing.xxs },
    eyebrow: { ...Typography.caption, color: c.inkSoft, letterSpacing: 1, marginBottom: Spacing.sm },
    title: { ...Typography.display, alignSelf: 'stretch', color: c.text, marginBottom: Spacing.sm },
    description: { ...Typography.body, alignSelf: 'stretch', color: c.inkSoft, marginBottom: Spacing.lg },
    indicator: { marginBottom: Spacing.md },
    input: { maxHeight: 180, marginBottom: Spacing.sm },
    primaryButton: { alignSelf: 'stretch' },
    disabledButton: { opacity: 0.45 },
    exampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.md },
    exampleButton: {},
    errorText: { ...Typography.body, alignSelf: 'stretch', color: c.danger, marginBottom: Spacing.sm },
    helperText: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.md, marginBottom: Spacing.sm },
    fallbackNotice: { backgroundColor: c.surface2, borderLeftWidth: 2, borderLeftColor: c.inkSoft, borderRadius: UI.controlRadius, padding: Spacing.md, marginBottom: Spacing.md },
    fallbackTitle: { ...Typography.label, color: c.text },
    fallbackText: { ...Typography.body, color: c.inkSoft, marginTop: Spacing.xxs },
    queryBox: { borderLeftWidth: 2, borderLeftColor: c.text, paddingLeft: Spacing.sm, paddingVertical: Spacing.xxs, marginBottom: Spacing.lg },
    queryLabel: { ...Typography.caption, color: c.inkSoft, marginBottom: Spacing.xs },
    queryText: { ...Typography.body, color: c.text },
    textButton: { alignSelf: 'stretch', marginTop: Spacing.xs },
    resultIntro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
    resultIntroText: { flex: 1 },
    countRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
    countText: { ...Typography.section, color: c.text },
    feedbackShortcut: { minHeight: UI.iconButtonSize, paddingHorizontal: Spacing.xs },
    feedbackStage: { marginTop: Spacing.sm, gap: Spacing.xs },
    footer: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.sm, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line },
    footerButton: {},
  });
};
