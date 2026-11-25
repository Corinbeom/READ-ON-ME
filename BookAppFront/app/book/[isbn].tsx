import BookSourceLink from '@/components/BookSourceLink';
import { readBookAttribution } from '@/src/utils/bookAttribution';
import AppButton from '@/components/ui/AppButton';
import BookLibraryStatus, { GuestBookLibraryStatus, NewBookLibraryStatus } from '@/components/BookLibraryStatus';
import AppTextInput from '@/components/ui/AppTextInput';
import ScreenState from '@/components/ui/ScreenState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Spacing } from '@/src/styles/designTokens';
import BookCover from '@/components/BookCover';
import { getIsbn13 } from '@/src/utils/bookUtils';


import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import customAlert from '../../src/utils/alert';
import { bookApi, reviewApi } from '../../src/services/api';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/src/store';
import {
  fetchReviewsForBook,
  addReviewForBook,
  toggleLikeForReview,
} from '@/src/store/reviewSlice';
import { Review } from '@/src/types/review';
import { getBookDetailScreenStyles } from '../../src/styles/BookDetailScreen.styles';
import { BookDto } from '../../src/types/BookDto';
import { useColorScheme } from '@/hooks/useColorScheme';
import { rememberBookView } from '@/hooks/useRecentBooks';

import { createLatestBookRequest } from '@/src/utils/latestBookRequest';

const REVIEW_MAX_LENGTH = 500;

