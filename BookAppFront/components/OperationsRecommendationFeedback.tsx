import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AppButton from '@/components/ui/AppButton';
import ScreenState from '@/components/ui/ScreenState';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { operationsApi, type OperationsRecommendationFeedbackPage } from '@/src/services/api';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { recommendationRatings, type RecommendationRating } from '@/src/utils/feedback';

const outcomeLabels = { MODEL: '추천', FALLBACK: '조건에 맞는 책 제공', NO_MATCH: '결과 없음' };

export default function OperationsRecommendationFeedback({ revision }: { revision: number }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [rating, setRating] = useState<RecommendationRating>();
  const [cursors, setCursors] = useState<number[]>([]);
  const [page, setPage] = useState<OperationsRecommendationFeedbackPage | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState<number>();
  const beforeId = cursors.at(-1);
  const nextCursor = page?.nextBeforeId;

  useEffect(() => {
    const controller = new AbortController();
    void operationsApi.recommendationFeedback({ rating, before_id: beforeId }, controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return;
      setPage(data.data);
      setError('');
    }).catch(() => {
      if (!controller.signal.aborted) setError('추천 피드백을 불러오지 못했어요.');
    });
    return () => controller.abort();
  }, [beforeId, rating, retry, revision]);

  const clearPage = () => {
    setPage(null);
    setExpanded(undefined);
    setError('');
  };

  const muted = { color: colors.inkSoft };
  const text = { color: colors.text };
  return (
    <>
      <View style={styles.filters}>
        {[undefined, ...recommendationRatings].map(score => (
          <AppButton key={score ?? 'all'} title={score === undefined ? '전체' : `${score}점`} compact
            variant={rating === score ? 'primary' : 'ghost'} accessibilityState={{ selected: rating === score }}
            onPress={() => {
              if (rating === score) return;
              clearPage();
              setRating(score);
              setCursors([]);
            }} />
        ))}
      </View>
      {error ? <ScreenState title={error} action="다시 불러오기" onAction={() => {
        clearPage();
        setRetry(value => value + 1);
      }} />
        : !page ? <ScreenState title="추천 피드백을 불러오고 있어요" loading />
        : page.items.length === 0 ? <ScreenState title="접수된 추천 피드백이 없어요" />
        : page.items.map(entry => {
          const open = expanded === entry.id;
          return (
            <View key={entry.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={[Typography.caption, muted]}>
                {entry.rating}/5점 · {outcomeLabels[entry.outcome]} · {new Date(entry.submittedAt).toLocaleString('ko-KR')}
              </Text>
              <Text selectable style={[Typography.label, text]} numberOfLines={open ? undefined : 2}>{entry.query}</Text>
              {entry.comment && !open ? <Text style={[Typography.body, muted]} numberOfLines={2}>{entry.comment}</Text> : null}
              <AppButton title={open ? '접기' : `추천 결과 보기 · ${entry.books.length}권`} compact variant="ghost"
                accessibilityState={{ expanded: open }} style={styles.detailAction}
                onPress={() => setExpanded(open ? undefined : entry.id)} />
              {open ? (
                <View style={[styles.details, { borderColor: colors.line }]}>
                  {entry.comment ? <>
                    <Text style={[Typography.caption, muted]}>추가 의견</Text>
                    <Text selectable style={[Typography.body, text]}>{entry.comment}</Text>
                  </> : null}
                  <Text style={[Typography.caption, muted]}>{entry.books.length ? '사용자에게 표시된 책' : '표시된 책이 없어요'}</Text>
                  {entry.books.map((book, index) => (
                    <View key={`${book.isbn}-${index}`} style={styles.book}>
                      <Text selectable style={[Typography.label, text]}>{index + 1}. {book.title}</Text>
                      <Text selectable style={[Typography.caption, muted]}>
                        {[Array.isArray(book.authors) ? book.authors.join(', ') : book.authors, book.isbn].filter(Boolean).join(' · ')}
                      </Text>
                      {book.reason ? <Text selectable style={[Typography.body, muted]}>{book.reason}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      {!error && page && (cursors.length > 0 || nextCursor) ? (
        <View style={styles.filters}>
          <AppButton title="최근 페이지" compact variant="secondary" disabled={!cursors.length} onPress={() => {
            clearPage();
            setCursors(current => current.slice(0, -1));
          }} />
          <AppButton title="오래된 평가 더 보기" compact variant="secondary" disabled={!nextCursor} onPress={() => {
            if (nextCursor) {
              clearPage();
              setCursors(current => [...current, nextCursor]);
            }
          }} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xxs },
  card: { borderWidth: 1, borderRadius: UI.cardRadius, padding: Spacing.md, gap: Spacing.xs },
  detailAction: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  details: { borderTopWidth: 1, paddingTop: Spacing.sm, gap: Spacing.xs },
  book: { paddingVertical: Spacing.xxs, gap: Spacing.xxs },
});
