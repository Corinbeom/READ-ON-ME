import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, Image, ScrollView, Modal } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/src/store';
import { logout } from '@/src/store/authSlice';
import { Link, router, useFocusEffect } from 'expo-router';
import { bookApi, reviewApi } from '../../src/services/api'; // Import reviewApi
import { ReadingStatus } from '../../src/types/readingStatus';
import { BookDto } from '../../src/types/BookDto'; // Corrected import for BookDto
import { Review } from '../../src/types/review'; // Import Review type
import { Book, BookOpen, CheckCircle, Pencil } from 'lucide-react-native'; // Import Lucide icons
import styles from '../../src/styles/MyLibraryScreen.styles';

interface UserLibraryResponse {
  toReadBooks: BookDto[];
  readingBooks: BookDto[];
  completedBooks: BookDto[];
}

export default function MyLibraryScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);

  const [userLibrary, setUserLibrary] = useState<UserLibraryResponse>({
    toReadBooks: [],
    readingBooks: [],
    completedBooks: [],
  });
  const [myReviews, setMyReviews] = useState<Review[]>([]); // New state for my reviews
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [errorLibrary, setErrorLibrary] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalBooks, setModalBooks] = useState<BookDto[]>([]);
  const [modalReviews, setModalReviews] = useState<Review[]>([]); // New state for modal reviews
  const [isReviewModal, setIsReviewModal] = useState(false); // To differentiate between book and review modal

  useFocusEffect(
    useCallback(() => {
      const fetchUserLibraryAndReviews = async () => { // Renamed function
        if (!isAuthenticated) {
          setUserLibrary({ toReadBooks: [], readingBooks: [], completedBooks: [] });
          setMyReviews([]); // Clear reviews on logout
          return;
        }
        setLoadingLibrary(true);
        try {
          const libraryResponse = await bookApi.getUserLibrary();
          setUserLibrary(libraryResponse.data);

          const reviewsResponse = await reviewApi.getMyReviews(); // Fetch user's reviews
          setMyReviews(reviewsResponse.data.data || []); // Corrected to use 'data' field
        } catch (error: any) {
          console.error('Failed to fetch user library or reviews:', error);
          setErrorLibrary(error.message || '내 서재 및 리뷰를 불러오는데 실패했습니다.');
        } finally {
          setLoadingLibrary(false);
        }
      };
      fetchUserLibraryAndReviews(); // Call the new function
    }, [isAuthenticated])
  );

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말로 로그아웃 하시겠습니까?', [
      {
        text: '취소',
        style: 'cancel',
      },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => {
          dispatch(logout());
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const openBookListModal = (title: string, books: BookDto[]) => {
    setModalTitle(title);
    setModalBooks(books);
    setModalReviews([]); // Clear reviews when opening book modal
    setIsReviewModal(false);
    setModalVisible(true);
  };

  const openReviewListModal = (title: string, reviews: Review[]) => {
    setModalTitle(title);
    setModalReviews(reviews);
    setModalBooks([]); // Clear books when opening review modal
    setIsReviewModal(true);
    setModalVisible(true);
  };

  const renderBookItem = ({ item }: { item: BookDto }) => (
    <Link href={`/book/${item.isbn13}`} asChild>
      <TouchableOpacity style={styles.bookItemContainer} onPress={() => setModalVisible(false)}> 
        <Image source={{ uri: item.thumbnail }} style={styles.bookThumbnail} />
        <View style={styles.bookThumbnailOverlay} />
        <View style={styles.bookInfoContainer}>
          <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>{item.authors}</Text>
        </View>
      </TouchableOpacity>
    </Link>
  );

  const renderReviewItem = ({ item }: { item: Review }) => (
    <TouchableOpacity
  style={styles.reviewItemContainer}
  onPress={() => {
    setModalVisible(false);
    router.push(`/book/${item.book.isbn13}`);
  }}
>
      <Image source={{ uri: item.book.thumbnail }} style={styles.reviewBookThumbnail} />
      <View style={styles.reviewBookThumbnailOverlay} />
      <View style={styles.reviewInfoContainer}>
        <Text style={styles.reviewItemTitle}>{item.book.title}</Text>
        <Text style={styles.reviewItemRating}>{'★'.repeat(item.rating)}</Text>
        <Text style={styles.reviewItemComment}>{item.comment}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>내 서재</Text>
      {isAuthenticated && user ? (
        <View style={styles.profileSection}>
          <Text style={styles.greeting}>안녕하세요, {user.nickname}님!</Text>
          <Text style={styles.email}>{user.email}</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.loginPrompt}>
          <Text style={styles.loginPromptText}>로그인이 필요합니다.</Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/auth/login')}>
            <Text style={styles.loginButtonText}>로그인 하러 가기</Text>
          </TouchableOpacity>
        </View>
      )}

      {isAuthenticated && (
        <>
          <View style={styles.summaryContainer}>
            <TouchableOpacity style={styles.summaryItem} onPress={() => openBookListModal('읽고 싶은 책', userLibrary.toReadBooks)}>
              <Book size={22} color={styles.summaryIcon.color} />
              <Text style={styles.summaryCount}>{userLibrary.toReadBooks.length}</Text>
              <Text style={styles.summaryLabel}>읽고 싶은 책</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.summaryItem} onPress={() => openBookListModal('읽는 중인 책', userLibrary.readingBooks)}>
              <BookOpen size={22} color={styles.summaryIcon.color} />
              <Text style={styles.summaryCount}>{userLibrary.readingBooks.length}</Text>
              <Text style={styles.summaryLabel}>읽는 중인 책</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.summaryItem} onPress={() => openBookListModal('완독한 책', userLibrary.completedBooks)}>
              <CheckCircle size={22} color={styles.summaryIcon.color} />
              <Text style={styles.summaryCount}>{userLibrary.completedBooks.length}</Text>
              <Text style={styles.summaryLabel}>완독한 책</Text>
            </TouchableOpacity>
          </View>

          {/* New summary card for My Reviews */}
          <TouchableOpacity style={styles.myReviewsSummaryCard} onPress={() => openReviewListModal('내가 쓴 리뷰', myReviews)}>
            <Pencil size={22} color={styles.myReviewsSummaryIcon.color} />
            <Text style={styles.myReviewsSummaryCount}>{myReviews.length}</Text>
            <Text style={styles.myReviewsSummaryLabel}>내가 쓴 리뷰</Text>
          </TouchableOpacity>

          {/* 나의 최근 리뷰 섹션 */}
          <View style={styles.recentReviewsSection}>
            <Text style={styles.recentReviewsTitle}>나의 최근 리뷰</Text>
            {myReviews.length === 0 ? (
              <Text style={styles.emptySectionText}>아직 작성한 리뷰가 없습니다.</Text>
            ) : (
              <FlatList
                data={myReviews.slice(0, 3)} // 최신 3개 리뷰만 표시
                renderItem={renderReviewItem}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false} // 이 섹션에서는 스크롤 비활성화
                contentContainerStyle={styles.recentReviewsListContent}
              />
            )}
          </View>
        </>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            {loadingLibrary ? (
              <Text style={styles.loadingText}>불러오는 중...</Text>
            ) : errorLibrary ? (
              <Text style={styles.errorText}>{errorLibrary}</Text>
            ) : isReviewModal ? (
              modalReviews.length === 0 ? (
                <Text style={styles.emptySectionText}>작성한 리뷰가 없습니다.</Text>
              ) : (
                <FlatList
                  data={modalReviews}
                  renderItem={renderReviewItem}
                  keyExtractor={(item) => item.id.toString()}
                  contentContainerStyle={styles.modalReviewListContent}
                />
              )
            ) : (
              modalBooks.length === 0 ? (
                <Text style={styles.emptySectionText}>등록된 책이 없습니다.</Text>
              ) : (
                <FlatList
                  data={modalBooks}
                  renderItem={renderBookItem}
                  keyExtractor={(item) => item.id.toString()}
                  contentContainerStyle={styles.modalBookListContent}
                  numColumns={2}
                />
              )
            )}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}