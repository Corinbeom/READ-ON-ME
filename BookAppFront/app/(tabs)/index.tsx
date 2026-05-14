import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  View,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { bookApi, recommendationApi } from '@/src/services/api';
import { Book } from '@/src/types/book';

interface LibraryBook {
  ranking: string;
  bookname: string;
  authors: string;
  publisher: string;
  isbn13: string;
  bookImageURL: string;
}

const calcAgeGroup = (birthYear: number): number => {
  const actualAge = new Date().getFullYear() - birthYear;
  return Math.max(10, Math.min(60, Math.floor(actualAge / 10) * 10));
};

const mapLibraryBookToBook = (item: LibraryBook, index: number): Book => ({
  id: parseInt(item.ranking, 10) || index + 1,
  title: item.bookname || '',
  thumbnail: item.bookImageURL || '',
  authors: item.authors || '',
  publisher: item.publisher || '',
  isbn13: item.isbn13 || '',
  contents: '', url: '', isbn10: '', datetime: '', price: 0, sale_price: 0, status: '',
});
import { getHomeScreenStyles } from '@/src/styles/HomeScreen.styles';
import BookCarousel from '@/components/BookCarousel';
import AiChatModal from '@/components/AiChatModal';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function HomeScreen() {
  const [naruBooks, setNaruBooks] = useState<Book[]>([]);
  const [naruLoading, setNaruLoading] = useState(false);
  const [recommendedBooks, setRecommendedBooks] = useState<Book[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationType, setRecommendationType] = useState<string>('personalized');
  const [modalVisible, setModalVisible] = useState(false);
  const [isAiChatModalVisible, setIsAiChatModalVisible] = useState(false);

  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { unreadCount } = useSelector((state: RootState) => state.notifications);

  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getHomeScreenStyles(colorScheme);
  const c = Colors[colorScheme];
  const hasUnreadNotifications = unreadCount > 0;

  const fetchNaruBooks = async () => {
    setNaruLoading(true);
    try {
      const ageGroup = user?.birth_year ? calcAgeGroup(user.birth_year) : undefined;
      const response = await bookApi.getPopularBooksFromLibrary(ageGroup);
      const mapped = (response.data as LibraryBook[]).map(mapLibraryBookToBook);
      setNaruBooks(mapped);
    } catch (error) {
      console.error('인기 책 조회 실패:', error);
    } finally {
      setNaruLoading(false);
    }
  };

  const fetchRecommendations = async () => {
    if (!isAuthenticated || !user?.id) {
      if (recommendedBooks.length > 0) setRecommendedBooks([]);
      return;
    }
    setRecommendationsLoading(true);
    try {
      const response = await recommendationApi.getRecommendations();
      const { type, bookIds } = response.data;
      setRecommendationType(type);
      if (bookIds && bookIds.length > 0) {
        const booksResponse = await bookApi.getBooksByIds(bookIds);
        setRecommendedBooks(booksResponse.data);
      } else {
        setRecommendedBooks([]);
      }
    } catch (error) {
      console.error('[추천 로직] 추천 책 조회 실패:', error);
    } finally {
      setRecommendationsLoading(false);
    }
  };

  useEffect(() => { fetchNaruBooks(); }, [isAuthenticated]);
  useEffect(() => { fetchRecommendations(); }, [isAuthenticated, user]);

  const now = new Date();
  const issueLabel = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Masthead ── */}
      <View style={styles.masthead}>
        <Text style={styles.mastheadTitle}>Read On Me</Text>
        <View style={styles.mastheadRight}>
          {isAuthenticated ? (
            <TouchableOpacity
              onPress={() => router.push('/notifications')}
              style={styles.notificationBellButton}
              accessibilityLabel="알림 확인"
            >
              <Ionicons
                name={hasUnreadNotifications ? 'notifications' : 'notifications-outline'}
                size={22}
                color={c.text}
              />
              {hasUnreadNotifications && <View style={styles.notificationDot} />}
            </TouchableOpacity>
          ) : (
            <View style={styles.authButtons}>
              <TouchableOpacity
                style={styles.loginButton}
                onPress={() => router.push('/auth/login')}
              >
                <Text style={styles.loginButtonText}>로그인</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.registerButton}
                onPress={() => router.push('/auth/register')}
              >
                <Text style={styles.registerButtonText}>회원가입</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ── Issue Bar ── */}
      <View style={styles.issueBar}>
        <Text style={styles.issueBarText}>{issueLabel} · Read On Me</Text>
        <Text style={styles.issueBarText}>이번 주 화제</Text>
      </View>

      {/* ── AI Prompt Section ── */}
      <TouchableOpacity
        style={styles.aiSection}
        onPress={() => setIsAiChatModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.aiLabel}>AI 사서</Text>
        <Text style={styles.aiQuote}>"</Text>
        <Text style={styles.aiPromptText}>
          어떤 책을 찾고 계신가요?{'\n'}스릴러, 자기계발, 감동적인 소설 …
        </Text>
        <Text style={styles.aiSubText}>탭하여 AI에게 추천받기 →</Text>
      </TouchableOpacity>

      {/* ── 인기 책 (도서관 정보나루) ── */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {isAuthenticated && user?.birth_year
              ? `${calcAgeGroup(user.birth_year)}대에게 인기인 책`
              : '이달의 인기 책'}
          </Text>
          {naruBooks.length > 0 && (
            <Text style={styles.sectionCount}>{naruBooks.length}권</Text>
          )}
        </View>
        {isAuthenticated && !user?.birth_year && (
          <Text style={styles.birthYearHint}>
            출생연도를 설정하면 나이대에 맞는 인기 책을 볼 수 있어요
          </Text>
        )}
        <View style={styles.sectionDivider} />
        <BookCarousel
          title=""
          books={naruBooks}
          loading={naruLoading}
        />
      </View>

      {/* ── 개인 추천 ── */}
      {isAuthenticated && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {recommendationType === 'personalized'
                ? '나와 같은 취향의 사람들이 읽은 책'
                : `${user?.nickname}님을 위한 인기 도서`}
            </Text>
            <Pressable onPress={() => setModalVisible(true)}>
              <Text style={[styles.sectionCount, { textDecorationLine: 'underline' }]}>
                추천 기준 ?
              </Text>
            </Pressable>
          </View>
          <View style={styles.sectionDivider} />
          <BookCarousel
            title=""
            books={recommendedBooks}
            loading={recommendationsLoading}
            emptyMessage="독서 활동을 시작하면 추천이 생성돼요."
          />
        </View>
      )}

      {/* ── Modal ── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>사용자 기반 추천이란?</Text>
            <Text style={styles.modalText}>
              비슷한 독서 취향을 가진 사용자들이 읽은 책을 보여드립니다.
            </Text>
            <Pressable
              style={[styles.button, styles.buttonClose]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.textStyle}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <AiChatModal
        isVisible={isAiChatModalVisible}
        onClose={() => setIsAiChatModalVisible(false)}
      />

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
