import { useState } from 'react';
import BookCover from '@/components/BookCover';
import { Text, TouchableOpacity, View } from 'react-native';
import { Link, router } from 'expo-router';
import AppButton from '@/components/ui/AppButton';
import { useColorScheme } from '@/hooks/useColorScheme';
import { HOME_COLLECTION, type HomeCollectionBook } from '@/src/constants/homeCollection';
import { aiSearchHref } from '@/src/utils/aiSearchEntry';
import { getHomeBookCollectionStyles } from './styles/HomeBookCollection.styles';

function CollectionBook({ book, selected, onSelect }: {
  book: HomeCollectionBook; selected: boolean; onSelect: () => void;
}) {
  const styles = getHomeBookCollectionStyles(useColorScheme() ?? 'light');
  return (
    <TouchableOpacity style={styles.book} onPress={onSelect} activeOpacity={0.8}
      accessibilityRole="button" accessibilityState={{ selected }} aria-pressed={selected}
      accessibilityLabel={`${book.title} · ${book.author} · ${book.angle}`}
      accessibilityHint="선택하면 아래에 책 소개와 상세 보기 버튼이 표시됩니다.">
      <View style={[styles.coverFrame, selected && styles.selectedCover]}>
        <BookCover uri={book.thumbnail} style={styles.cover} />
      </View>
      <Text style={styles.selectionLabel} aria-hidden>{selected ? '✓ 선택한 이야기' : ' '}</Text>
      <Text style={styles.angle}>{book.angle}</Text>
      <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
    </TouchableOpacity>
  );
}

export default function HomeBookCollection() {
  const styles = getHomeBookCollectionStyles(useColorScheme() ?? 'light');
  const [selectedIsbn, setSelectedIsbn] = useState(HOME_COLLECTION.books[0].isbn);
  const selected = HOME_COLLECTION.books.find(book => book.isbn === selectedIsbn) ?? HOME_COLLECTION.books[0];
  return (
    <View style={styles.section} testID="home-book-collection">
      <Text style={styles.eyebrow}>갈피와 이야기부터 골라봐요</Text>
      <Text accessibilityRole="header" style={styles.title}>{HOME_COLLECTION.title}</Text>
      <Text style={styles.description}>{HOME_COLLECTION.description}</Text>
      <View style={styles.books} accessibilityLabel="관심 있는 책의 이야기 선택">
        {HOME_COLLECTION.books.map(book => <CollectionBook key={book.isbn} book={book} selected={selected.isbn === book.isbn} onSelect={() => setSelectedIsbn(book.isbn)} />)}
      </View>
      <View style={styles.selection} aria-live="polite" testID="home-collection-selection">
        <Text style={styles.selectionTitle}>{selected.title}</Text>
        <Text style={styles.author}>{selected.author} · {selected.angle}</Text>
        <Text style={styles.invitation}>{selected.invitation}</Text>
      </View>
      <Link href={`/book/${selected.isbn}`} asChild>
        <AppButton title="이 책 자세히 보기 →" variant="ghost" compact style={styles.detailAction} accessibilityLabel={`${selected.title} 상세 보기`} />
      </Link>
      <AppButton title="이런 분위기의 책 더 찾기 →" style={styles.primaryAction}
        accessibilityHint="선택한 이야기의 주제를 추천 조건에 미리 입력합니다. 검색은 직접 시작할 수 있습니다."
        onPress={() => router.push(aiSearchHref(selected.prompt))} />
      <Text style={styles.basis}>{HOME_COLLECTION.basis}</Text>
    </View>
  );
}