export default function BookDetailScreen() {
  const { isbn } = useLocalSearchParams<{ isbn?: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getBookDetailScreenStyles(colorScheme);

  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const { reviews: loadedReviews, submitting, list: reviewList } = useSelector((state: RootState) => state.reviews);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<(Omit<BookDto, 'id'> & { id: number | null }) | null>(null);
  const { description, source } = readBookAttribution(book?.contents);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(0);
  const [sort, setSort] = useState('latest');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const detailRequests = useRef(createLatestBookRequest());
  const flatListRef = useRef<FlatList>(null);

  const normalizedIsbn = useMemo(() => {
    const raw = String(isbn ?? '');
    return raw.replace(/[^0-9]/g, '').slice(-13);
  }, [isbn]);
  const activeIsbn = useRef(normalizedIsbn);
  activeIsbn.current = normalizedIsbn;
  const bookIsbn = book ? getIsbn13(book) : '';

  useFocusEffect(useCallback(() => {
    if (book && bookIsbn && bookIsbn === normalizedIsbn && !loading && !error) {
      void rememberBookView({ ...book, isbn13: bookIsbn });
    }
  }, [book, bookIsbn, normalizedIsbn, loading, error]));

  useEffect(() => {
    if (!normalizedIsbn) {
      setError('유효하지 않은 ISBN입니다.');
      setLoading(false);
      return;
    }
    void fetchBookDetails(normalizedIsbn);
    const requests = detailRequests.current;
    return () => requests.cancel();
  }, [normalizedIsbn]);

  const bookId = book?.id;
  const reloadReviews = useCallback(() => {
    if (bookId) void dispatch(fetchReviewsForBook({ bookId, sort }));
  }, [bookId, dispatch, sort]);
  useFocusEffect(reloadReviews);

  const fetchBookDetails = async (currentIsbn: string) => {
    const request = detailRequests.current.begin();
    setLoading(true);
    setError(null);
    try {
      const res = await bookApi.getBookDetail(currentIsbn, request.signal);
      if (!request.isCurrent()) return;
      if (res.data) {
        setBook(res.data);
      } else {
        throw new Error('책 정보를 찾을 수 없습니다.');
      }
    } catch (err: any) {
      if (!request.isCurrent()) return;
      setError(err?.message ?? '상세 정보를 불러오지 못했습니다.');
    } finally {
      if (request.isCurrent()) setLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!book) return;
    if (!newReviewComment.trim() || newReviewRating === 0) {
      customAlert('알림', '리뷰 내용과 별점을 모두 입력해주세요.');
      return;
    }
    if (editingReviewId && book.id) {
      try {
        await reviewApi.updateReview(editingReviewId, {
          comment: newReviewComment,
          rating: newReviewRating,
        });
        customAlert('성공', '리뷰가 수정되었습니다.');
        handleCancelEditing();
        dispatch(fetchReviewsForBook({ bookId: book.id, sort }));
      } catch (error: any) {
        console.error('Review update failed:', error);
        customAlert('오류', error?.response?.data?.message || '리뷰 수정에 실패했습니다.');
      }
      return;
    }
    const result = await dispatch(
      addReviewForBook({ bookId: book.id, isbn: bookIsbn, comment: newReviewComment, rating: newReviewRating })
    );
    if (addReviewForBook.fulfilled.match(result)) {
      customAlert('성공', '리뷰가 등록되었습니다.');
      setNewReviewComment('');
      setNewReviewRating(0);
      if (book.id) dispatch(fetchReviewsForBook({ bookId: book.id, sort }));
      else if (activeIsbn.current === bookIsbn) await fetchBookDetails(bookIsbn);
    } else {
      const errorPayload = result.payload as any;
      if (errorPayload?.code === 'REVIEW_ALREADY_EXISTS') {
        customAlert('오류', '이미 이 책에 대한 리뷰를 작성했습니다.');
      } else {
        customAlert('오류', errorPayload?.message || '리뷰 등록에 실패했습니다.');
      }
    }
  };

  const handleLikePress = (reviewId: number) => {
    if (!isAuthenticated) {
      customAlert('알림', '로그인이 필요합니다.');
      return;
    }
    dispatch(toggleLikeForReview(reviewId));
  };

  const reviews = useMemo(() => book?.id ? loadedReviews.filter(review => review.book.id === book.id) : [], [book?.id, loadedReviews]);

  const userHasReviewed = useMemo(() => {
    if (!isAuthenticated || !user) return false;
    return reviews.some((review) => review.authorId === user.id);
  }, [reviews, user, isAuthenticated]);

  const handleStartEditingReview = (review: Review) => {
    setEditingReviewId(review.id);
    setNewReviewComment(review.comment);
    setNewReviewRating(review.rating);
  };

  const handleCancelEditing = () => {
    setEditingReviewId(null);
    setNewReviewComment('');
    setNewReviewRating(0);
  };

  const handleDeleteReview = (reviewId: number) => {
    customAlert('리뷰 삭제', '정말로 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (!book?.id) return;
          try {
            await reviewApi.deleteReview(reviewId);
            customAlert('삭제 완료', '리뷰가 삭제되었습니다.');
            if (editingReviewId === reviewId) handleCancelEditing();
            dispatch(fetchReviewsForBook({ bookId: book.id, sort }));
          } catch (error: any) {
            console.error('Review delete failed:', error);
            customAlert('오류', error?.response?.data?.message || '리뷰 삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const handleReviewLongPress = (review: Review) => {
    if (!isAuthenticated || !user || review.authorId !== user.id) return;
    customAlert('리뷰 관리', '선택한 리뷰를 수정하거나 삭제할 수 있습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => handleDeleteReview(review.id) },
      { text: '수정', onPress: () => handleStartEditingReview(review) },
    ]);
  };

  const isEditingReview = editingReviewId !== null;
  const reviewStatus = book?.id
    ? reviewList?.bookId === book.id && reviewList.sort === sort ? reviewList.status : 'loading'
    : 'ready';
  const canWriteReview = isAuthenticated && (!userHasReviewed || isEditingReview);
  const submitButtonLabel = isEditingReview ? '수정 완료' : '등록';

  const renderStar = (onPress: (star: number) => void, currentRating: number) => (
    <View style={styles.ratingWrapper} role="radiogroup" accessibilityLabel="별점">
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onPress(star)} style={styles.ratingTouchArea} accessibilityRole="radio" accessibilityState={{ checked: currentRating === star }} accessibilityLabel={`${star}점`}>
          <Text style={currentRating >= star ? styles.starFilled : styles.starEmpty}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ScreenState loading title="책 정보를 불러오고 있어요" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centered}>
        <ScreenState title="책 정보를 불러오지 못했어요" description={error} action="다시 시도" onAction={() => { void fetchBookDetails(normalizedIsbn); }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <Stack.Screen options={{ title: book?.title || '책 상세' }} />
      <FlatList
        ref={flatListRef}
        contentContainerStyle={{ paddingBottom: Spacing.xl + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: styles.container.backgroundColor }}
        ListHeaderComponent={
          <>
            {/* ── Cover ── */}
            <View style={styles.coverSection}>
              <BookCover uri={book?.thumbnail} lookupIsbn={bookIsbn} style={styles.cover} />
            </View>

            {/* ── Title / Meta ── */}
            <View style={styles.titleSection}>
              <Text style={styles.title}>{book?.title}</Text>
              <Text style={styles.meta}>{book?.authors}</Text>
            </View>

            {isAuthenticated && user && book ? (book.id ? <BookLibraryStatus bookId={book.id} userId={user.id} />
              : <NewBookLibraryStatus key={bookIsbn} isbn={bookIsbn} userId={user.id} onSaved={id => setBook(current =>
                  current?.isbn13 === bookIsbn ? { ...current, id } : current)} />)
              : !isAuthenticated && bookIsbn ? <GuestBookLibraryStatus isbn={bookIsbn} /> : null}

            {/* ── Description ── */}
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionLabel}>소개</Text>
              <Text style={styles.sectionMark}>§</Text>
              <Text
                style={styles.description}
                numberOfLines={isDescriptionExpanded ? undefined : 6}
                ellipsizeMode="tail"
              >
                {description || '소개 정보가 없습니다.'}
              </Text>
              {source && <BookSourceLink source={source} />}
              {description.length > 200 && (
                <AppButton compact variant="ghost" title={isDescriptionExpanded ? '접기' : '더보기'}
                  style={{ alignSelf: 'flex-start' }} onPress={() => setIsDescriptionExpanded((prev) => !prev)} />
              )}
            </View>

            {/* ── Reviews Header ── */}
            <View style={styles.reviewHeaderRow}>
              <Text style={styles.reviewSectionTitle}>리뷰</Text>
              <View style={styles.sortContainer}>
                <AppButton compact title="최신순" variant={sort === 'latest' ? 'secondary' : 'ghost'} accessibilityState={{ selected: sort === 'latest' }} onPress={() => setSort('latest')} />
                <AppButton compact title="좋아요순" variant={sort === 'likes' ? 'secondary' : 'ghost'} accessibilityState={{ selected: sort === 'likes' }} onPress={() => setSort('likes')} />
              </View>
            </View>

            <View style={styles.reviewDividerTop} />

            {reviewStatus === 'failed' && book?.id ? (
              <ScreenState title="리뷰를 불러오지 못했어요" action="다시 시도"
                onAction={reloadReviews} />
            ) : null}
            {reviewStatus === 'ready' && reviews.length === 0 && (
              <Text style={styles.noReviews}>
                아직 작성된 리뷰가 없어요.{'\n'}첫 번째 리뷰를 남겨보세요.
              </Text>
            )}
          </>
        }
        data={reviews}
        keyExtractor={(item) => item.id.toString()}
        ItemSeparatorComponent={() => <View style={styles.reviewDivider} />}
        renderItem={({ item }: { item: Review }) => {
          const isOwnReview = user?.id === item.authorId;
          return (
            <View style={[styles.reviewItem, isOwnReview && styles.reviewItemOwn]}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewAuthor}>{item.author}</Text>
                  <Text style={styles.reviewRating}>{'★'.repeat(item.rating)}</Text>
                </View>
                <Text style={styles.reviewCommentText}>{item.comment}</Text>
                <View style={styles.reviewFooter}>
                  <Text style={styles.reviewDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                  <View style={styles.reviewActions}>
                    {isOwnReview ? <AppButton compact variant="ghost" title="리뷰 관리" onPress={() => handleReviewLongPress(item)} /> : null}
                    <AppButton compact variant={item.isLikedByCurrentUser ? 'secondary' : 'ghost'}
                      title={`도움이 돼요${item.likeCount > 0 ? ` ${item.likeCount}` : ''}`} onPress={() => handleLikePress(item.id)} />
                  </View>
                </View>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={styles.reviewInputContainer}>
            {canWriteReview ? (
              <>
                {isEditingReview && (
                  <View style={styles.editingBanner}>
                    <Text style={styles.editingBannerText}>내 리뷰를 수정하는 중입니다</Text>
                    <AppButton compact variant="ghost" title="취소" onPress={handleCancelEditing} />
                  </View>
                )}
                  <AppTextInput
                    style={styles.reviewInput}
                    accessibilityLabel="리뷰 내용"
                    placeholder={isEditingReview ? '리뷰를 수정해주세요...' : '리뷰를 남겨주세요...'}
                    placeholderTextColor={styles.meta.color}
                    value={newReviewComment}
                    onChangeText={setNewReviewComment}
                    multiline
                    maxLength={REVIEW_MAX_LENGTH}
                    onFocus={() => {
                      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 300);
                    }}
                  />
                <Text style={styles.reviewCharCount}>
                  {newReviewComment.length}/{REVIEW_MAX_LENGTH}
                </Text>
                {renderStar(setNewReviewRating, newReviewRating)}
                <AppButton title={submitButtonLabel} onPress={handleReviewSubmit} loading={submitting || reviewStatus === 'loading'} />
              </>
            ) : !isAuthenticated ? (
              <Text style={styles.loginPrompt}>리뷰를 작성하려면 로그인이 필요합니다.</Text>
            ) : (
              <Text style={styles.loginPrompt}>이미 이 책에 대한 리뷰를 작성하셨습니다.</Text>
            )}
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}
