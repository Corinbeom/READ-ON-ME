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
import styles from '../../src/styles/HomeScreen.styles';

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

    const BookContent = () => (
      <>
        <View>
          <Image source={{ uri: item.thumbnail }} style={styles.popularThumbnail} />
          <View style={styles.thumbnailOverlay} />
        </View>
        <Text style={styles.popularTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.popularAuthor} numberOfLines={1}>{item.authors || item.publisher}</Text>
      </>
    );

    if (!isbn13) {
      return (
        <View style={styles.popularBookItem}>
          <BookContent />
        </View>
      );
    }

    return (
      <Link href={`/book/${isbn13}`} asChild>
        <TouchableOpacity style={styles.popularBookItem} activeOpacity={0.8}>
          <BookContent />
        </TouchableOpacity>
      </Link>
    );
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.headerContainer}>
        <View style={styles.headerContentWrapper}> 
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
        <Text style={styles.recommendationText}>
          🤖 곧 AI가 당신의 취향을 분석해 맞춤 도서를 추천해드릴 예정이에요!
        </Text>
      </View>

      {/* 인기 책 섹션 */}
      <View style={styles.popularSection}>
        <View style={styles.popularHeader}>
          <Text style={styles.popularHeaderTitle}>인기 책</Text>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={popularBooks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderPopularBookItem}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 8,
            gap: 10,
          }}
        />
      </View>

      {/* 사용자 기반 추천 (구현 예정) */}
      <View style={styles.userRecommendationSection}>
        <Text style={styles.userRecommendationTitle}>사용자 기반 추천</Text>
        <Text style={styles.userRecommendationText}>📖 사용자님의 관심사와 비슷한 책을 추천드릴게요!</Text>
      </View>
    </View>
  );
}


