import React from 'react';
import { FlatList, ActivityIndicator, TouchableOpacity, Image, View, Text } from 'react-native';
import { Link } from 'expo-router';
import { Book } from '../src/types/book';
import { getIsbn13 } from '../src/utils/bookUtils';
import { getBookCarouselStyles } from './styles/BookCarousel.styles';
import { useColorScheme } from '@/hooks/useColorScheme';
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
  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getBookCarouselStyles(colorScheme);
  const colors = Colors[colorScheme];

  const renderBookItem = ({ item }: { item: Book }) => {
    const isbn13 = getIsbn13(item);

    const BookContent = () => (
      <>
        <Image source={{ uri: item.thumbnail }} style={styles.bookThumbnail} resizeMode="cover" />
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {Array.isArray(item.authors) ? item.authors.join(', ') : item.authors || item.publisher}
        </Text>
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
    <View style={styles.container}>
      {title ? (
        <View style={styles.header}>
          {typeof title === 'string' ? (
            <Text style={styles.headerTitle}>{title}</Text>
          ) : (
            title
          )}
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator size="large" color={colors.inkSoft} style={styles.loadingIndicator} />
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
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      )}
    </View>
  );
};

export default BookCarousel;