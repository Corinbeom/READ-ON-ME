import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, ScrollView, Modal } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { router } from 'expo-router';
import TabScreen, { TabHeader } from '@/components/TabScreen';
import LibraryShelf, { LibraryBookCard, LibraryDiscovery } from '@/components/LibraryShelf';
import LibraryBookActions from '@/components/LibraryBookActions';
import AppButton from '@/components/ui/AppButton';
import LibraryReadingKeywords from '@/components/LibraryReadingKeywords';
import LibraryProfile from '@/components/LibraryProfile';
import ScreenState from '@/components/ui/ScreenState';
import BookListSkeleton from '@/components/ui/BookListSkeleton';
import { useLibraryOverview } from '@/hooks/useLibraryOverview';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getMyLibraryScreenStyles } from '@/src/styles/MyLibraryScreen.styles';
import { secureImageUri } from '@/src/utils/imageUri';
import { libraryBookCount, type UserLibrary } from '@/src/utils/libraryOverview';
import customAlert from '@/src/utils/alert';
import type { AppDispatch, RootState } from '@/src/store';
import { logout } from '@/src/store/authSlice';
import { markAllNotificationsAsRead, markNotificationAsRead } from '@/src/store/notificationSlice';
import type { BookDto } from '@/src/types/BookDto';
import type { Review } from '@/src/types/review';
import { ReadingStatus } from '@/src/types/readingStatus';
import { rememberShelfStatus } from '@/src/store/libraryStatusSlice';

const emptyLibrary: UserLibrary = { toReadBooks: [], readingBooks: [], completedBooks: [] };
type LibraryList = { title: string; status?: ReadingStatus };
type ManagedBook = { book: BookDto; userId: number };

