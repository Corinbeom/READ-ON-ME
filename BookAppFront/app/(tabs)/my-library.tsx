
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert, FlatList, Image, ScrollView, Modal } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/src/store';
import { logout } from '@/src/store/authSlice';
import { Link, router, useFocusEffect } from 'expo-router';
import { bookApi, reviewApi } from '../../src/services/api';
import { BookDto } from '../../src/types/BookDto';
import { Review } from '../../src/types/review';
import { getMyLibraryScreenStyles } from '../../src/styles/MyLibraryScreen.styles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { markAllNotificationsAsRead, markNotificationAsRead } from '@/src/store/notificationSlice';

interface UserLibraryResponse {
  toReadBooks: BookDto[];
  readingBooks: BookDto[];
  completedBooks: BookDto[];
}

export default function MyLibraryScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { items: notifications, unreadCount } = useSelector((state: RootState) => state.notifications);

  const [userLibrary, setUserLibrary] = useState<UserLibraryResponse>({ toReadBooks: [], readingBooks: [], completedBooks: [] });
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [errorLibrary, setErrorLibrary] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalBooks, setModalBooks] = useState<BookDto[]>([]);
  const [modalReviews, setModalReviews] = useState<Review[]>([]);
  const [isReviewModal, setIsReviewModal] = useState(false);

  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getMyLibraryScreenStyles(colorScheme);
  const limitedNotifications = notifications.slice(0, 3);
  const hasUnreadNotifications = unreadCount > 0;

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

  const handleNotificationPress = (notificationId: number) => {
    dispatch(markNotificationAsRead(notificationId));
  };

  const handleMarkAllNotifications = () => {
    if (!hasUnreadNotifications) return;
    dispatch(markAllNotificationsAsRead());
  };

  const renderBookItem = ({ item }: { item: BookDto }) => (
    <Link href={`/book/${item.isbn13}`} asChild>
      <TouchableOpacity style={styles.bookItemContainer} onPress={() => setModalVisible(false)}>
        <Image source={{ uri: item.thumbnail }} style={styles.bookThumbnail} resizeMode="cover" />
        <View style={styles.bookInfoContainer}>
          <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>
            {Array.isArray(item.authors) ? item.authors.join(', ') : item.authors}
          </Text>
        </View>
      </TouchableOpacity>
    </Link>
  );

  const renderReviewItem = ({ item }: { item: Review }) => (
    <TouchableOpacity
      style={styles.reviewItemContainer}
      onPress={() => { setModalVisible(false); router.push(`/book/${item.book.isbn13}`); }}
    >
      <Image source={{ uri: item.book.thumbnail }} style={styles.reviewBookThumbnail} resizeMode="cover" />
      <View style={styles.reviewInfoContainer}>
        <Text style={styles.reviewItemTitle}>{item.book.title}</Text>
        <Text style={styles.reviewItemRating}>{'★'.repeat(item.rating)}</Text>
        <Text style={styles.reviewItemComment} numberOfLines={3} ellipsizeMode="tail">
          {item.comment}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const statItems = [
    { label: '읽고 싶어요', count: userLibrary.toReadBooks.length, books: userLibrary.toReadBooks },
    { label: '읽는 중', count: userLibrary.readingBooks.length, books: userLibrary.readingBooks },
    { label: '완독', count: userLibrary.completedBooks.length, books: userLibrary.completedBooks },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Masthead ── */}
      <View style={styles.masthead}>
        <Text style={styles.headerTitle}>서재.</Text>
        {isAuthenticated && (
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>로그아웃</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Profile Bar / Login Prompt ── */}
      {isAuthenticated && user ? (
        <View style={styles.profileBar}>
          <Text style={styles.profileBarText}>{user.nickname}</Text>
          <Text style={styles.profileBarText}>{user.email}</Text>
        </View>
      ) : (
        <>
          <View style={styles.profileBar}>
            <Text style={styles.profileBarText}>Read On Me</Text>
          </View>
          <View style={styles.loginSection}>
            <Text style={styles.loginPromptText}>로그인하여 내 서재를 관리하세요.</Text>
            <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/auth/login')}>
              <Text style={styles.loginButtonText}>로그인</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {isAuthenticated && (
        <>
          {/* ── Stats Row ── */}
          <View style={styles.statsRow}>
            {statItems.map((item, index) => (
              <React.Fragment key={item.label}>
                {index > 0 && <View style={styles.statDivider} />}
                <TouchableOpacity
                  style={styles.statItem}
                  onPress={() => openBookListModal(item.label, item.books)}
                >
                  <Text style={styles.statCount}>{item.count}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>

          {/* ── Reviews Summary ── */}
          <TouchableOpacity
            style={styles.reviewsSummaryRow}
            onPress={() => openReviewListModal('내가 쓴 리뷰', myReviews)}
          >
            <View style={styles.reviewsSummaryLeft}>
              <Text style={styles.reviewsSummaryCount}>{myReviews.length}</Text>
              <Text style={styles.reviewsSummaryLabel}>내가 쓴 리뷰</Text>
            </View>
            <Text style={styles.reviewsSummaryArrow}>전체 보기 →</Text>
          </TouchableOpacity>

          {/* ── Notifications ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>최근 알림</Text>
            <View style={styles.notificationHeaderActions}>
              {unreadCount > 0 && (
                <Text style={styles.notificationBadge}>{unreadCount}개 새 알림</Text>
              )}
              {hasUnreadNotifications && (
                <TouchableOpacity onPress={handleMarkAllNotifications}>
                  <Text style={styles.notificationMarkAll}>모두 읽음</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.sectionDividerTop} />

          {notifications.length === 0 ? (
            <Text style={styles.emptySectionText}>아직 받은 알림이 없습니다.</Text>
          ) : (
            limitedNotifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                {index > 0 && <View style={styles.sectionDivider} />}
                <TouchableOpacity
                  style={[styles.notificationItem, !notification.read && styles.notificationUnreadItem]}
                  onPress={() => handleNotificationPress(notification.id)}
                >
                  {!notification.read && <View style={styles.notificationUnreadDot} />}
                  <View style={styles.notificationCopy}>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <Text style={styles.notificationMeta}>
                      {new Date(notification.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            ))
          )}

          {/* ── Recent Reviews ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>나의 최근 리뷰</Text>
          </View>
          <View style={styles.sectionDividerTop} />

          {myReviews.length === 0 ? (
            <Text style={styles.emptySectionText}>아직 작성한 리뷰가 없습니다.</Text>
          ) : (
            myReviews.slice(0, 3).map((review, index) => (
              <React.Fragment key={review.id}>
                {index > 0 && <View style={styles.sectionDivider} />}
                {renderReviewItem({ item: review })}
              </React.Fragment>
            ))
          )}
        </>
      )}

      <View style={{ height: 40 }} />

      {/* ── Modal ── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCloseButtonText}>닫기</Text>
              </TouchableOpacity>
            </View>

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
                  ItemSeparatorComponent={() => <View style={styles.sectionDivider} />}
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
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
