import React from 'react';
import { FlatList, ActivityIndicator, TouchableOpacity, Image, View } from 'react-native';
import { Link } from 'expo-router';
import { Book } from '../src/types/book';
import { getIsbn13 } from '../src/utils/bookUtils';
import { getBookCarouselStyles } from './styles/BookCarousel.styles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ThemedView } from './ThemedView';
import { ThemedText } from './ThemedText';
import { Colors } from '@/constants/Colors';

interface BookCarouselProps {
  title: React.ReactNode;
  books: Book[];
  loading: boolean;
  emptyMessage?: string;
}

const BookCarousel: React.FC<BookCarouselProps> = ({ 
  title,
  books,
  loading,
  emptyMessage = '표시할 책이 없습니다.'
}) => {
  const colorScheme = useColorScheme() ?? 'light';
  const styles = getBookCarouselStyles(colorScheme);
  const colors = Colors[colorScheme];

  const renderBookItem = ({ item }: { item: Book }) => {
    const isbn13 = getIsbn13(item);

    const BookContent = () => (
      <>
        <View>
          <Image source={{ uri: item.thumbnail }} style={styles.bookThumbnail} />
          <View style={styles.thumbnailOverlay} />
        </View>
        <ThemedText style={styles.bookTitle} numberOfLines={2}>{item.title}</ThemedText>
        <ThemedText style={styles.bookAuthor} numberOfLines={1}>
          {Array.isArray(item.authors) ? item.authors.join(', ') : item.authors || item.publisher}
        </ThemedText>
      </>
    );

    if (!isbn13) {
      return (
        <View style={styles.bookItem}>
          <BookContent />
        </View>
      );
    }

    return (
      <Link href={`/book/${isbn13}`} asChild>
        <TouchableOpacity style={styles.bookItem} activeOpacity={0.8}>
          <BookContent />
        </TouchableOpacity>
      </Link>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        {typeof title === 'string' ? (
          <ThemedText style={styles.headerTitle}>{title}</ThemedText>
        ) : (
          title // Render JSX element directly
        )}
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
      ) : books.length > 0 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={books}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderBookItem}
          contentContainerStyle={styles.listContentContainer}
        />
      ) : (
        <ThemedText style={styles.emptyText}>{emptyMessage}</ThemedText>
      )}
    </ThemedView>
  );
};

export default BookCarousel;