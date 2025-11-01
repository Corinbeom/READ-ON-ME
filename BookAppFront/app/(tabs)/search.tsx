import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import { Link } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KakaoBook } from '../../src/types/kakaoBook';
import customAlert from '../../src/utils/alert';
import { getIsbn13 } from '../../src/utils/bookUtils';
import { Colors } from '@/constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';

interface SearchResponse {
  documents: KakaoBook[];
  meta: { total_count: number; is_end: boolean; };
}

// AI Search result type (based on BookCorpus)
interface AiBookResult {
  id: number;
  title: string;
  contents: string;
  isbn: string;
  authors: string; // Note: this is a string, not string[]
  publisher: string;
  thumbnail: string;
  similarity: number;
}

export default function SearchScreen() {
  // State for Keyword Search
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<KakaoBook[]>([]);
  const [loading, setLoading] = useState(false);

  // State for AI Search
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [aiBooks, setAiBooks] = useState<AiBookResult[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

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

  const handleAiSearch = async () => {
    if (!aiSearchQuery.trim()) {
      customAlert('알림', 'AI 검색어를 입력해주세요.');
      return;
    }
    setAiLoading(true);
    try {
      const response = await axios.get('http://localhost:8080/api/ai/search', {
        params: { query: aiSearchQuery },
      });
      setAiBooks(response.data);
    } catch (error) {
      console.error('AI 검색 실패:', error);
      customAlert('오류', 'AI 검색 중 오류가 발생했습니다.');
    } finally {
      setAiLoading(false);
    }
  };

  const renderKeywordBookItem = ({ item }: { item: KakaoBook }) => {
    const isbn13 = getIsbn13(item);
    const bookContent = (
      <TouchableOpacity style={styles.bookItem} activeOpacity={0.8} disabled={!isbn13}>
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        <View style={styles.bookInfo}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.authors} numberOfLines={1}>{item.authors.join(', ')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={isbn13 ? Colors.light.darkGray : Colors.light.lightGray} />
      </TouchableOpacity>
    );
    return isbn13 ? <Link href={`/book/${isbn13}`} asChild>{bookContent}</Link> : bookContent;
  };

  const renderAiBookItem = ({ item }: { item: AiBookResult }) => {
    const bookContent = (
      <TouchableOpacity style={styles.bookItem} activeOpacity={0.8}>
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        <View style={styles.bookInfo}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.authors} numberOfLines={1}>{item.authors}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.light.darkGray} />
      </TouchableOpacity>
    );
    return <Link href={`/book/${item.isbn}`} asChild>{bookContent}</Link>;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* AI Search */}
      <View style={styles.searchSectionContainer}>
        <Text style={styles.sectionTitle}>AI 자연어 검색</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="sparkles-outline" size={20} color={Colors.light.darkGray} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder='"외로운 주인공이 나오는 책" 처럼 검색'
            placeholderTextColor={Colors.light.darkGray}
            value={aiSearchQuery}
            onChangeText={setAiSearchQuery}
            onSubmitEditing={handleAiSearch}
            returnKeyType="search"
          />
        </View>
      </View>
      <FlatList
        data={aiBooks}
        renderItem={renderAiBookItem}
        keyExtractor={(item) => item.isbn}
        style={styles.bookList}
        ListHeaderComponent={aiLoading ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null}
        ListEmptyComponent={
          !aiLoading && aiSearchQuery ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>AI 검색 결과가 없습니다.</Text>
            </View>
          ) : null
        }
      />

      <View style={styles.divider} />

      {/* Keyword Search */}
      <View style={styles.searchSectionContainer}>
        <Text style={styles.sectionTitle}>키워드 검색</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.light.darkGray} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="책 제목이나 저자를 검색해보세요"
            placeholderTextColor={Colors.light.darkGray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchBooks}
            returnKeyType="search"
          />
        </View>
      </View>
      <FlatList
        data={books}
        renderItem={renderKeywordBookItem}
        keyExtractor={(item) => item.isbn || item.title}
        style={styles.bookList}
        ListHeaderComponent={loading ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null}
        ListEmptyComponent={
          !loading && searchQuery ? (
            <View style={styles.emptyContainer}>
               <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  searchSectionContainer: { paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: { fontSize: 22, fontFamily: 'Pretendard-SemiBold', marginBottom: 12, color: Colors.light.text },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F4F2',
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 44,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  searchIcon: { marginRight: 8, color: Colors.light.darkGray },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.text,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  bookList: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    marginVertical: 6,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.lightGray,
  },
  thumbnail: { width: 64, height: 88, borderRadius: 8, backgroundColor: Colors.light.lightGray },
  bookInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  title: { fontSize: 16, fontFamily: 'Pretendard-SemiBold', color: Colors.light.text, marginBottom: 4, lineHeight: 22 },
  authors: { fontSize: 13, fontFamily: 'NotoSerifKR-Regular', color: Colors.light.darkGray, marginBottom: 6 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  emptyText: { fontSize: 16, fontFamily: 'NotoSerifKR-Regular', color: Colors.light.darkGray },
  divider: { height: 1, backgroundColor: '#e1e1e1', marginVertical: 24, marginHorizontal: 16 },
});
