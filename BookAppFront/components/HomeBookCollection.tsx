import { useCallback, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import BookCover from '@/components/BookCover';
import BookSourceLink from '@/components/BookSourceLink';
import AppButton from '@/components/ui/AppButton';
import { useColorScheme } from '@/hooks/useColorScheme';
import { bookApi, type DailyBookChoice } from '@/src/services/api';
import { aiSearchHref } from '@/src/utils/aiSearchEntry';
import { readBookAttribution } from '@/src/utils/bookAttribution';
import { untilNextKoreanDay } from '@/src/utils/koreanDay';
import { getHomeBookCollectionStyles } from './styles/HomeBookCollection.styles';

function CollectionBook({ book, selected, onSelect }: {
  book: DailyBookChoice; selected: boolean; onSelect: () => void;
}) {
  const styles = getHomeBookCollectionStyles(useColorScheme() ?? 'light');
  return (
    <TouchableOpacity style={styles.book} onPress={onSelect} activeOpacity={0.8}
      accessibilityRole="button" accessibilityState={{ selected }} aria-pressed={selected}
      accessibilityLabel={`${book.title} · ${book.authors} · ${book.topic}`}
      accessibilityHint="선택하면 아래에 책 소개와 갈피에 물어보기 버튼이 표시됩니다.">
      <View style={[styles.coverFrame, selected && styles.selectedCover]}>
        <BookCover lookupIsbn={book.isbn} style={styles.cover} resizeMode="contain" />
      </View>
      <Text style={styles.selectionLabel} aria-hidden>{selected ? '✓ 선택한 책' : ' '}</Text>
      <Text style={styles.angle} numberOfLines={2}>{book.topic}</Text>
      <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
    </TouchableOpacity>
  );
}

type CollectionState = { status: 'loading' | 'error' } | { status: 'ready'; books: DailyBookChoice[] };

export default function HomeBookCollection() {
  const styles = getHomeBookCollectionStyles(useColorScheme() ?? 'light');
  const [state, setState] = useState<CollectionState>({ status: 'loading' });
  const reload = useRef<() => void>(() => {});
  const [selectedIsbn, setSelectedIsbn] = useState<string>();
  useFocusEffect(useCallback(() => {
    let controller: AbortController;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh(signal: AbortSignal) {
      try {
        const { data } = await bookApi.getDailyChoices(signal);
        if (!Array.isArray(data)) throw new Error('Invalid daily choices');
        if (!signal.aborted) setState({ status: 'ready', books: data });
      } catch {
        if (!signal.aborted) setState({ status: 'error' });
      }
    }
    function startDay() {
      controller?.abort();
      controller = new AbortController();
      setState({ status: 'loading' });
      void refresh(controller.signal);
      clearTimeout(timer);
      timer = setTimeout(startDay, untilNextKoreanDay());
    }
    reload.current = startDay;
    startDay();
    return () => { controller.abort(); clearTimeout(timer); reload.current = () => {}; };
  }, []));

  const selected = state.status === 'ready'
    ? state.books.find(book => book.isbn === selectedIsbn) ?? state.books[0] : undefined;
  const { description, source } = readBookAttribution(selected?.contents);
  return (
    <View style={styles.section} testID="home-book-collection">
      <Text style={styles.eyebrow}>갈피와 이야기부터 골라봐요</Text>
      <Text accessibilityRole="header" style={styles.title}>오늘은 어떤 책이 끌리세요?</Text>
      {state.status === 'ready' && selected ? <>
        <Text style={styles.description}>한 권을 골라 그 주제로 갈피에게 물어보세요.</Text>
        <View style={styles.books} accessibilityLabel="오늘의 책 선택">
          {state.books.map(book => <CollectionBook key={book.isbn} book={book} selected={selected.isbn === book.isbn}
            onSelect={() => setSelectedIsbn(book.isbn)} />)}
        </View>
        <View style={styles.selection} aria-live="polite" testID="home-collection-selection">
          <Text style={styles.selectionTitle}>{selected.title}</Text>
          <Text style={styles.author}>{selected.authors}</Text>
          <Text style={styles.invitation} numberOfLines={3}>{description}</Text>
          {source && <BookSourceLink source={source} />}
        </View>
        <Link href={`/book/${selected.isbn}`} asChild>
          <AppButton title="이 책 자세히 보기 →" variant="ghost" compact style={styles.detailAction}
            accessibilityLabel={`${selected.title} 상세 보기`} />
        </Link>
        <AppButton title="이 주제로 갈피에게 물어보기 →" style={styles.primaryAction}
          accessibilityHint="갈피 검색에서 질문을 편집할 수 있어요."
          onPress={() => router.push(aiSearchHref(selected.prompt))} />
      </> : <>
        <Text style={styles.description} aria-live="polite">{state.status === 'loading' ? '오늘의 책을 고르고 있어요.'
          : state.status === 'error' ? '오늘의 책을 불러오지 못했어요.' : '오늘 보여드릴 책을 준비하고 있어요.'}</Text>
        {state.status === 'error' && <AppButton title="다시 불러오기" variant="secondary" compact
          onPress={() => reload.current()} />}
      </>}
    </View>
  );
}