export default function MyLibraryScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { items: notifications, unreadCount } = useSelector((state: RootState) => state.notifications);
  const overview = useLibraryOverview(isAuthenticated, user?.id);
  const userLibrary = overview.library ?? emptyLibrary;
  const myReviews = overview.reviews ?? [];
  const readingKeywords = overview.keywords;
  const hasBooks = libraryBookCount(userLibrary) > 0;
  const [list, setList] = useState<LibraryList | null>(null);
  const [managedBook, setManagedBook] = useState<ManagedBook | null>(null);
  const editing = managedBook && isAuthenticated && managedBook.userId === user?.id ? managedBook : null;
  const colorScheme = useColorScheme() ?? 'light';
  const styles = getMyLibraryScreenStyles(colorScheme);
  const limitedNotifications = notifications.slice(0, 3);
  const hasUnreadNotifications = unreadCount > 0;

  useEffect(() => {
    setList(null);
    setManagedBook(null);
  }, [isAuthenticated, user?.id]);

  const handleLogout = () => customAlert('로그아웃', '정말로 로그아웃 하시겠습니까?', [
    { text: '취소', style: 'cancel' },
    { text: '로그아웃', style: 'destructive', onPress: () => { dispatch(logout()); router.replace('/(tabs)'); } },
  ]);
  const openBookListModal = (title: string, status: ReadingStatus) => setList({ title, status });
  const openReviewListModal = () => setList({ title: '내가 쓴 리뷰' });
  const closeModal = () => { if (editing) setManagedBook(null); else setList(null); };
  const manage = (book: BookDto, status: ReadingStatus) => {
    if (!isAuthenticated || !user) return;
    dispatch(rememberShelfStatus({ bookId: book.id, userId: user.id, status }));
    setManagedBook({ book, userId: user.id });
  };
  const handleNotificationPress = (id: number) => { dispatch(markNotificationAsRead(id)); };
  const handleMarkAllNotifications = () => { if (hasUnreadNotifications) dispatch(markAllNotificationsAsRead()); };
  const renderBookItem = ({ item }: { item: BookDto }) => (
    <View style={styles.bookItemContainer}>
      <LibraryBookCard book={item} onPress={() => setList(null)}
        onManage={list?.status ? () => manage(item, list.status!) : undefined} />
    </View>
  );
  const renderReviewItem = ({ item }: { item: Review }) => (
    <TouchableOpacity style={styles.reviewItemContainer} accessibilityRole="button"
      onPress={() => { setList(null); router.push(`/book/${item.book.isbn13}`); }}>
      <Image source={{ uri: secureImageUri(item.book.thumbnail) }} style={styles.reviewBookThumbnail} resizeMode="cover" />
      <View style={styles.reviewInfoContainer}>
        <Text style={styles.reviewItemTitle}>{item.book.title}</Text>
        <Text style={styles.reviewItemRating}>{'★'.repeat(item.rating)}</Text>
        <Text style={styles.reviewItemComment} numberOfLines={3}>{item.comment}</Text>
      </View>
    </TouchableOpacity>
  );
  const statItems = [
    { label: '읽는 중', title: '읽는 중', status: ReadingStatus.READING, books: userLibrary.readingBooks },
    { label: '읽고 싶어요', title: '읽고 싶은 책', status: ReadingStatus.TO_READ, books: userLibrary.toReadBooks },
    { label: '완독', title: '완독한 책', status: ReadingStatus.COMPLETED, books: userLibrary.completedBooks },
  ];
  const modalBooks = statItems.find(item => item.status === list?.status)?.books ?? [];
  const modalTitle = editing ? '책 관리' : list?.title;
  const retryNotice = (message: string) => (
    <View style={styles.retryNotice}>
      <Text accessibilityRole="alert" style={styles.retryText}>{message}</Text>
      <AppButton title="다시 시도" compact variant="secondary" disabled={overview.refreshing} onPress={overview.reload} />
    </View>
  );

  return (
    <TabScreen testID="library-tab-screen">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TabHeader title="서재.">
          {isAuthenticated ? <AppButton title="로그아웃" variant="ghost" compact onPress={handleLogout} /> : null}
        </TabHeader>
        {isAuthenticated && user ? (
          <LibraryProfile key={user.id} user={user} />
        ) : <LibraryDiscovery guest />}

        {isAuthenticated && !overview.library ? overview.libraryError
          ? <ScreenState title="서재를 불러오지 못했어요" description="연결 상태를 확인하고 다시 시도해주세요."
            action="다시 시도" onAction={overview.reload} />
          : <BookListSkeleton layout="library" label="서재의 책을 불러오고 있어요" /> : null}

        {isAuthenticated && overview.library ? (
          <>
            {overview.libraryError ? retryNotice(overview.libraryError) : null}
            {hasBooks ? (
              <>
                <View style={styles.statsRow}>
                  {statItems.map((item, index) => (
                    <React.Fragment key={item.label}>
                      {index ? <View style={styles.statDivider} /> : null}
                      <TouchableOpacity style={styles.statItem} accessibilityRole="button"
                        accessibilityLabel={`${item.label} ${item.books.length}권`} onPress={() => openBookListModal(item.label, item.status)}>
                        <Text style={styles.statCount}>{item.books.length}</Text>
                        <Text style={styles.statLabel}>{item.label}</Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
                {statItems.map(item => (
                  <LibraryShelf key={item.status} title={item.title} books={item.books}
                    onShowAll={() => openBookListModal(item.title, item.status)} onManage={book => manage(book, item.status)} />
                ))}
                <LibraryDiscovery compact />
              </>
            ) : <LibraryDiscovery />}
            {readingKeywords ? <LibraryReadingKeywords key={user?.id} data={readingKeywords} library={userLibrary} /> : null}

            {overview.keywordsError ? retryNotice(overview.keywordsError) : null}
            {myReviews.length > 0 ? (
              <TouchableOpacity style={styles.reviewsSummaryRow} accessibilityRole="button" onPress={openReviewListModal}>
                <View style={styles.reviewsSummaryLeft}>
                  <Text style={styles.reviewsSummaryCount}>{myReviews.length}</Text>
                  <Text style={styles.reviewsSummaryLabel}>내가 쓴 리뷰</Text>
                </View>
                <Text style={styles.reviewsSummaryArrow}>전체 보기 →</Text>
              </TouchableOpacity>
            ) : null}
            {hasBooks || myReviews.length > 0 || overview.reviewsError ? (
              <>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>나의 최근 리뷰</Text></View>
            <View style={styles.sectionDividerTop} />
            {overview.reviewsError ? retryNotice(overview.reviewsError) : null}
            {overview.reviews === null ? !overview.reviewsError
              ? <Text style={styles.loadingText}>리뷰를 불러오고 있어요.</Text> : null
              : myReviews.length ? myReviews.slice(0, 3).map((review, index) => (
                <React.Fragment key={review.id}>
                  {index ? <View style={styles.sectionDivider} /> : null}
                  {renderReviewItem({ item: review })}
                </React.Fragment>
              )) : <Text style={styles.emptySectionText}>아직 작성한 리뷰가 없습니다.</Text>}
              </>
            ) : null}
            {notifications.length > 0 ? (
              <>
          {/* ── Notifications ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>최근 알림</Text>
            <View style={styles.notificationHeaderActions}>
              {unreadCount > 0 && (
                <Text style={styles.notificationBadge}>{unreadCount}개 새 알림</Text>
              )}
              {hasUnreadNotifications && (
                <AppButton title="모두 읽음" compact variant="ghost" onPress={handleMarkAllNotifications} />
              )}
            </View>
          </View>
          <View style={styles.sectionDividerTop} />

          {limitedNotifications.map((notification, index) => (
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
          ))}              </>
            ) : null}



          </>
        ) : null}
        <Modal animationType="slide" transparent visible={!!modalTitle} onRequestClose={closeModal}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom }]} role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel={modalTitle}>
              <View style={styles.modalTitleRow}>
                <Text accessibilityRole="header" style={styles.modalTitle}>{modalTitle}</Text>
                <AppButton title="닫기" variant="ghost" compact onPress={closeModal} />
              </View>
              {editing ? (
                <ScrollView>
                  <LibraryBookActions key={`${editing.userId}:${editing.book.id}`} book={editing.book} userId={editing.userId}
                    onSaved={() => setManagedBook(current => current === editing ? null : current)} />
                </ScrollView>
              ) : !list?.status ? myReviews.length ? (
                <FlatList data={myReviews} renderItem={renderReviewItem} keyExtractor={(item) => String(item.id)}
                  ItemSeparatorComponent={() => <View style={styles.sectionDivider} />} contentContainerStyle={styles.modalReviewListContent} />
              ) : <Text style={styles.emptySectionText}>작성한 리뷰가 없습니다.</Text>
                : modalBooks.length ? (
                  <FlatList data={modalBooks} renderItem={renderBookItem} keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.modalBookListContent} numColumns={2} />
                ) : <Text style={styles.emptySectionText}>등록된 책이 없습니다.</Text>}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </TabScreen>
  );
}
