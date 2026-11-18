import { ScrollView, Text, View } from 'react-native';
import { LibraryBookCard } from '@/components/LibraryShelf';
import AppButton from '@/components/ui/AppButton';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useRecentBooks } from '@/hooks/useRecentBooks';
import { getHomeScreenStyles } from '@/src/styles/HomeScreen.styles';
import { getLibraryShelfStyles } from './styles/LibraryShelf.styles';

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
          {history.items.map(book => <LibraryBookCard key={book.isbn13} book={book} />)}
        </ScrollView>
      ) : null}
      {history.error ? <Text role="alert" style={styles.recentError}>{history.error}</Text> : null}
    </View>
  );
}
