// BookAppFront/app/(tabs)/search.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
} from 'react-native';
import axios from 'axios';
import { Link } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Book } from '../../src/types/book';
import customAlert from '../../src/utils/alert'; // Use customAlert
import { getIsbn13 } from '../../src/utils/bookUtils';

interface SearchResponse {
  documents: Book[];
  meta: {
    total_count: number;
    is_end: boolean;
  };
}

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);

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

  

  const renderBookItem = ({ item }: { item: Book }) => {
    const isbn13 = getIsbn13(item);
    const bookContent = (
      <TouchableOpacity style={styles.bookItem} activeOpacity={0.8} disabled={!isbn13}>
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        <View style={styles.bookInfo}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.authors} numberOfLines={1}>{item.authors.join(', ')}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.publisher} numberOfLines={1}>{item.publisher}</Text>
            <View style={styles.dot} />
            <Text style={styles.price}>{item.price.toLocaleString()}원</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={isbn13 ? '#adb5bd' : '#e9ecef'} />
      </TouchableOpacity>
    );
    return isbn13 ? <Link href={`/book/${isbn13}`} asChild>{bookContent}</Link> : bookContent;
  };

  return (
    <View style={styles.container}>
      {/* 검색창 */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="책 제목이나 저자를 검색해보세요"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={searchBooks}
        />
        <TouchableOpacity style={styles.searchButton} onPress={searchBooks} disabled={loading}>
          <Text style={styles.searchButtonText}>{loading ? '검색중...' : '🔍'}</Text>
        </TouchableOpacity>
      </View>

      {/* 검색 결과 */}
      <FlatList
        data={books}
        renderItem={renderBookItem}
        keyExtractor={(item) => item.isbn13 || item.isbn10 || item.title}
        style={styles.bookList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📖</Text>
            <Text style={styles.emptyText}>
              {searchQuery ? '검색 결과가 없습니다.' : '책을 검색해보세요!'}
            </Text>
            <Text style={styles.emptySubText}>
              {searchQuery ? '다른 검색어로 시도해보세요' : '제목, 저자명으로 검색할 수 있어요'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 30,
    backgroundColor: '#fff',
    marginTop: 70,
    marginHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  searchButton: { marginLeft: 12, backgroundColor: '#007AFF', borderRadius: 8, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', minWidth: 60 },
  searchButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  bookList: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  bookItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginVertical: 6, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  thumbnail: { width: 64, height: 88, borderRadius: 8, backgroundColor: '#f0f0f0' },
  bookInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#212529', marginBottom: 4, lineHeight: 22 },
  authors: { fontSize: 13, color: '#6c757d', marginBottom: 6 },
  publisher: { fontSize: 12, color: '#adb5bd' },
  price: { fontSize: 14, fontWeight: '700', color: '#007AFF' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#dee2e6' },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#495057', marginBottom: 8, textAlign: 'center' },
  emptySubText: { fontSize: 14, color: '#6c757d', textAlign: 'center', lineHeight: 20 },
});
