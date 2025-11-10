

import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
  Pressable,
  View, // Keep for specific layout needs
} from 'react-native';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { FontAwesome } from '@expo/vector-icons';
import { RootState } from '@/src/store';
import { bookApi, recommendationApi } from '@/src/services/api';
import { Book } from '@/src/types/book';
import { getHomeScreenStyles } from '@/src/styles/HomeScreen.styles';
import BookCarousel from '@/components/BookCarousel';
import AiChatModal from '@/components/AiChatModal';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
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

  const colorScheme = useColorScheme() ?? 'light';
  const styles = getHomeScreenStyles(colorScheme);
  const colors = Colors[colorScheme];

  const fetchPopularBooks = async () => {
    setPopularLoading(true);
    try {
      const response = await bookApi.getPopularBooks();
      setPopularBooks(response.data);
    } catch (error) {
      console.error('인기 책 조회 실패:', error);
    }
    finally {
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
      const response = await recommendationApi.getRecommendations(user.id);
      const recommendedIds = response.data;

      if (recommendedIds && recommendedIds.length > 0) {
        const booksResponse = await bookApi.getBooksByIds(recommendedIds);
        setRecommendedBooks(booksResponse.data);
      } else {
        setRecommendedBooks([]);
      }
    }
    catch (error) {
      console.error('[추천 로직] 추천 책 조회 실패:', error);
    }
    finally {
      setRecommendationsLoading(false);
    }
  };

  useEffect(() => {
    fetchPopularBooks();
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [isAuthenticated, user]);

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.headerContainer}>
        <View style={styles.headerContentWrapper}>
                    <Image 
            source={colorScheme === 'dark' 
              ? require('@/assets/images/main_logo_dark.png') 
              : require('@/assets/images/main_logo.png')} 
            style={styles.logo} 
          />
          <View style={styles.authContainer}>
            {isAuthenticated ? (
              <ThemedText style={styles.welcomeText}>{user?.nickname}님 환영합니다!</ThemedText>
            ) : (
              <View style={styles.authButtons}>
                <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/auth/login')}>
                  <ThemedText style={styles.loginButtonText}>로그인</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.registerButton} onPress={() => router.push('/auth/register')}>
                  <ThemedText style={styles.registerButtonText}>회원가입</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ThemedView>

      <TouchableOpacity 
        style={styles.chatBubble}
        onPress={() => setIsAiChatModalVisible(true)}
      >
        <ThemedText style={styles.chatEmoji}>📖</ThemedText>
        <View style={styles.chatTextWrapper}>
          <ThemedText style={styles.chatTitle}>AI 추천 검색</ThemedText>
          <ThemedText style={styles.chatDesc}>
            “스릴러 소설 추천해줘” 라고 말해보세요!{'\n'}
            해당 섹션을 클릭하면 채팅창이 나와요!
          </ThemedText>
        </View>
      </TouchableOpacity>

      <BookCarousel 
        title="인기 책"
        books={popularBooks}
        loading={popularLoading}
      />

      {isAuthenticated && (
        <BookCarousel 
          title={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ThemedText style={styles.recommendationHeaderTitle}>{user?.nickname}님을 위한 추천</ThemedText>
              <Pressable onPress={() => setModalVisible(true)}>
                <FontAwesome name="question-circle-o" size={20} color={colors.darkGray} />
              </Pressable>
            </View>
          }
          books={recommendedBooks}
          loading={recommendationsLoading}
          emptyMessage="🤔 아직 추천할 도서가 없어요. 독서 활동을 시작해보세요!"
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(!modalVisible)}
      >
        <View style={styles.centeredView}>
          <ThemedView style={styles.modalView}>
            <ThemedText style={styles.modalTitle}>사용자 기반 추천이란?</ThemedText>
            <ThemedText style={styles.modalText}>
              회원님의 독서 기록(읽는 중, 다 읽음)을 바탕으로, 비슷한 독서 취향을 가진 다른 사용자들이 재미있게 읽었지만 회원님은 아직 읽지 않은 책을 찾아 추천해 드리는 기능입니다.
            </ThemedText>
            <Pressable
              style={[styles.button, styles.buttonClose]}
              onPress={() => setModalVisible(!modalVisible)}
            >
              <ThemedText style={styles.textStyle}>닫기</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <AiChatModal 
        isVisible={isAiChatModalVisible} 
        onClose={() => setIsAiChatModalVisible(false)} 
      />

    </ScrollView>
  );
}