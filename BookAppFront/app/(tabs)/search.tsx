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
import { KakaoBook } from '../../src/types/kakaoBook'; // Import KakaoBook
import customAlert from '../../src/utils/alert'; // Use customAlert
import { getIsbn13 } from '../../src/utils/bookUtils';
import { Colors } from '@/constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';


interface SearchResponse {
  documents: KakaoBook[]; // Use KakaoBook here
  meta: {
    total_count: number;
    is_end: boolean;
  };
}

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<KakaoBook[]>([]); // Use KakaoBook here
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

  

  const renderBookItem = ({ item }: { item: KakaoBook }) => {
    const isbn13 = getIsbn13(item); // getIsbn13 needs to be updated to handle KakaoBook
    const bookContent = (
      <TouchableOpacity style={styles.bookItem} activeOpacity={0.8} disabled={!isbn13}>
        <View> 
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
          <View style={styles.thumbnailOverlay} />
        </View>
        <View style={styles.bookInfo}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.authors} numberOfLines={1}>{item.authors.join(', ')}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.publisher} numberOfLines={1}>{item.publisher}</Text>
            <View style={styles.dot} />
            <Text style={styles.price}>{item.price.toLocaleString()}원</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={isbn13 ? Colors.light.darkGray : Colors.light.lightGray} />
      </TouchableOpacity>
    );
    return isbn13 ? <Link href={`/book/${isbn13}`} asChild>{bookContent}</Link> : bookContent;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
    <View style={styles.container}>
      {/* 검색창 */}
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


      {/* 검색 결과 */}
      <FlatList
        data={books}
        renderItem={renderBookItem}
        keyExtractor={(item) => item.isbn || item.title} // Revert keyExtractor
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F4F2', // 살짝 따뜻한 톤 유지
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },  
  searchIcon: {
    marginRight: 8,
    color: Colors.light.darkGray,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.text,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },  
  searchButton: {
    marginLeft: 12,
    backgroundColor: Colors.light.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
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
  thumbnail: {
    width: 64,
    height: 88,
    borderRadius: 8,
    backgroundColor: Colors.light.lightGray,
  },
  thumbnailOverlay: { // New style for image overlay
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 250, 240, 0.05)',
    borderRadius: 8, // Should match the thumbnail borderRadius
  },
  bookInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  title: {
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.text,
    marginBottom: 4,
    lineHeight: 22,
  },
  authors: {
    fontSize: 13,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
    marginBottom: 6,
  },
  publisher: {
    fontSize: 12,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
  },
  price: {
    fontSize: 14,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.primary,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.light.lightGray },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
    textAlign: 'center',
    lineHeight: 22,
  },
});
