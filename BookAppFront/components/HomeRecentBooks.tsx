import { ScrollView, Text, View } from 'react-native';
import { LibraryBookCard } from '@/components/LibraryShelf';
import AppButton from '@/components/ui/AppButton';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useRecentBookDetails } from '@/hooks/useRecentBookDetails';
import type { RecentBook } from '@/src/utils/recentBooks';
import { useRecentBooks } from '@/hooks/useRecentBooks';
import { getHomeScreenStyles } from '@/src/styles/HomeScreen.styles';
import { getLibraryShelfStyles } from './styles/LibraryShelf.styles';

function RecentBookCard({ book }: { book: RecentBook }) {
  const { visible, failed, retry } = useRecentBookDetails(book);
  return (
    <View>
      <LibraryBookCard showIsbn lookupCover={!!visible}
        book={visible ?? { ...book, title: failed ? '책 정보 확인 필요' : '책 정보 불러오는 중' }} />
      {failed ? <AppButton compact variant="ghost" title="다시 시도" onPress={retry}
        accessibilityLabel={`ISBN ${book.isbn13} 책 정보 다시 시도`} /> : null}
    </View>
  );
}

export default function HomeRecentBooks() {
  const theme = useColorScheme() ?? 'light';
  const styles = getHomeScreenStyles(theme);
  const shelf = getLibraryShelfStyles(theme);
  const history = useRecentBooks();
  if (!history.items.length && !history.error) return null;

  return (
    <View style={styles.recentSection} testID="home-recent-books">
      <View style={shelf.header}>
        <View style={styles.recentHeading}>
          <Text accessibilityRole="header" style={shelf.title}>최근 본 책</Text>
          <Text style={shelf.count}>이 기기에 저장돼요</Text>
        </View>
        <AppButton title="기록 지우기" compact variant="ghost" accessibilityLabel="최근 본 책 기록 지우기"
          onPress={() => { void history.clear(); }} />
      </View>
      {history.items.length > 0 ? (
        <ScrollView horizontal contentContainerStyle={shelf.books} showsHorizontalScrollIndicator={false}>
          {history.items.map(book => <RecentBookCard key={book.isbn13} book={book} />)}
        </ScrollView>
      ) : null}
      {history.error ? <Text role="alert" style={styles.recentError}>{history.error}</Text> : null}
    </View>
  );
}
