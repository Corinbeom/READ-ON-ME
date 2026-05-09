import React, { useState } from 'react';
import {
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
  View,
  Text,
  Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { KakaoBook } from '../../src/types/kakaoBook';
import customAlert from '../../src/utils/alert';
import { getIsbn13 } from '../../src/utils/bookUtils';
import { Colors } from '@/constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import { bookApi } from '@/src/services/api';

interface SearchResponse {
  documents: KakaoBook[];
  meta: { total_count: number; is_end: boolean };
}

const getStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },

    // ── Masthead ──────────────────────────────────────────
    masthead: {
      paddingTop: Platform.OS === 'ios' ? 16 : 20,
      paddingHorizontal: 22,
      paddingBottom: 12,
      backgroundColor: c.background,
    },
    mastheadTitle: {
      fontSize: 28,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      letterSpacing: -0.5,
    },

    // ── Search Bar ────────────────────────────────────────
    searchSection: {
      paddingHorizontal: 22,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.line,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    searchButton: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderLeftWidth: 1,
      borderLeftColor: c.line,
    },
    searchButtonText: {
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      color: c.text,
      letterSpacing: 0.15,
      textTransform: 'uppercase',
    },

    // ── Book List ─────────────────────────────────────────
    bookList: { flex: 1 },
    bookItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 22,
      paddingVertical: 16,
      backgroundColor: c.background,
    },
    thumbnail: {
      width: 52,
      height: 74,
      borderRadius: 0,
      backgroundColor: c.surface2,
    },
    bookInfo: {
      flex: 1,
      marginLeft: 16,
    },
    title: {
      fontSize: 14,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      marginBottom: 4,
      lineHeight: 20,
      letterSpacing: -0.2,
    },
    authors: {
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkSoft,
      letterSpacing: 0.1,
      textTransform: 'uppercase',
    },
    chevron: {
      fontSize: 14,
      color: c.inkFaint,
      fontFamily: 'Pretendard-SemiBold',
    },
    divider: {
      height: 1,
      backgroundColor: c.line,
      marginHorizontal: 22,
    },
    dividerTop: {
      height: 2,
      backgroundColor: c.text,
      marginHorizontal: 22,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkSoft,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
    },
    resultLabel: {
      fontSize: 10,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkSoft,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      paddingHorizontal: 22,
      paddingTop: 20,
      paddingBottom: 14,
    },
  });
};

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<KakaoBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getStyles(colorScheme);

  const searchBooks = async () => {
    if (!searchQuery.trim()) {
      customAlert('알림', '검색어를 입력해주세요.');
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const response = await bookApi.searchBooks({ query: searchQuery, size: 20 });
      setBooks((response.data as SearchResponse).documents);
    } catch (error) {
      console.error('검색 실패:', error);
      customAlert('오류', '책 검색 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const renderBookItem = ({ item }: { item: KakaoBook }) => {
    const isbn13 = getIsbn13(item);
    const bookContent = (
      <TouchableOpacity style={styles.bookItem} activeOpacity={0.8} disabled={!isbn13}>
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} resizeMode="cover" />
        <View style={styles.bookInfo}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.authors} numberOfLines={1}>{item.authors.join(', ')}</Text>
        </View>
        {isbn13 && <Text style={styles.chevron}>›</Text>}
      </TouchableOpacity>
    );
    return isbn13 ? <Link href={`/book/${isbn13}`} asChild>{bookContent}</Link> : bookContent;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* ── Masthead ── */}
      <View style={styles.masthead}>
        <Text style={styles.mastheadTitle}>검색.</Text>
      </View>

      {/* ── Search Bar ── */}
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="제목 또는 저자"
            placeholderTextColor={Colors[colorScheme].inkFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchBooks}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButton} onPress={searchBooks}>
            <Text style={styles.searchButtonText}>검색</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Results ── */}
      <FlatList
        data={books}
        renderItem={renderBookItem}
        keyExtractor={(item) => item.isbn || item.title}
        style={styles.bookList}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListHeaderComponent={
          loading ? (
            <ActivityIndicator style={{ marginVertical: 32 }} color={Colors[colorScheme].inkSoft} />
          ) : books.length > 0 ? (
            <>
              <Text style={styles.resultLabel}>{books.length}건의 검색 결과</Text>
              <View style={styles.dividerTop} />
            </>
          ) : null
        }
        ListEmptyComponent={
          !loading && hasSearched ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
