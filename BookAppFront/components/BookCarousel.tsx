import React, { useState } from 'react';
import { FlatList, TouchableOpacity, Image, View, Text } from 'react-native';
import { Link } from 'expo-router';
import { Book } from '../src/types/book';
import { getIsbn13 } from '../src/utils/bookUtils';
import { getBookCarouselStyles } from './styles/BookCarousel.styles';
import { useColorScheme } from '@/hooks/useColorScheme';
import BookListSkeleton from '@/components/ui/BookListSkeleton';
import ScreenState from '@/components/ui/ScreenState';
import AppButton from '@/components/ui/AppButton';
import { secureImageUri } from '@/src/utils/imageUri';

interface BookCarouselProps {
  title: React.ReactNode;
  books: Book[];
  loading: boolean;
  emptyMessage?: string;
  error?: string;
  onRetry?: () => void;
  loadingLabel?: string;
}

const defaultCover = require('../assets/mascot/bookmark_searching_books_light.png');

function CarouselCover({ uri, style }: { uri?: string; style: React.ComponentProps<typeof Image>['style'] }) {
  const [failed, setFailed] = useState(false);
  const showRemote = Boolean(uri) && !failed;
  return <Image source={showRemote ? { uri } : defaultCover} style={style} resizeMode="cover"
    onError={showRemote ? () => setFailed(true) : undefined} accessible={false} />;
}

const BookCarousel: React.FC<BookCarouselProps> = ({ 
  title,
  books,
  loading,
  emptyMessage = '표시할 책이 없습니다.', error, onRetry, loadingLabel = '책 목록을 불러오고 있어요'
}) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getBookCarouselStyles(colorScheme);

  const renderBookItem = ({ item }: { item: Book }) => {
    const isbn13 = getIsbn13(item);

    const bookContent = (
      <>
        <CarouselCover key={item.thumbnail} uri={secureImageUri(item.thumbnail)} style={styles.bookThumbnail} />
        {item.loanRanking && <Text style={styles.bookAuthor}>{item.loanRanking.rank}위 · {item.loanRanking.count}회 대출</Text>}
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {Array.isArray(item.authors) ? item.authors.join(', ') : item.authors || item.publisher}
        </Text>
      </>
    );

    if (!isbn13) {
      return (
        <View style={styles.bookItem}>
          {bookContent}
        </View>
      );
    }

    return (
      <Link href={`/book/${isbn13}`} asChild>
        <TouchableOpacity style={styles.bookItem} activeOpacity={0.8}>
          {bookContent}
        </TouchableOpacity>
      </Link>
    );
  };

  return (
    <View style={styles.container} accessibilityState={{ busy: loading }}>
      {title ? (
        <View style={styles.header}>
          {typeof title === 'string' ? (
            <Text style={styles.headerTitle}>{title}</Text>
          ) : (
            title
          )}
        </View>
      ) : null}
      {books.length > 0 ? (
        <>
          {error ? <View style={styles.retryRow}><Text style={styles.refreshText} role="alert">{error}</Text><AppButton title="다시 시도" compact variant="ghost" disabled={loading} onPress={onRetry} /></View> : null}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={books}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderBookItem}
            contentContainerStyle={styles.listContentContainer}
          />
        </>
      ) : loading ? <BookListSkeleton layout="carousel" label={loadingLabel} />
        : error ? <ScreenState title={error} action="다시 시도" onAction={onRetry} /> : (
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      )}
    </View>
  );
};

export default BookCarousel;
