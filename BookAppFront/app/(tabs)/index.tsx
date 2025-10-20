// BookAppFront/app/(tabs)/index.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useSelector } from 'react-redux';
import { RootState } from '../../src/store';
import { bookApi } from '../../src/services/api';
import { Book } from '../../src/types/book';
import customAlert from '../../src/utils/alert'; // Import customAlert
import { getIsbn13 } from '../../src/utils/bookUtils';

export default function HomeScreen() {
  const [popularBooks, setPopularBooks] = useState<Book[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);

  // 인기 책 가져오기
  const fetchPopularBooks = async () => {
    setPopularLoading(true);
    try {
      const response = await bookApi.getPopularBooks();
      setPopularBooks(response.data);
    } catch (error) {
      console.error('인기 책 조회 실패:', error);
    } finally {
      setPopularLoading(false);
    }
  };

  // 컴포넌트 마운트 시 인기 책 가져오기
  useEffect(() => {
    fetchPopularBooks();
  }, []);

  

  const renderPopularBookItem = ({ item }: { item: Book }) => {
    const isbn13 = getIsbn13(item);
    const bookContent = (
      <TouchableOpacity
        style={styles.popularBookItem}
        activeOpacity={0.8}
        disabled={!isbn13}
      >
        <Image source={{ uri: item.thumbnail }} style={styles.popularThumbnail} />
        <Text style={styles.popularTitle} numberOfLines={2}>{item.title}</Text>
      </TouchableOpacity>
    );
    return isbn13 ? <Link href={`/book/${isbn13}`} asChild>{bookContent}</Link> : bookContent;
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.headerContainer}>
        <View style={styles.headerContentWrapper}> {/* New wrapper View */}
          <Image source={require('@/assets/images/main_logo2.png')} style={styles.logo} />
          <View style={styles.authContainer}>
            {isAuthenticated ? (
              <Text style={styles.welcomeText}>{user?.nickname}님 환영합니다!</Text>
            ) : (
              <View style={styles.authButtons}>
                <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/auth/login')}>
                  <Text style={styles.loginButtonText}>로그인</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.registerButton} onPress={() => router.push('/auth/register')}>
                  <Text style={styles.registerButtonText}>회원가입</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* AI 추천 검색 (구현 예정) */}
      <View style={styles.recommendationSection}>
        <Text style={styles.recommendationTitle}>AI 추천 검색</Text>
        <Text style={styles.recommendationText}>이곳에 AI 추천 검색 기능이 들어갈 예정입니다.</Text>
      </View>

      {/* 인기 책 섹션 */}
      <View style={styles.popularSection}>
        <View style={styles.popularHeader}>
          <Text style={styles.popularHeaderTitle}>인기 책</Text>
        </View>
        <FlatList
          data={popularBooks}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.isbn13 || item.isbn10 || item.title}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={renderPopularBookItem}
        />
      </View>

      {/* 사용자 기반 추천 (구현 예정) */}
      <View style={styles.recommendationSection}>
        <Text style={styles.recommendationTitle}>사용자 기반 추천</Text>
        <Text style={styles.recommendationText}>이곳에 사용자 기반 추천 기능이 들어갈 예정입니다.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  headerContainer: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerContentWrapper: { // New style
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    width: 120, // Adjust as needed
    height: 40, // Adjust as needed
    resizeMode: 'contain',
  },
  authContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 }, // Adjusted authContainer
  welcomeText: { fontSize: 16, color: '#007AFF', fontWeight: '500' },
  authButtons: { flexDirection: 'row', gap: 10 },
  loginButton: { backgroundColor: '#007AFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  loginButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  registerButton: { backgroundColor: '#28a745', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  registerButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  popularSection: { backgroundColor: '#fff', marginTop: 24, marginHorizontal: 16, borderRadius: 12, paddingVertical: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  popularHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  popularHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#212529' },
  popularBookItem: { width: 180, marginRight: 12, alignItems: 'center' },
  popularThumbnail: { width: 100, height: 150, borderRadius: 8, backgroundColor: '#f0f0f0', marginBottom: 8, resizeMode: 'contain' },
  popularTitle: { fontSize: 14, fontWeight: '600', color: '#212529', textAlign: 'center', lineHeight: 16 },

  recommendationSection: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  recommendationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  recommendationText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
  },
});
