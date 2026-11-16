import AppTextInput from '@/components/ui/AppTextInput';
import AppButton from '@/components/ui/AppButton';
import ScreenState from '@/components/ui/ScreenState';
import { Typography, UI } from '@/src/styles/designTokens';
import { secureImageUri } from '@/src/utils/imageUri';
import React, { useState, useRef } from 'react';
import {
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
  View,
  Text,
} from 'react-native';
import { Link } from 'expo-router';
import { KakaoBook } from '../../src/types/kakaoBook';
import customAlert from '../../src/utils/alert';
import { getIsbn13 } from '../../src/utils/bookUtils';
import { Colors } from '@/constants/Colors';
import TabScreen, { TabHeader } from '@/components/TabScreen';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { useColorScheme } from '@/hooks/useColorScheme';
import { bookApi } from '@/src/services/api';

interface SearchResponse {
  documents: KakaoBook[];
  meta: { total_count: number; is_end: boolean };
}


const getStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];
  return StyleSheet.create({
    searchSection: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.line },
    searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.line, borderRadius: UI.controlRadius, overflow: 'hidden', backgroundColor: c.card },
    searchInput: { flex: 1 },
    searchButton: { borderRadius: 0 },
    bookList: { flex: 1 },
    content: { paddingBottom: SCREEN_LAYOUT.bottomPadding },
    bookItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 16, backgroundColor: c.background },
    thumbnail: { width: 52, height: 74, borderRadius: 0, backgroundColor: c.surface2 },
    bookInfo: { flex: 1, marginLeft: 16 },
    title: { ...Typography.bookTitle, color: c.text, marginBottom: 4, letterSpacing: -0.2 },
    authors: { ...Typography.caption, color: c.inkSoft, letterSpacing: 0.1, textTransform: 'uppercase' },
    chevron: { fontSize: 14, color: c.inkFaint, fontFamily: 'Pretendard-SemiBold' },
    divider: { height: 1, backgroundColor: c.line, marginHorizontal: SCREEN_LAYOUT.gutter },
    dividerTop: { height: 2, backgroundColor: c.text, marginHorizontal: SCREEN_LAYOUT.gutter },
    resultLabel: { ...Typography.caption, color: c.inkSoft, letterSpacing: 0.2, textTransform: 'uppercase', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: 20, paddingBottom: 14 },
    suggestionItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 10, minHeight: 64 },
    suggestionThumbnail: { width: 28, height: 40, backgroundColor: c.surface2, marginRight: 12 },
    suggestionTitle: { ...Typography.label, color: c.text, flex: 1 },
    suggestionAuthor: { ...Typography.caption, color: c.inkSoft, letterSpacing: 0.1, textTransform: 'uppercase', marginTop: 2 },
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
        <Image source={{ uri: secureImageUri(item.thumbnail) }} style={styles.thumbnail} resizeMode="cover" />
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
    <TabScreen testID="search-tab-screen">
      {/* ── Masthead ── */}
      <TabHeader title="검색." />

      {/* ── Search Bar ── */}
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <AppTextInput inline
            style={styles.searchInput}
            placeholder="제목 또는 저자"
            accessibilityLabel="제목 또는 저자"
            placeholderTextColor={Colors[colorScheme].inkFaint}
            value={searchQuery}
            onChangeText={handleTextChange}
            onSubmitEditing={() => searchBooks()}
            returnKeyType="search"
          />
          <AppButton title="검색" onPress={() => searchBooks()} style={styles.searchButton} />
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
                <Image source={{ uri: secureImageUri(item.thumbnail) }} style={styles.suggestionThumbnail} resizeMode="cover" />
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
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListHeaderComponent={
          showSuggestions ? null :
          loading ? (
            <ActivityIndicator style={{ marginVertical: 32 }} color={Colors[colorScheme].inkSoft} />
          ) : !hasSearched ? (
            <ScreenState title="어떤 책을 찾고 있나요?" description="제목 또는 저자 이름으로 원하는 책을 찾아보세요." />
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
            <ScreenState title="검색 결과가 없어요" description="다른 제목이나 저자 이름으로 다시 찾아보세요." />
          ) : null
        }
      />
    </TabScreen>
  );
}
