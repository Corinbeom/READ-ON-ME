import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ellipsis } from 'lucide-react-native';
import BookmarkMascot from '@/components/BookmarkMascot';
import AppButton from '@/components/ui/AppButton';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { BookDto } from '@/src/types/BookDto';
import { aiSearchHref } from '@/src/utils/aiSearchEntry';
import { getIsbn13 } from '@/src/utils/bookUtils';
import BookCover from '@/components/BookCover';
import { getLibraryShelfStyles } from './styles/LibraryShelf.styles';

export function LibraryBookCard({ book, onPress, onManage, compact = false }: {
  book: Pick<BookDto, 'title' | 'isbn13' | 'authors' | 'thumbnail'>;
  onPress?: () => void;
  onManage?: () => void;
  compact?: boolean;
}) {
  const theme = useColorScheme() ?? 'light';
  const styles = getLibraryShelfStyles(theme);
  const isbn = getIsbn13(book);
  const authors = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors;
  const cover = compact ? styles.compactCover : styles.cover;
  const content = (
    <TouchableOpacity style={compact ? styles.compactBook : styles.book} onPress={onPress} onLongPress={onManage}
      disabled={!isbn && !onManage} activeOpacity={0.75}
      accessibilityLabel={`${book.title}${authors ? ` · ${authors}` : ''} · ${isbn ? '책 상세 보기' : '상세 보기 불가'}`}>
      <BookCover uri={book.thumbnail} lookupIsbn={isbn} style={cover} />
      <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.author} numberOfLines={1}>{isbn ? authors || '저자 정보 없음' : '상세 보기 불가'}</Text>
    </TouchableOpacity>
  );
  const card = isbn ? <Link href={`/book/${isbn}`} asChild>{content}</Link> : content;
  return onManage ? (
    <View>
      {card}
      <TouchableOpacity style={styles.manage} accessibilityRole="button" accessibilityLabel={`${book.title} 관리`} onPress={onManage}>
        <Ellipsis size={20} color={Colors[theme].text} aria-hidden />
      </TouchableOpacity>
    </View>
  ) : card;
}

export default function LibraryShelf({ title, books, onShowAll, onManage }: {
  title: string; books: BookDto[]; onShowAll: () => void; onManage?: (book: BookDto) => void;
}) {
  const styles = getLibraryShelfStyles(useColorScheme() ?? 'light');
  if (!books.length) return null;
  return (
    <View style={styles.shelf} testID={`library-shelf-${title}`}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.count}>{books.length}권</Text>
        </View>
        <AppButton title="전체 보기" compact variant="ghost" accessibilityLabel={`${title} 전체 ${books.length}권 보기`} onPress={onShowAll} />
      </View>
      <FlatList horizontal data={books.slice(0, 6)} contentContainerStyle={styles.books} showsHorizontalScrollIndicator={false}
        keyExtractor={(book) => String(book.id)}
        renderItem={({ item }) => <LibraryBookCard book={item} onManage={onManage ? () => onManage(item) : undefined} />} />
    </View>
  );
}

export function LibraryDiscovery({ guest = false, compact = false }: { guest?: boolean; compact?: boolean }) {
  const styles = getLibraryShelfStyles(useColorScheme() ?? 'light');
  if (compact) return (
    <View style={styles.compact}>
      <Text style={styles.compactTitle}>다음에 읽을 책도 골라볼까요?</Text>
      <View style={styles.compactActions}>
        <AppButton title="책 찾아보기" variant="secondary" style={styles.compactAction} onPress={() => router.push('/search')} />
        <AppButton title="AI 사서 갈피" variant="secondary" style={styles.compactAction} onPress={() => router.push(aiSearchHref())} />
      </View>
    </View>
  );
  return (
    <View style={styles.discovery} testID={guest ? 'library-guest' : 'library-empty'}>
      <BookmarkMascot state="idle" size={88} compact />
      <Text accessibilityRole="header" style={styles.discoveryTitle}>{guest ? '나만의 서재를 만들어보세요' : '첫 번째 책을 담아볼까요?'}</Text>
      <Text style={styles.description}>{guest ? '로그인하면 읽고 싶은 책과 독서 기록을\n한곳에 모을 수 있어요.' : '마음에 드는 책의 상세 화면에서\n‘읽고 싶어요’를 눌러 서재에 담아보세요.'}</Text>
      <View style={styles.actions}>
        <AppButton title={guest ? '로그인하고 서재 만들기' : '책 찾아보기'} onPress={() => router.push(guest ? { pathname: '/auth/login', params: { returnTo: 'my-library' } } : '/search')} />
        <AppButton title={guest ? '책 먼저 둘러보기' : '갈피와 고르기'} variant="secondary"
          onPress={() => router.push(guest ? '/search' : aiSearchHref())} />
      </View>
    </View>
  );
}
