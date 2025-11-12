import React, { useState } from 'react';
import {
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
  View,
} from 'react-native';
import axios from 'axios';
import { Link } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KakaoBook } from '../../src/types/kakaoBook';
import customAlert from '../../src/utils/alert';
import { getIsbn13 } from '../../src/utils/bookUtils';
import { Colors } from '@/constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

interface SearchResponse {
  documents: KakaoBook[];
  meta: { total_count: number; is_end: boolean };
}

const getStyles = (colorScheme: 'light' | 'dark') => {
  const colors = Colors[colorScheme];
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    searchSectionContainer: { paddingHorizontal: 20, paddingTop: 20 },
    sectionTitle: { fontSize: 24, fontFamily: 'Pretendard-SemiBold', marginBottom: 20, color: colors.text },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      height: 44,
      borderWidth: 1,
      borderColor: colors.lightGray,
    },
    searchIcon: { marginRight: 8 },
    searchInput: {
      flex: 1,
      fontSize: 16,
      fontFamily: 'NotoSerifKR-Regular',
      color: colors.text,
      paddingVertical: 8,
    },
    bookList: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    bookItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      marginVertical: 6,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.lightGray,
    },
    thumbnail: { width: 64, height: 88, borderRadius: 8, backgroundColor: colors.lightGray },
    bookInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
    title: { fontSize: 16, fontFamily: 'Pretendard-SemiBold', color: colors.text, marginBottom: 4, lineHeight: 22 },
    authors: { fontSize: 13, fontFamily: 'NotoSerifKR-Regular', color: colors.darkGray, marginBottom: 6 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
    emptyText: { fontSize: 16, fontFamily: 'NotoSerifKR-Regular', color: colors.darkGray },
  });
};

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<KakaoBook[]>([]);
  const [loading, setLoading] = useState(false);

  const colorScheme = useColorScheme() ?? 'light';
  const styles = getStyles(colorScheme);
  const colors = Colors[colorScheme];

  const searchBooks = async () => {
    if (!searchQuery.trim()) {
      customAlert('알림', '검색어를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get<SearchResponse>(
        'http://localhost:8080/api/books/search',
        { params: { query: searchQuery, size: 20 } }
      );
      setBooks(response.data.documents);
    } catch (error) {
      console.error('검색 실패:', error);
      customAlert('오류', '책 검색 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const renderKeywordBookItem = ({ item }: { item: KakaoBook }) => {
    const isbn13 = getIsbn13(item);
    const bookContent = (
      <TouchableOpacity style={styles.bookItem} activeOpacity={0.8} disabled={!isbn13}>
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        <View style={styles.bookInfo}>
          <ThemedText style={styles.title} numberOfLines={2}>{item.title}</ThemedText>
          <ThemedText style={styles.authors} numberOfLines={1}>{item.authors.join(', ')}</ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={isbn13 ? colors.darkGray : colors.lightGray} />
      </TouchableOpacity>
    );
    return isbn13 ? <Link href={`/book/${isbn13}`} asChild>{bookContent}</Link> : bookContent;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ThemedView style={styles.searchSectionContainer}>
        <ThemedText style={styles.sectionTitle}>책 검색</ThemedText>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.darkGray} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="책 제목이나 저자를 검색해보세요"
            placeholderTextColor={colors.darkGray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchBooks}
            returnKeyType="search"
          />
        </View>
      </ThemedView>
      <FlatList
        data={books}
        renderItem={renderKeywordBookItem}
        keyExtractor={(item) => item.isbn || item.title}
        style={styles.bookList}
        ListHeaderComponent={loading ? <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} /> : null}
        ListEmptyComponent={
          !loading && searchQuery ? (
            <View style={styles.emptyContainer}>
               <ThemedText style={styles.emptyText}>검색 결과가 없습니다.</ThemedText>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
