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
import { Colors } from '@/constants/Colors';

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
      <TouchableOpacity style={styles.bookItemContainer} onPress={() => setModalVisible(false)}> {/* Close modal on book click */}
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
              <Text style={styles.summaryCount}>{userLibrary.toReadBooks.length}</Text>
              <Text style={styles.summaryLabel}>읽고 싶은 책</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.summaryItem} onPress={() => openBookListModal('읽는 중인 책', userLibrary.readingBooks)}>
              <Text style={styles.summaryCount}>{userLibrary.readingBooks.length}</Text>
              <Text style={styles.summaryLabel}>읽는 중인 책</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.summaryItem} onPress={() => openBookListModal('완독한 책', userLibrary.completedBooks)}>
              <Text style={styles.summaryCount}>{userLibrary.completedBooks.length}</Text>
              <Text style={styles.summaryLabel}>완독한 책</Text>
            </TouchableOpacity>
          </View>

          {/* New summary card for My Reviews */}
          <TouchableOpacity style={styles.myReviewsSummaryCard} onPress={() => openReviewListModal('내가 쓴 리뷰', myReviews)}>
            <Text style={styles.myReviewsSummaryCount}>{myReviews.length}</Text>
            <Text style={styles.myReviewsSummaryLabel}>내가 쓴 리뷰</Text>
          </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.text,
    marginBottom: 30,
    marginTop: 40,
  },
  profileSection: {
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.lightGray,
  },
  greeting: {
    fontSize: 22,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.text,
  },
  email: {
    fontSize: 16,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
    marginTop: 8,
    marginBottom: 24,
  },
  logoutButton: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
  },
  loginPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginPromptText: {
    fontSize: 18,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
  },
  // New styles for summary view
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    paddingVertical: 15,
    marginHorizontal: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.lightGray,
  },
  summaryItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  summaryCount: {
    fontSize: 24,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.primary,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
    marginTop: 5,
  },
  // New styles for My Reviews summary card
  myReviewsSummaryCard: {
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    paddingVertical: 15,
    marginHorizontal: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myReviewsSummaryCount: {
    fontSize: 24,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.primary,
  },
  myReviewsSummaryLabel: {
    fontSize: 14,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
    marginTop: 5,
  },
  // Styles for modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: Colors.light.lightGray,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalBookListContent: {
    paddingVertical: 10,
    // gap: 10, // FlatList gap prop is not directly supported in older RN versions, use margin
  },
  modalReviewListContent: { // New style for review list in modal
    paddingVertical: 10,
  },
  modalCloseButton: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
  },
  // Existing book item styles (used in modal as well)
  bookItemContainer: {
    width: '48%', // Adjust for 2 columns with some margin
    margin: '1%', // Small margin for spacing between columns
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.light.lightGray,
  },
  bookThumbnail: {
    width: 100,
    height: 150,
    borderRadius: 8,
    backgroundColor: Colors.light.lightGray,
    marginBottom: 8,
  },
  bookThumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 250, 240, 0.05)',
    borderRadius: 8,
  },
  bookInfoContainer: {
    alignItems: 'center',
  },
  bookTitle: {
    fontSize: 13,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.text,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 11,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
    textAlign: 'center',
  },
  // New styles for review item in modal
  reviewItemContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.light.card,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.lightGray,
    alignItems: 'center',
  },
  reviewBookThumbnail: {
    width: 60,
    height: 90,
    borderRadius: 5,
    backgroundColor: Colors.light.lightGray,
    marginRight: 10,
  },
  reviewBookThumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 250, 240, 0.05)',
    borderRadius: 5,
  },
  reviewInfoContainer: {
    flex: 1,
  },
  reviewItemTitle: {
    fontSize: 15,
    fontFamily: 'Pretendard-SemiBold',
    color: Colors.light.text,
    marginBottom: 2,
  },
  reviewItemRating: {
    fontSize: 12,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.accent,
    marginBottom: 5,
  },
  reviewItemComment: {
    fontSize: 12,
    fontFamily: 'NotoSerifKR-Regular',
    color: Colors.light.darkGray,
    lineHeight: 16,
  },
  loadingText: {
    textAlign: 'center',
    color: Colors.light.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
    marginTop: 10,
  },
  errorText: {
    textAlign: 'center',
    color: 'red',
    fontFamily: 'NotoSerifKR-Regular',
    marginTop: 10,
  },
  emptySectionText: {
    textAlign: 'center',
    color: Colors.light.darkGray,
    fontFamily: 'NotoSerifKR-Regular',
    marginTop: 10,
  },
});