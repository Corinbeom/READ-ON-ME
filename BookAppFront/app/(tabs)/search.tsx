import React, { useState, useRef } from 'react';
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
      paddingTop: 4,
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

    // ── Idle State ────────────────────────────────────────
    idleContainer: {
      paddingHorizontal: 22,
      paddingTop: 40,
    },
    idleHint: {
      fontSize: 13,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.inkSoft,
      fontStyle: Platform.OS === 'android' ? 'normal' : 'italic',
      lineHeight: 22,
    },

    // ── Autocomplete ──────────────────────────────────────
    suggestionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    suggestionThumbnail: {
      width: 28,
      height: 40,
      backgroundColor: c.surface2,
      marginRight: 12,
    },
    suggestionTitle: {
      fontSize: 13,
      fontFamily: 'NotoSerifKR-Regular',
      color: c.text,
      flex: 1,
    },
    suggestionAuthor: {
      fontSize: 10,
      fontFamily: 'Pretendard-SemiBold',
      color: c.inkSoft,
      letterSpacing: 0.1,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    suggestionDivider: {
      height: 1,
      backgroundColor: c.line,
      marginHorizontal: 14,
    },
  });
};

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<KakaoBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<KakaoBook[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getStyles(colorScheme);

  const searchBooks = async (q?: string) => {
    const query = q ?? searchQuery;
    if (!query.trim()) {
      customAlert('알림', '검색어를 입력해주세요.');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowSuggestions(false);
    setSuggestions([]);
    setLoading(true);
    setHasSearched(true);
    try {
      const response = await bookApi.searchBooks({ query, size: 20 });
      setBooks((response.data as SearchResponse).documents);
    } catch (error) {
      console.error('검색 실패:', error);
      customAlert('오류', '책 검색 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleTextChange = (text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await bookApi.searchBooks({ query: text, size: 5 });
        const docs = (response.data as SearchResponse)?.documents ?? [];
        setSuggestions(docs);
        setShowSuggestions(docs.length > 0);
      } catch (e) {
        console.error('[AC] error:', e);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 400);
  };

  const handleSuggestionPress = (book: KakaoBook) => {
    setSearchQuery(book.title);
    searchBooks(book.title);
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
            onChangeText={handleTextChange}
            onSubmitEditing={() => searchBooks()}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButton} onPress={() => searchBooks()}>
            <Text style={styles.searchButtonText}>검색</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Results / Autocomplete ── */}
      <FlatList
        data={showSuggestions ? suggestions : books}
        renderItem={showSuggestions
          ? ({ item }: { item: KakaoBook }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSuggestionPress(item)}
                activeOpacity={0.7}
              >
                <Image source={{ uri: item.thumbnail }} style={styles.suggestionThumbnail} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.suggestionAuthor} numberOfLines={1}>{item.authors.join(', ')}</Text>
                </View>
              </TouchableOpacity>
            )
          : renderBookItem
        }
        keyExtractor={(item) => item.isbn || item.title}
        style={styles.bookList}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListHeaderComponent={
          showSuggestions ? null :
          loading ? (
            <ActivityIndicator style={{ marginVertical: 32 }} color={Colors[colorScheme].inkSoft} />
          ) : !hasSearched ? (
            <View style={styles.idleContainer}>
              <Text style={styles.idleHint}>
                제목 또는 저자 이름으로{'\n'}원하는 책을 찾아보세요.
              </Text>
            </View>
          ) : books.length > 0 ? (
            <>
              <Text style={styles.resultLabel}>{books.length}건의 검색 결과</Text>
              <View style={styles.dividerTop} />
            </>
          ) : null
        }
        ListEmptyComponent={
          showSuggestions || loading ? null :
          hasSearched ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
