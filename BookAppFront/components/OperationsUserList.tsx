import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AppButton from '@/components/ui/AppButton';
import ScreenState from '@/components/ui/ScreenState';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { operationsApi, type OperationsUserPage } from '@/src/services/api';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';

const joinDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' });

export default function OperationsUserList({ revision }: { revision: number }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [page, setPage] = useState<OperationsUserPage>();
  const [cursors, setCursors] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const beforeId = cursors.at(-1);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void operationsApi.userList(beforeId, controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setPage(data.data);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [attempt, beforeId, revision]);

  if (failed) return <ScreenState title="유저 목록을 불러오지 못했어요" action="다시 시도"
    onAction={() => setAttempt(value => value + 1)} />;
  if (!page) return <ScreenState title="유저 목록을 불러오고 있어요" loading />;

  const nextCursor = page.nextBeforeId;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text accessibilityRole="header" style={[Typography.section, { color: colors.text }]}>유저 목록</Text>
      {cursors.length > 0 || nextCursor ? (
        <View style={styles.actions}>
          <AppButton title="이전 페이지" compact variant="secondary" disabled={!cursors.length} onPress={() => {
            setPage(undefined);
            setCursors(current => current.slice(0, -1));
          }} />
          <AppButton title="다음 페이지" compact variant="secondary" disabled={!nextCursor} onPress={() => {
            if (nextCursor) {
              setPage(undefined);
              setCursors(current => [...current, nextCursor]);
            }
          }} />
        </View>
      ) : null}
      {page.items.length === 0 ? <Text style={[Typography.body, { color: colors.inkSoft }]}>조회할 유저가 없어요.</Text> : null}
      {page.items.map(user => (
        <View key={user.id} style={[styles.row, { borderColor: colors.line }]}>
          <Text style={[styles.nickname, { color: colors.text }]}>{user.nickname}</Text>
          <Text style={[Typography.caption, { color: colors.inkSoft }]}>
            {user.provider === 'KAKAO' ? '카카오 가입' : '이메일 가입'} · {joinDate.format(new Date(user.joinedAt))}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: UI.cardRadius, padding: Spacing.md, gap: Spacing.xs },
  row: { minHeight: UI.compactControlHeight, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    alignItems: 'center', columnGap: Spacing.sm, rowGap: Spacing.xxs, paddingVertical: Spacing.xs, borderTopWidth: 1 },
  nickname: { ...Typography.label, flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});
