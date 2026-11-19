import { useEffect, useMemo, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LibraryBookCard } from '@/components/LibraryShelf';
import AppButton from '@/components/ui/AppButton';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { bookApi, type ReadingKeywordPick } from '@/src/services/api';
import { Spacing, Typography } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { aiSearchHref } from '@/src/utils/aiSearchEntry';
import { parseStoryKeywords } from '@/src/utils/readingKeywordShare';

type Lookup = { keywords: string[]; books: ReadingKeywordPick[] | null };

export default function ReadingKeywordStoryScreen() {
  const { tags } = useLocalSearchParams<{ tags?: string }>();
  const keywords = useMemo(() => parseStoryKeywords(tags), [tags]);
  const [hasMounted, setHasMounted] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [attempt, setAttempt] = useState(0);
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const result = lookup?.keywords === keywords ? lookup : null;
  const compactBooks = result?.books?.length === 3 && width < 408;

  useEffect(() => setHasMounted(true), []);

  useEffect(() => {
    if (!keywords.length) return;

    const request = new AbortController();
    void bookApi.getReadingKeywordPicks(keywords, request.signal).then(({ data }) => {
      if (!request.signal.aborted) setLookup({ keywords, books: Array.isArray(data) ? data : null });
    }).catch(() => {
      if (!request.signal.aborted) setLookup({ keywords, books: null });
    });
    return () => request.abort();
  }, [keywords, attempt]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.page, {
        paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + SCREEN_LAYOUT.bottomPadding,
      }]}>
      <Link href="/" style={StyleSheet.flatten([styles.brand, { color: colors.text }])}>Read On Me</Link>
      <View style={[styles.header, { borderBottomColor: colors.line }]}>
        <Text accessibilityRole="header" style={[Typography.display, { color: colors.text }]}>요즘 내가 읽는 세계</Text>
        {keywords.length ? (
          <View style={styles.keywords}>
            {keywords.map(keyword => (
              <Text key={keyword} style={[styles.keyword, { color: colors.text, backgroundColor: colors.surface2 }]}>
                {keyword}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {!hasMounted ? (
        <ActivityIndicator color={colors.text} accessibilityLabel="링크를 불러오는 중" style={styles.loading} />
      ) : keywords.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[Typography.section, { color: colors.text }]}>이 키워드로 만나는 책</Text>
          {!result ? (
            <ActivityIndicator color={colors.text} accessibilityLabel="책을 불러오는 중" style={styles.loading} />
          ) : result.books === null ? (
            <>
              <Text role="alert" style={[Typography.body, { color: colors.inkSoft }]}>책을 불러오지 못했어요.</Text>
              <AppButton title="다시 시도" variant="secondary" style={styles.inlineButton}
                onPress={() => { setLookup(null); setAttempt(value => value + 1); }} />
            </>
          ) : result.books.length ? (
            <View style={styles.books}>
              {result.books.map(book => <LibraryBookCard key={book.isbn13} book={book} compact={compactBooks} />)}
            </View>
          ) : (
            <Text style={[Typography.body, { color: colors.inkSoft }]}>이 키워드로 바로 보여드릴 책이 아직 없어요.</Text>
          )}
        </View>
      ) : (
        <Text style={[Typography.body, { color: colors.inkSoft }]}>이 링크에는 공개된 독서 키워드가 없어요.</Text>
      )}

      <View style={[styles.actions, { borderTopColor: colors.line }]}>
        <AppButton title="갈피와 내 취향으로 책 찾기" onPress={() => router.push(aiSearchHref())} />
        <AppButton title="책 둘러보기" variant="secondary" onPress={() => router.push('/search')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: SCREEN_LAYOUT.gutter, gap: Spacing.lg },
  brand: { ...Typography.section, fontStyle: 'italic', alignSelf: 'flex-start' },
  header: { gap: Spacing.sm, paddingBottom: Spacing.lg, borderBottomWidth: 1 },
  keywords: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  keyword: { ...Typography.label, maxWidth: '100%', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  section: { gap: Spacing.md },
  loading: { alignSelf: 'flex-start', minHeight: 48 },
  inlineButton: { alignSelf: 'flex-start' },
  books: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actions: { paddingTop: Spacing.lg, borderTopWidth: 1, gap: Spacing.sm },
});
