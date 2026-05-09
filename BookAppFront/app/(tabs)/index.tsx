import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  View,
  Text,
} from 'react-native';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { bookApi, recommendationApi } from '@/src/services/api';
import { Book } from '@/src/types/book';
import { getHomeScreenStyles } from '@/src/styles/HomeScreen.styles';
import BookCarousel from '@/components/BookCarousel';
import AiChatModal from '@/components/AiChatModal';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function HomeScreen() {
  const [popularBooks, setPopularBooks] = useState<Book[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [recommendedBooks, setRecommendedBooks] = useState<Book[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [isAiChatModalVisible, setIsAiChatModalVisible] = useState(false);

  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { unreadCount } = useSelector((state: RootState) => state.notifications);

  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getHomeScreenStyles(colorScheme);
  const c = Colors[colorScheme];
  const hasUnreadNotifications = unreadCount > 0;

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

  const fetchRecommendations = async () => {
    if (!isAuthenticated || !user?.id) {
      if (recommendedBooks.length > 0) setRecommendedBooks([]);
      return;
    }
    setRecommendationsLoading(true);
    try {
      const response = await recommendationApi.getRecommendations();
      const recommendedIds = response.data;
      if (recommendedIds && recommendedIds.length > 0) {
        const booksResponse = await bookApi.getBooksByIds(recommendedIds);
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

  useEffect(() => { fetchPopularBooks(); }, []);
  useEffect(() => { fetchRecommendations(); }, [isAuthenticated, user]);

  const now = new Date();
  const issueLabel = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Masthead ── */}
      <View style={styles.masthead}>
        <Text style={styles.mastheadTitle}>Read.</Text>
        <View style={styles.mastheadRight}>
          {isAuthenticated ? (
            <TouchableOpacity
              onPress={() => router.push('/notifications')}
              style={styles.notificationBellButton}
              accessibilityLabel="알림 확인"
            >
              <Text style={{ fontSize: 18, color: c.text }}>
                {hasUnreadNotifications ? '🔔' : '🔕'}
              </Text>
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

      {/* ── 인기 책 ── */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>인기 책</Text>
          {popularBooks.length > 0 && (
            <Text style={styles.sectionCount}>{popularBooks.length}권</Text>
          )}
        </View>
        <View style={styles.sectionDivider} />
        <BookCarousel
          title=""
          books={popularBooks}
          loading={popularLoading}
        />
      </View>

      {/* ── 개인 추천 ── */}
      {isAuthenticated && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {user?.nickname}님의 추천
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
              회원님의 독서 기록을 바탕으로, 비슷한 독서 취향을 가진 다른 사용자들이 읽은 책을 추천해 드리는 기능입니다.
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
