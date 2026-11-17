import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, ScrollView, Modal, Animated, Easing } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { router } from 'expo-router';
import TabScreen, { TabHeader } from '@/components/TabScreen';
import LibraryShelf, { LibraryBookCard, LibraryDiscovery } from '@/components/LibraryShelf';
import AppButton from '@/components/ui/AppButton';
import ScreenState from '@/components/ui/ScreenState';
import BookListSkeleton from '@/components/ui/BookListSkeleton';
import { useLibraryOverview } from '@/hooks/useLibraryOverview';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { Typography } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { getMyLibraryScreenStyles } from '@/src/styles/MyLibraryScreen.styles';
import { secureImageUri } from '@/src/utils/imageUri';
import { libraryBookCount, type UserLibrary } from '@/src/utils/libraryOverview';
import customAlert from '@/src/utils/alert';
import type { AppDispatch, RootState } from '@/src/store';
import { logout } from '@/src/store/authSlice';
import { markAllNotificationsAsRead, markNotificationAsRead } from '@/src/store/notificationSlice';
import type { BookDto } from '@/src/types/BookDto';
import type { Review } from '@/src/types/review';

const emptyLibrary: UserLibrary = { toReadBooks: [], readingBooks: [], completedBooks: [] };

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
  const keywordAnimValues = useMemo(
    () => Array.from({ length: readingKeywords?.keywords.length ?? 0 }, () => new Animated.Value(0)),
    [readingKeywords]
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalBooks, setModalBooks] = useState<BookDto[]>([]);
  const [modalReviews, setModalReviews] = useState<Review[]>([]);
  const [isReviewModal, setIsReviewModal] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';
  const styles = getMyLibraryScreenStyles(colorScheme);
  const c = Colors[colorScheme];
  const limitedNotifications = notifications.slice(0, 3);
  const hasUnreadNotifications = unreadCount > 0;

  useEffect(() => {
    setModalVisible(false);
    setModalBooks([]);
    setModalReviews([]);
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!readingKeywords || !readingKeywords.keywords.length) return;
    keywordAnimValues.forEach((value) => value.setValue(0));
    const animation = Animated.stagger(90, keywordAnimValues.map((value) => Animated.timing(value, {
      toValue: 1, duration: 480, useNativeDriver: true, easing: Easing.out(Easing.cubic),
    })));
    animation.start();
    return () => animation.stop();
  }, [readingKeywords, keywordAnimValues]);

  const handleLogout = () => customAlert('로그아웃', '정말로 로그아웃 하시겠습니까?', [
    { text: '취소', style: 'cancel' },
    { text: '로그아웃', style: 'destructive', onPress: () => { dispatch(logout()); router.replace('/(tabs)'); } },
  ]);
  const openBookListModal = (title: string, books: BookDto[]) => {
    setModalTitle(title); setModalBooks(books); setModalReviews([]); setIsReviewModal(false); setModalVisible(true);
  };
  const openReviewListModal = () => {
    setModalTitle('내가 쓴 리뷰'); setModalReviews(myReviews); setModalBooks([]); setIsReviewModal(true); setModalVisible(true);
  };
  const handleNotificationPress = (id: number) => { dispatch(markNotificationAsRead(id)); };
  const handleMarkAllNotifications = () => { if (hasUnreadNotifications) dispatch(markAllNotificationsAsRead()); };
  const renderBookItem = ({ item }: { item: BookDto }) => (
    <View style={styles.bookItemContainer}><LibraryBookCard book={item} onPress={() => setModalVisible(false)} /></View>
  );
  const renderReviewItem = ({ item }: { item: Review }) => (
    <TouchableOpacity style={styles.reviewItemContainer} accessibilityRole="button"
      onPress={() => { setModalVisible(false); router.push(`/book/${item.book.isbn13}`); }}>
      <Image source={{ uri: secureImageUri(item.book.thumbnail) }} style={styles.reviewBookThumbnail} resizeMode="cover" />
      <View style={styles.reviewInfoContainer}>
        <Text style={styles.reviewItemTitle}>{item.book.title}</Text>
        <Text style={styles.reviewItemRating}>{'★'.repeat(item.rating)}</Text>
        <Text style={styles.reviewItemComment} numberOfLines={3}>{item.comment}</Text>
      </View>
    </TouchableOpacity>
  );
  const statItems = [
    { label: '읽는 중', count: userLibrary.readingBooks.length, books: userLibrary.readingBooks },
    { label: '읽고 싶어요', count: userLibrary.toReadBooks.length, books: userLibrary.toReadBooks },
    { label: '완독', count: userLibrary.completedBooks.length, books: userLibrary.completedBooks },
  ];
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
          <View style={styles.profileBar}>
            <Text style={styles.profileBarText}>{user.nickname}</Text>
            <Text style={[styles.profileBarText, styles.profileEmail]} numberOfLines={1}>{user.email}</Text>
          </View>
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
                        accessibilityLabel={`${item.label} ${item.count}권`} onPress={() => openBookListModal(item.label, item.books)}>
                        <Text style={styles.statCount}>{item.count}</Text>
                        <Text style={styles.statLabel}>{item.label}</Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
                <LibraryShelf title="읽는 중" books={userLibrary.readingBooks} onShowAll={() => openBookListModal('읽는 중', userLibrary.readingBooks)} />
                <LibraryShelf title="읽고 싶은 책" books={userLibrary.toReadBooks} onShowAll={() => openBookListModal('읽고 싶은 책', userLibrary.toReadBooks)} />
                <LibraryShelf title="완독한 책" books={userLibrary.completedBooks} onShowAll={() => openBookListModal('완독한 책', userLibrary.completedBooks)} />
                <LibraryDiscovery compact />
              </>
            ) : <LibraryDiscovery />}
          {/* ── Reading Keywords ── */}
          {readingKeywords && (readingKeywords.keywords.length > 0 || readingKeywords.analyzed > 0) && (
            <View style={{ paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: 28, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <Text style={{ ...Typography.section, color: c.text, flexShrink: 1, letterSpacing: -0.3 }}>
                  나의 독서 키워드
                </Text>
                {readingKeywords.analyzed > 0 && (
                  <Text style={{ ...Typography.caption, color: c.inkSoft, letterSpacing: 0.15, textTransform: 'uppercase' }}>
                    {readingKeywords.analyzed}권 분석
                  </Text>
                )}
              </View>
              <View style={{ height: 2, backgroundColor: c.text, marginBottom: 20 }} />
              {readingKeywords.keywords.length === 0 ? (
                <Text style={{ ...Typography.body, color: c.inkSoft, fontStyle: 'italic' }}>
                  독서 활동이 쌓이면 키워드가 생성돼요
                </Text>
              ) : (() => {
                  // 각 단어의 절대 위치·회전·크기 — 12개 이하에서 겹치지 않도록 설계
                  const POSITIONS = [
                    { left: '30%', top: 78,  rotate: '0deg'   , size: 28, color: c.text     }, // rank 1
                    { left: '55%', top: 10,  rotate: '13deg'  , size: 19, color: c.inkSoft  }, // rank 2
                    { left: '3%',  top: 22,  rotate: '-14deg' , size: 18, color: c.inkSoft  }, // rank 3
                    { left: '5%',  top: 118, rotate: '-9deg'  , size: 16, color: c.inkFaint }, // rank 4
                    { left: '60%', top: 115, rotate: '11deg'  , size: 15, color: c.inkFaint }, // rank 5
                    { left: '75%', top: 58,  rotate: '-13deg' , size: 13, color: c.inkFaint }, // rank 6
                    { left: '35%', top: 172, rotate: '6deg'   , size: 13, color: c.inkFaint }, // rank 7
                    { left: '2%',  top: 168, rotate: '-5deg'  , size: 12, color: c.inkFaint }, // rank 8
                    { left: '65%', top: 170, rotate: '9deg'   , size: 12, color: c.inkFaint }, // rank 9
                    { left: '73%', top: 8,   rotate: '-10deg' , size: 12, color: c.inkFaint }, // rank 10
                    { left: '22%', top: 4,   rotate: '4deg'   , size: 12, color: c.inkFaint }, // rank 11
                    { left: '42%', top: 198, rotate: '-4deg'  , size: 12, color: c.inkFaint }, // rank 12
                  ] as const;

                  return (
                    <View style={{ height: 220, marginTop: 4 }}>
                      {readingKeywords.keywords.map((item, index) => {
                        const pos  = POSITIONS[index];
                        const anim = keywordAnimValues[index];
                        if (!pos) return null;

                        const opacity = anim
                          ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
                          : 1;
                        const scale = anim
                          ? anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
                          : 1;

                        return (
                          <Animated.Text
                            key={item.tag}
                            style={{
                              position: 'absolute',
                              left: pos.left,
                              top: pos.top,
                              opacity,
                              transform: [{ scale }, { rotate: pos.rotate }],
                              fontSize: pos.size,
                              fontFamily: 'NotoSerifKR-Regular',
                              color: pos.color,
                              letterSpacing: index === 0 ? -0.5 : -0.2,
                            }}
                          >
                            {item.tag}
                          </Animated.Text>
                        );
                      })}
                    </View>
                  );
                })()
              }
            </View>
          )}


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
        <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom }]} role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel={modalTitle}>
              <View style={styles.modalTitleRow}>
                <Text accessibilityRole="header" style={styles.modalTitle}>{modalTitle}</Text>
                <AppButton title="닫기" variant="ghost" compact onPress={() => setModalVisible(false)} />
              </View>
              {isReviewModal ? modalReviews.length ? (
                <FlatList data={modalReviews} renderItem={renderReviewItem} keyExtractor={(item) => String(item.id)}
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
