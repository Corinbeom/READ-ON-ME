import React, { useEffect, useState } from 'react';
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { AiSearchBook } from '@/src/services/api';

const CARD_GAP = 12;
const COVER_WIDTH = 84;
const COVER_HEIGHT = 126;

interface AiRecommendationCardsProps {
  books: AiSearchBook[];
  onPressBook: (isbn: string) => void;
}

function RecommendationCard({ book, position, total, width, onPressBook }: {
  book: AiSearchBook;
  position: number;
  total: number;
  width: number;
  onPressBook: (isbn: string) => void;
}) {
  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getStyles(colorScheme);
  const [imageFailed, setImageFailed] = useState(false);
  const thumbnail = book.thumbnail?.trim();
  const title = book.title?.trim() || '제목 정보 없음';
  const authors = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors?.trim();
  const reason = book.ranking_status === 'GEMINI' && book.reason?.trim() && book.reason_evidence?.trim()
    ? book.reason.trim()
    : null;

  useEffect(() => setImageFailed(false), [thumbnail]);

  return (
    <TouchableOpacity
      style={[styles.card, { width }]}
      onPress={() => onPressBook(book.isbn)}
      disabled={!book.isbn}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`추천 ${position}/${total}, ${title}${authors ? `, ${authors}` : ''}${reason ? `, 추천 이유: ${reason}` : ''}`}
      accessibilityHint="책 상세 화면으로 이동합니다."
    >
      <View style={styles.coverFrame} accessible={false}>
        {thumbnail && !imageFailed ? (
          <Image
            source={{ uri: thumbnail }}
            style={styles.cover}
            resizeMode="contain"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={styles.coverPlaceholder}>표지 없음</Text>
        )}
      </View>
      <View style={styles.bookInfo} accessible={false}>
        <Text style={styles.bookTitle} numberOfLines={3}>{title}</Text>
        {authors ? <Text style={styles.bookAuthor} numberOfLines={2}>{authors}</Text> : null}
        {reason ? (
          <View style={styles.reasonBlock}>
            <Text style={styles.reasonLabel}>추천 이유</Text>
            <Text style={styles.bookReason}>{reason}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function AiRecommendationCards({ books, onPressBook }: AiRecommendationCardsProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getStyles(colorScheme);
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(Math.max(width - 76, 220), 340);
  const visibleBooks = books.slice(0, 5);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateActiveIndex = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + CARD_GAP));
    setActiveIndex(Math.max(0, Math.min(nextIndex, visibleBooks.length - 1)));
  };

  if (visibleBooks.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>추천한 책 {visibleBooks.length}권</Text>
        {visibleBooks.length > 1 ? (
          <Text style={styles.position} accessibilityLabel={`${activeIndex + 1}번째 책, 총 ${visibleBooks.length}권`}>
            {activeIndex + 1} / {visibleBooks.length}
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={visibleBooks.length > 1}
        snapToInterval={cardWidth + CARD_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        onScrollEndDrag={updateActiveIndex}
        onMomentumScrollEnd={updateActiveIndex}
        style={styles.cardList}
        contentContainerStyle={[styles.cardListContent, { paddingRight: Math.max(width - 32 - cardWidth, 16) }]}
      >
        {visibleBooks.map((book, index) => (
          <RecommendationCard
            key={`${book.isbn}-${index}`}
            book={book}
            position={index + 1}
            total={visibleBooks.length}
            width={cardWidth}
            onPressBook={onPressBook}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const getStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];
  return StyleSheet.create({
    container: {
      width: '100%',
      marginBottom: 20,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 9,
    },
    heading: {
      color: c.text,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 13,
      lineHeight: 19,
    },
    position: {
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 11,
      lineHeight: 16,
    },
    cardList: {
      flexGrow: 0,
    },
    cardListContent: {
      gap: CARD_GAP,
      paddingBottom: 2,
      alignItems: 'stretch',
    },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 12,
      minHeight: 150,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.line,
    },
    coverFrame: {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface2,
    },
    cover: {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
    },
    coverPlaceholder: {
      color: c.inkSoft,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 10,
    },
    bookInfo: {
      flex: 1,
      minWidth: 0,
    },
    bookTitle: {
      color: c.text,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 14,
      lineHeight: 20,
    },
    bookAuthor: {
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 11,
      lineHeight: 16,
      marginTop: 5,
    },
    reasonBlock: {
      marginTop: 11,
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingTop: 8,
    },
    reasonLabel: {
      color: c.inkSoft,
      fontFamily: 'Pretendard-SemiBold',
      fontSize: 10,
      lineHeight: 15,
      marginBottom: 3,
    },
    bookReason: {
      color: c.text,
      fontFamily: 'NotoSerifKR-Regular',
      fontSize: 12,
      lineHeight: 18,
    },
  });
};
