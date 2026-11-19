import { isAxiosError } from 'axios';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import AppButton from '@/components/ui/AppButton';
import ScreenState from '@/components/ui/ScreenState';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { operationsApi, type OperationsFeedback, type OperationsFeedbackPage, type OperationsSummary } from '@/src/services/api';
import type { RootState } from '@/src/store';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { feedbackCategories, feedbackStatuses, type FeedbackCategory, type FeedbackStatus } from '@/src/utils/feedback';

const uptimeUrl = 'https://github.com/Corinbeom/READ-ON-ME/actions/workflows/public-uptime.yml';
const uptimeApi = 'https://api.github.com/repos/Corinbeom/READ-ON-ME/actions/workflows/public-uptime.yml/runs?branch=main&status=completed&per_page=15';
type UptimeRun = { display_title: string; conclusion: string; run_started_at: string; event: string };

const dateLabel = (value: string) => new Date(value).toLocaleString('ko-KR');
const seconds = (value: number | null) => value == null ? '—' : `${(value / 1000).toFixed(1)}초`;

export default function OperationsScreen() {
  const { isAuthenticated, isLoading, user } = useSelector((state: RootState) => state.auth);
  if (isLoading) return <ScreenState title="로그인 상태를 확인하고 있어요" loading />;
  if (!isAuthenticated || !user) {
    return <ScreenState title="운영 계정으로 로그인해주세요" action="로그인"
      onAction={() => router.push({ pathname: '/auth/login', params: { returnTo: 'operations' } })} />;
  }
  return <OperationsDashboard key={user.id} />;
}

