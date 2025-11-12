
import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, Alert, FlatList, Image, ScrollView, Modal } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/src/store';
import { logout } from '@/src/store/authSlice';
import { Link, router, useFocusEffect } from 'expo-router';
import { bookApi, reviewApi } from '../../src/services/api';
import { BookDto } from '../../src/types/BookDto';
import { Review } from '../../src/types/review';
import { Book, BookOpen, CheckCircle, Pencil } from 'lucide-react-native';
import { getMyLibraryScreenStyles } from '../../src/styles/MyLibraryScreen.styles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';

interface UserLibraryResponse {
  toReadBooks: BookDto[];
  readingBooks: BookDto[];
  completedBooks: BookDto[];
}

export default function MyLibraryScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);

  const [userLibrary, setUserLibrary] = useState<UserLibraryResponse>({ toReadBooks: [], readingBooks: [], completedBooks: [] });
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [errorLibrary, setErrorLibrary] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalBooks, setModalBooks] = useState<BookDto[]>([]);
  const [modalReviews, setModalReviews] = useState<Review[]>([]);
  const [isReviewModal, setIsReviewModal] = useState(false);

  const colorScheme = useColorScheme() ?? 'light';
  const styles = getMyLibraryScreenStyles(colorScheme);
  const colors = Colors[colorScheme];

  useFocusEffect(
    useCallback(() => {
      const fetchUserLibraryAndReviews = async () => {
        if (!isAuthenticated) {
          setUserLibrary({ toReadBooks: [], readingBooks: [], completedBooks: [] });
          setMyReviews([]);
          return;
        }
        setLoadingLibrary(true);
        try {
          const libraryResponse = await bookApi.getUserLibrary();
          setUserLibrary(libraryResponse.data);

          const reviewsResponse = await reviewApi.getMyReviews();
          setMyReviews(reviewsResponse.data.data || []);
        } catch (error: any) {
          console.error('Failed to fetch user library or reviews:', error);
          setErrorLibrary(error.message || '내 서재 및 리뷰를 불러오는데 실패했습니다.');
        } finally {
          setLoadingLibrary(false);
        }
      };
      fetchUserLibraryAndReviews();
    }, [isAuthenticated])
  );

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말로 로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => {
        dispatch(logout());
        router.replace('/(tabs)');
      }},
    ]);
  };

  const openBookListModal = (title: string, books: BookDto[]) => {
    setModalTitle(title);
    setModalBooks(books);
    setModalReviews([]);
    setIsReviewModal(false);
    setModalVisible(true);
  };

  const openReviewListModal = (title: string, reviews: Review[]) => {
    setModalTitle(title);
    setModalReviews(reviews);
    setModalBooks([]);
    setIsReviewModal(true);
    setModalVisible(true);
  };

  const renderBookItem = ({ item }: { item: BookDto }) => (
    <Link href={`/book/${item.isbn13}`} asChild>
      <TouchableOpacity style={styles.bookItemContainer} onPress={() => setModalVisible(false)}>
        <Image source={{ uri: item.thumbnail }} style={styles.bookThumbnail} />
        <View style={styles.bookThumbnailOverlay} />
        <View style={styles.bookInfoContainer}>
          <ThemedText style={styles.bookTitle} numberOfLines={2}>{item.title}</ThemedText>
          <ThemedText style={styles.bookAuthor} numberOfLines={1}>{Array.isArray(item.authors) ? item.authors.join(', ') : item.authors}</ThemedText>
        </View>
      </TouchableOpacity>
    </Link>
  );

  const renderReviewItem = ({ item }: { item: Review }) => (
    <TouchableOpacity style={styles.reviewItemContainer} onPress={() => { setModalVisible(false); router.push(`/book/${item.book.isbn13}`); }}>
      <Image source={{ uri: item.book.thumbnail }} style={styles.reviewBookThumbnail} />
      <View style={styles.reviewBookThumbnailOverlay} />
      <View style={styles.reviewInfoContainer}>
        <ThemedText style={styles.reviewItemTitle}>{item.book.title}</ThemedText>
        <ThemedText style={styles.reviewItemRating}>{'★'.repeat(item.rating)}</ThemedText>
        <ThemedText style={styles.reviewItemComment}>{item.comment}</ThemedText>
      </View>
    </TouchableOpacity>
  );

  return (
    
    <ScrollView style={styles.container}>
      <ThemedText style={styles.headerTitle}>내 서재</ThemedText>
      {isAuthenticated && user ? (
        <ThemedView style={styles.profileSection}>
          <ThemedText style={styles.greeting}>안녕하세요, {user.nickname}님!</ThemedText>
          <ThemedText style={styles.email}>{user.email}</ThemedText>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <ThemedText style={styles.logoutButtonText}>로그아웃</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      ) : (
        <ThemedView style={styles.loginPrompt}>
          <ThemedText style={styles.loginPromptText}>로그인이 필요합니다.</ThemedText>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/auth/login')}>
            <ThemedText style={styles.loginButtonText}>로그인 하러 가기</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}

      {isAuthenticated && (
        <>
          <ThemedView style={styles.summaryContainer}>
            <TouchableOpacity style={styles.summaryItem} onPress={() => openBookListModal('읽고 싶은 책', userLibrary.toReadBooks)}>
              <Book size={22} color={colors.primary} />
              <ThemedText style={styles.summaryCount}>{userLibrary.toReadBooks.length}</ThemedText>
              <ThemedText style={styles.summaryLabel}>읽고 싶은 책</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.summaryItem} onPress={() => openBookListModal('읽는 중인 책', userLibrary.readingBooks)}>
              <BookOpen size={22} color={colors.primary} />
              <ThemedText style={styles.summaryCount}>{userLibrary.readingBooks.length}</ThemedText>
              <ThemedText style={styles.summaryLabel}>읽는 중인 책</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.summaryItem} onPress={() => openBookListModal('완독한 책', userLibrary.completedBooks)}>
              <CheckCircle size={22} color={colors.primary} />
              <ThemedText style={styles.summaryCount}>{userLibrary.completedBooks.length}</ThemedText>
              <ThemedText style={styles.summaryLabel}>완독한 책</ThemedText>
            </TouchableOpacity>
          </ThemedView>

          <TouchableOpacity style={styles.myReviewsSummaryCard} onPress={() => openReviewListModal('내가 쓴 리뷰', myReviews)}>
            <Pencil size={22} color={colors.primary} />
            <ThemedText style={styles.myReviewsSummaryCount}>{myReviews.length}</ThemedText>
            <ThemedText style={styles.myReviewsSummaryLabel}>내가 쓴 리뷰</ThemedText>
          </TouchableOpacity>

          <ThemedView style={styles.recentReviewsSection}>
            <ThemedText style={styles.recentReviewsTitle}>나의 최근 리뷰</ThemedText>
            {myReviews.length === 0 ? (
              <ThemedText style={styles.emptySectionText}>아직 작성한 리뷰가 없습니다.</ThemedText>
            ) : (
              <FlatList
                data={myReviews.slice(0, 3)}
                renderItem={renderReviewItem}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                contentContainerStyle={styles.recentReviewsListContent}
              />
            )}
          </ThemedView>
        </>
      )}

      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>{modalTitle}</ThemedText>
            {loadingLibrary ? (
              <ThemedText style={styles.loadingText}>불러오는 중...</ThemedText>
            ) : errorLibrary ? (
              <ThemedText style={styles.errorText}>{errorLibrary}</ThemedText>
            ) : isReviewModal ? (
              modalReviews.length === 0 ? (
                <ThemedText style={styles.emptySectionText}>작성한 리뷰가 없습니다.</ThemedText>
              ) : (
                <FlatList data={modalReviews} renderItem={renderReviewItem} keyExtractor={(item) => item.id.toString()} contentContainerStyle={styles.modalReviewListContent} />
              )
            ) : (
              modalBooks.length === 0 ? (
                <ThemedText style={styles.emptySectionText}>등록된 책이 없습니다.</ThemedText>
              ) : (
                <FlatList data={modalBooks} renderItem={renderBookItem} keyExtractor={(item) => item.id.toString()} contentContainerStyle={styles.modalBookListContent} numColumns={2} />
              )
            )}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setModalVisible(false)}>
              <ThemedText style={styles.modalCloseButtonText}>닫기</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </View>
      </Modal>
    </ScrollView>
  );
}
