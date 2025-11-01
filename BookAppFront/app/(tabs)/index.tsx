import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { FontAwesome } from '@expo/vector-icons';
import { RootState } from '../../src/store';
import { bookApi, recommendationApi } from '../../src/services/api';
import { Book } from '../../src/types/book';
import styles from '../../src/styles/HomeScreen.styles';
import BookCarousel from '../../components/BookCarousel';
import AiChatModal from '../../components/AiChatModal'; // New import

export default function HomeScreen() {
  const [popularBooks, setPopularBooks] = useState<Book[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [recommendedBooks, setRecommendedBooks] = useState<Book[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [isAiChatModalVisible, setIsAiChatModalVisible] = useState(false); // New state
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

  // 사용자 기반 추천 책 가져오기
  const fetchRecommendations = async () => {
    if (!isAuthenticated || !user?.id) {
      // 비로그인 시, 이전 추천 목록을 지웁니다.
      if (recommendedBooks.length > 0) setRecommendedBooks([]);
      return;
    }

    setRecommendationsLoading(true);
    try {
      const response = await recommendationApi.getRecommendations(user.id);
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

  useEffect(() => {
    fetchPopularBooks();
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [isAuthenticated, user]); // 로그인 상태 변경 시 추천 다시 로드

  return (
    <ScrollView style={styles.container}>
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

      {/* AI 추천 검색 트리거 */}
      {/* <TouchableOpacity 
        style={styles.recommendationSection} 
        onPress={() => setIsAiChatModalVisible(true)}
      >
        <Text style={styles.recommendationTitle}>AI 추천 검색</Text>
        <Text style={styles.recommendationText}>
          🤖 AI와 대화하며 당신의 취향에 맞는 도서를 추천받으세요!
        </Text>
      </TouchableOpacity> */}
      {/* AI 추천 검색 챗버블형 */}
<TouchableOpacity 
  style={styles.chatBubble}
  onPress={() => setIsAiChatModalVisible(true)}
>
  <Text style={styles.chatEmoji}>🤖</Text>
  <View style={styles.chatTextWrapper}>
    <Text style={styles.chatTitle}>AI 추천 검색</Text>
    <Text style={styles.chatDesc}>
      “스릴러 소설 추천해줘” 라고 말해보세요!{'\n'}
      해당 섹션을 클릭하면 채팅창이 나와요!
    </Text>
  </View>
</TouchableOpacity>


      {/* 인기 책 섹션 */}
      <BookCarousel 
        title="인기 책"
        books={popularBooks}
        loading={popularLoading}
      />

      {/* 사용자 기반 추천 */}
      {isAuthenticated && (
        <BookCarousel 
          title={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.recommendationHeaderTitle}>{user?.nickname}님을 위한 추천</Text>
              <Pressable onPress={() => setModalVisible(true)}>
                <FontAwesome name="question-circle-o" size={20} color="gray" />
              </Pressable>
            </View>
          }
          books={recommendedBooks}
          loading={recommendationsLoading}
          emptyMessage="🤔 아직 추천할 도서가 없어요. 독서 활동을 시작해보세요!"
        />
      )}

      {/* 기존 모달 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(!modalVisible)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>사용자 기반 추천이란?</Text>
            <Text style={styles.modalText}>
              회원님의 독서 기록(읽는 중, 다 읽음)을 바탕으로, 비슷한 독서 취향을 가진 다른 사용자들이 재미있게 읽었지만 회원님은 아직 읽지 않은 책을 찾아 추천해 드리는 기능입니다.
            </Text>
            <Pressable
              style={[styles.button, styles.buttonClose]}
              onPress={() => setModalVisible(!modalVisible)}
            >
              <Text style={styles.textStyle}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* AI Chat Modal */}
      <AiChatModal 
        isVisible={isAiChatModalVisible} 
        onClose={() => setIsAiChatModalVisible(false)} 
      />

    </ScrollView>
  );
}