function OperationsDashboard() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [denied, setDenied] = useState(false);
  const [revision, setRevision] = useState(0);
  const [uptime, setUptime] = useState<UptimeRun | null>();
  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [status, setStatus] = useState<FeedbackStatus | ''>('');
  const [cursors, setCursors] = useState<number[]>([]);
  const [page, setPage] = useState<OperationsFeedbackPage | null>(null);
  const [pageError, setPageError] = useState('');
  const [expanded, setExpanded] = useState<number>();
  const [saving, setSaving] = useState<FeedbackStatus>();
  const [savingError, setSavingError] = useState('');
  const saveRequest = useRef<AbortController | null>(null);
  const canLoadFeedback = summary !== null && !denied;
  const beforeId = cursors.at(-1);
  const nextCursor = page?.nextBeforeId;

  const refresh = () => {
    setSummaryError('');
    setPageError('');
    setSavingError('');
    setRevision(value => value + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    void operationsApi.summary(controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) {
        setSummary(data);
        setDenied(false);
      }
    }).catch(failure => {
      if (controller.signal.aborted) return;
      if (isAxiosError(failure) && failure.response?.status === 403) {
        setSummary(null);
        setPage(null);
        setDenied(true);
      } else {
        setSummaryError('운영 정보를 불러오지 못했어요.');
      }
    });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    if (!canLoadFeedback) return;
    const controller = new AbortController();
    void operationsApi.feedback({ category, status, before_id: beforeId }, controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setPage(data);
    }).catch(() => {
      if (!controller.signal.aborted) setPageError('피드백을 불러오지 못했어요.');
    });
    return () => controller.abort();
  }, [beforeId, canLoadFeedback, category, revision, status]);

  useEffect(() => {
    if (!canLoadFeedback) return;
    const controller = new AbortController();
    void fetch(uptimeApi, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Uptime is unavailable');
      const { workflow_runs }: { workflow_runs: UptimeRun[] } = await response.json();
      if (!controller.signal.aborted) setUptime(workflow_runs.find(run => run.display_title === 'Public uptime') ?? null);
    }).catch(() => {
      if (!controller.signal.aborted) setUptime(null);
    });
    return () => controller.abort();
  }, [canLoadFeedback, revision]);

  useEffect(() => () => saveRequest.current?.abort(), []);

  const resetList = () => {
    setCursors([]);
    setPage(null);
    setPageError('');
    setSavingError('');
    setExpanded(undefined);
  };

  const saveStatus = async (entry: OperationsFeedback, next: FeedbackStatus) => {
    if (saveRequest.current || entry.status === next) return;
    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving(next);
    setSavingError('');
    try {
      await operationsApi.updateStatus(entry, next, controller.signal);
      if (!controller.signal.aborted) {
        const updated = { ...entry, status: next, statusVersion: entry.statusVersion + 1 };
        setPage(current => current && ({ ...current, items: current.items.flatMap(item => {
          if (item.id !== entry.id) return [item];
          return !status || status === next ? [updated] : [];
        }) }));
        refresh();
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      setSavingError(isAxiosError(failure) && failure.response?.status === 409
        ? '상태가 이미 바뀌었어요. 새로고침한 뒤 다시 시도해주세요.' : '상태를 저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      saveRequest.current = null;
      if (!controller.signal.aborted) setSaving(undefined);
    }
  };

  if (denied) return <ScreenState title="이 계정은 운영 권한이 없어요" action="홈으로 돌아가기" onAction={() => router.replace('/')} />;
  if (!summary) return summaryError
    ? <ScreenState title={summaryError} action="다시 시도" onAction={refresh} />
    : <ScreenState title="운영 정보를 불러오고 있어요" loading />;

  const rec = summary.recommendation;
  const metrics = [
    ['완료', `${rec.completedJobs}건`], ['결과 제공', `${rec.withResults}건`],
    ['폴백', `${rec.fallbackResults}건`], ['결과 없음', `${rec.noMatch}건`],
    ['오류', `${rec.errors}건`], ['응답 P50', seconds(rec.p50TotalMs)], ['응답 P95', seconds(rec.p95TotalMs)],
  ];
  const displayStatus = uptime ? (uptime.conclusion === 'success' ? '정상' : '점검 실패')
    : uptime === null ? '최근 점검을 확인할 수 없어요' : '점검 상태를 확인하고 있어요';
  const muted = { color: colors.inkSoft };
  const text = { color: colors.text };

  return (
    <ScrollView style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Spacing.xl) }]}>
      <View style={styles.row}>
        <Text style={[Typography.title, text]}>피드백</Text>
        <AppButton title="새로고침" compact variant="ghost" disabled={!!saving} onPress={refresh} />
      </View>
      {summaryError ? <Text accessibilityRole="alert" style={[Typography.label, { color: colors.danger }]}>{summaryError}</Text> : null}
      <View style={styles.row}>
        {feedbackStatuses.map(item => (
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.line }]} key={item.value}>
            <Text style={[Typography.caption, muted]}>{item.label}</Text>
            <Text style={[Typography.section, text]}>{summary.feedbackCounts[item.value] ?? 0}건</Text>
          </View>
        ))}
      </View>
      <View style={styles.filters}>
        {[{ value: '' as const, label: '전체 유형' }, ...feedbackCategories].map(item => (
          <AppButton key={item.value} title={item.label} compact variant={category === item.value ? 'primary' : 'ghost'}
            accessibilityState={{ selected: category === item.value }} disabled={!!saving} onPress={() => {
              if (category !== item.value) { resetList(); setCategory(item.value); }
            }} />
        ))}
      </View>
      <View style={styles.filters}>
        {[{ value: '' as const, label: '전체 상태' }, ...feedbackStatuses].map(item => (
          <AppButton key={item.value} title={item.label} compact variant={status === item.value ? 'primary' : 'ghost'}
            accessibilityState={{ selected: status === item.value }} disabled={!!saving} onPress={() => {
              if (status !== item.value) { resetList(); setStatus(item.value); }
            }} />
        ))}
      </View>

      {pageError ? <ScreenState title={pageError} action="다시 시도" onAction={refresh} />
        : !page ? <ScreenState title="피드백을 불러오고 있어요" loading />
        : !page.items.length ? <ScreenState title="이 조건의 피드백이 없어요" />
        : page.items.map(item => {
          const open = expanded === item.id;
          const label = feedbackCategories.find(entry => entry.value === item.category)?.label;
          const statusLabel = feedbackStatuses.find(entry => entry.value === item.status)?.label;
          return (
            <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]} key={item.id}>
              <View style={styles.row}>
                <Text style={[Typography.label, text]}>{label} · {statusLabel}</Text>
                <Text style={[Typography.caption, muted]}>{dateLabel(item.createdAt)}</Text>
              </View>
              <Text style={[Typography.body, text]} numberOfLines={open ? undefined : 2}>{item.message}</Text>
              <AppButton title={open ? '접기' : '자세히 보기'} compact variant="ghost"
                accessibilityState={{ expanded: open }} disabled={!!saving} onPress={() => {
                  setSavingError('');
                  setExpanded(open ? undefined : item.id);
                }} />
              {open ? (
                <>
                  <View style={styles.filters}>
                    {feedbackStatuses.map(option => (
                      <AppButton key={option.value} title={option.label} compact variant={option.value === item.status ? 'primary' : 'secondary'}
                        accessibilityState={{ selected: option.value === item.status }}
                        disabled={!!saving || option.value === item.status} loading={saving === option.value}
                        onPress={() => void saveStatus(item, option.value)} />
                    ))}
                  </View>
                  {savingError ? <Text accessibilityRole="alert" style={[Typography.label, { color: colors.danger }]}>{savingError}</Text> : null}
                </>
              ) : null}
            </View>
          );
        })}
      {cursors.length || nextCursor ? (
        <View style={styles.row}>
          <AppButton title="최근 페이지" compact variant="secondary" disabled={!cursors.length || !!saving} onPress={() => {
            setPage(null); setExpanded(undefined); setCursors(current => current.slice(0, -1));
          }} />
          <AppButton title="오래된 의견 더 보기" compact variant="secondary" disabled={!nextCursor || !!saving} onPress={() => {
            if (nextCursor) { setCursors(current => [...current, nextCursor]); setPage(null); setExpanded(undefined); }
          }} />
        </View>
      ) : null}

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[Typography.section, text]}>갈피 추천 · 최근 24시간</Text>
        <View style={styles.metrics}>
          {metrics.map(([label, value]) => (
            <View key={label} style={styles.metric}>
              <Text style={[Typography.caption, muted]}>{label}</Text>
              <Text style={[Typography.label, text]}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[Typography.section, text]}>외부 점검</Text>
        <Text style={[Typography.label, text]}>{displayStatus}</Text>
        {uptime ? <Text style={[Typography.caption, muted]}>{uptime.event === 'schedule' ? '예약 점검' : '수동 점검'} · {dateLabel(uptime.run_started_at)}</Text> : null}
        <Link href={uptimeUrl} asChild><AppButton title="GitHub 점검 기록" compact variant="secondary" /></Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xxs },
  stat: { flex: 1, minWidth: 80, borderWidth: 1, borderRadius: UI.cardRadius, padding: Spacing.sm },
  card: { borderWidth: 1, borderRadius: UI.cardRadius, padding: Spacing.md, gap: Spacing.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metric: { minWidth: 84, gap: Spacing.xxs },
});
