import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ScreenState from '@/components/ui/ScreenState';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { operationsApi, type OperationsSummary, type OperationsUserOverview as UserOverview } from '@/src/services/api';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';

const numberFormat = new Intl.NumberFormat('ko-KR');
const count = (value: number, unit: '명' | '권' | '건') => numberFormat.format(value) + unit;
const accounts = (value: number, total: number) =>
  total === 0 ? count(value, '명') : `${count(value, '명')} · ${Math.round(value / total * 100)}%`;

type Props = { revision: number; recommendation: OperationsSummary['recommendation'] };

export default function OperationsUserOverview({ revision, recommendation }: Props) {
  const [overview, setOverview] = useState<UserOverview>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void operationsApi.users(controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setOverview(data.data);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [attempt, revision]);

  if (failed) return <ScreenState title="유저 현황을 불러오지 못했어요" action="다시 시도"
    onAction={() => setAttempt(value => value + 1)} />;
  if (!overview) return <ScreenState title="유저 현황을 불러오고 있어요" loading />;

  return (
    <>
      <MetricGroup title="가입 현황" note="오늘과 최근 7일은 한국 날짜 기준" metrics={[
        ['전체 가입자', count(overview.totalUsers, '명')],
        ['오늘 신규 가입', count(overview.joinedToday, '명')],
        ['최근 7일 신규 가입', count(overview.joinedLastSevenDays, '명')],
        ['이메일 계정', accounts(overview.emailAccounts, overview.totalUsers)],
        ['카카오 계정', accounts(overview.kakaoAccounts, overview.totalUsers)],
      ]} />
      <MetricGroup title="서재 이용" metrics={[
        ['책을 담은 회원', count(overview.shelfUsers, '명')],
        ['읽을 책', count(overview.toReadBooks, '권')],
        ['읽는 중', count(overview.readingBooks, '권')],
        ['완독', count(overview.completedBooks, '권')],
      ]} />
      <MetricGroup title="갈피 이용 · 최근 24시간" metrics={[
        ['추천을 요청한 회원', count(overview.galpiUsersLastDay, '명')],
        ['결과 제공', count(recommendation.withResults, '건')],
        ['결과 없음', count(recommendation.noMatch, '건')],
        ['오류', count(recommendation.errors, '건')],
      ]} />
    </>
  );
}

function MetricGroup({ title, note, metrics }: { title: string; note?: string; metrics: [string, string][] }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text accessibilityRole="header" style={[Typography.section, { color: colors.text }]}>{title}</Text>
      {note ? <Text style={[Typography.caption, { color: colors.inkSoft }]}>{note}</Text> : null}
      <View style={styles.metrics}>
        {metrics.map(([label, value]) => (
          <View key={label} style={styles.metric}>
            <Text style={[Typography.caption, { color: colors.inkSoft }]}>{label}</Text>
            <Text style={[Typography.label, { color: colors.text }]}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: UI.cardRadius, padding: Spacing.md, gap: Spacing.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.md, rowGap: Spacing.sm, paddingTop: Spacing.xs },
  metric: { flexBasis: '44%', flexGrow: 1, minWidth: 106, gap: Spacing.xxs },
});
