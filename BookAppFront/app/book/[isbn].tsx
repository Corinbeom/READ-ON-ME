

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  Alert,
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
import { ReadingStatus } from '@/src/types/readingStatus';
import { getBookDetailScreenStyles } from '../../src/styles/BookDetailScreen.styles';
import { BookDto } from '../../src/types/BookDto';
import { useColorScheme } from '@/hooks/useColorScheme';

const REVIEW_MAX_LENGTH = 500;

export default function BookDetailScreen() {
  const { isbn } = useLocalSearchParams<{ isbn?: string }>();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getBookDetailScreenStyles(colorScheme);

  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const { reviews, loading: reviewsLoading } = useSelector((state: RootState) => state.reviews);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<BookDto | null>(null);
  const [otherEditions, setOtherEditions] = useState<BookDto[]>([]);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(0);
  const [sort, setSort] = useState('latest');
  const [userBookStatus, setUserBookStatus] = useState<ReadingStatus | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const normalizedIsbn = useMemo(() => {
    const raw = String(isbn ?? '');
    return raw.replace(/[^0-9]/g, '').slice(-13);
  }, [isbn]);

  useEffect(() => {
    if (!normalizedIsbn) {
      setError('유효하지 않은 ISBN입니다.');
      setLoading(false);
      return;
    }
    fetchBookDetailsAndEditions(normalizedIsbn);
  }, [normalizedIsbn]);

  useEffect(() => {
    if (book?.id) {
      dispatch(fetchReviewsForBook({ bookId: book.id, sort }));
    }
  }, [book, dispatch, sort]);

  useEffect(() => {
    const fetchUserBookStatus = async () => {
      if (!isAuthenticated || !book?.id) return;
      try {
        const response = await bookApi.getUserLibrary();
        const foundStatus =
          response.data.toReadBooks.find((b: BookDto) => b.id === book.id)
            ? ReadingStatus.TO_READ
            : response.data.readingBooks.find((b: BookDto) => b.id === book.id)
            ? ReadingStatus.READING
            : response.data.completedBooks.find((b: BookDto) => b.id === book.id)
            ? ReadingStatus.COMPLETED
            : null;
        setUserBookStatus(foundStatus);
      } catch (error) {
        console.error('Failed to fetch user book status:', error);
      }
    };
    fetchUserBookStatus();
  }, [isAuthenticated, book]);

  const fetchBookDetailsAndEditions = async (currentIsbn: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await bookApi.getBookDetail(currentIsbn);
      if (res.data) {
        setBook(res.data);
        const editionRes = await bookApi.getBookEditions(currentIsbn);
        if (editionRes.data) {
          setOtherEditions(editionRes.data);
        }
      } else {
        throw new Error('책 정보를 찾을 수 없습니다.');
      }
    } catch (err: any) {
      setError(err?.message ?? '상세 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!book) return;
    if (!newReviewComment.trim() || newReviewRating === 0) {
      customAlert('알림', '리뷰 내용과 별점을 모두 입력해주세요.');
      return;
    }
    if (editingReviewId) {
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
      addReviewForBook({ bookId: book.id, comment: newReviewComment, rating: newReviewRating })
    );
    if (addReviewForBook.fulfilled.match(result)) {
      customAlert('성공', '리뷰가 등록되었습니다.');
      setNewReviewComment('');
      setNewReviewRating(0);
      dispatch(fetchReviewsForBook({ bookId: book.id, sort }));
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

  const handleUpdateBookStatus = async (status: ReadingStatus) => {
    if (!isAuthenticated || !book?.id) {
      customAlert('알림', '로그인이 필요합니다.');
      return;
    }
    try {
      await bookApi.updateBookStatus(book.id, status);
      setUserBookStatus(status);
    } catch (error) {
      console.error('Failed to update book status:', error);
      customAlert('오류', '책 상태 변경에 실패했습니다.');
    }
  };

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
    Alert.alert('리뷰 삭제', '정말로 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (!book) return;
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
    Alert.alert('리뷰 관리', '선택한 리뷰를 수정하거나 삭제할 수 있습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => handleDeleteReview(review.id) },
      { text: '수정', onPress: () => handleStartEditingReview(review) },
    ]);
  };

  const isEditingReview = editingReviewId !== null;
  const canWriteReview = isAuthenticated && (!userHasReviewed || isEditingReview);
  const submitButtonLabel = isEditingReview ? '수정 완료' : '등록';

  const statusOptions: { value: ReadingStatus; label: string }[] = [
    { value: ReadingStatus.TO_READ, label: '읽고 싶어요' },
    { value: ReadingStatus.READING, label: '읽는 중' },
    { value: ReadingStatus.COMPLETED, label: '완독' },
  ];

  const renderStar = (onPress: (star: number) => void, currentRating: number) => (
    <View style={styles.ratingWrapper}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onPress(star)} style={styles.ratingTouchArea}>
          <Text style={currentRating >= star ? styles.starFilled : styles.starEmpty}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={styles.meta.color} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.meta}>{error}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <Stack.Screen options={{ title: book?.title || '책 상세' }} />
      <FlatList
        ref={flatListRef}
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: styles.container.backgroundColor }}
        ListHeaderComponent={
          <>
            {/* ── Cover ── */}
            <View style={styles.coverSection}>
              {book?.thumbnail ? (
                <Image source={{ uri: book.thumbnail }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]} />
              )}
            </View>

            {/* ── Title / Meta ── */}
            <View style={styles.titleSection}>
              <Text style={styles.title}>{book?.title}</Text>
              <Text style={styles.meta}>{book?.authors}</Text>
            </View>

            {/* ── Description ── */}
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionLabel}>소개</Text>
              <Text style={styles.sectionMark}>§</Text>
              <Text
                style={styles.description}
                numberOfLines={isDescriptionExpanded ? undefined : 6}
                ellipsizeMode="tail"
              >
                {book?.contents || '소개 정보가 없습니다.'}
              </Text>
              {book?.contents && book.contents.length > 200 && (
                <TouchableOpacity
                  onPress={() => setIsDescriptionExpanded((prev) => !prev)}
                  style={styles.descriptionToggle}
                >
                  <Text style={styles.descriptionToggleText}>
                    {isDescriptionExpanded ? '접기' : '더보기'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Reading Status ── */}
            {isAuthenticated && (
              <View style={styles.statusSection}>
                <Text style={styles.statusLabel}>내 서재</Text>
                <View style={styles.segmentedControl}>
                  {statusOptions.map((option, index) => {
                    const isActive = userBookStatus === option.value;
                    return (
                      <React.Fragment key={option.value}>
                        {index > 0 && <View style={styles.segmentDivider} />}
                        <TouchableOpacity
                          style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
                          onPress={() => handleUpdateBookStatus(option.value)}
                        >
                          <Text style={[styles.segmentButtonText, isActive && styles.segmentButtonTextActive]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Reviews Header ── */}
            <View style={styles.reviewHeaderRow}>
              <Text style={styles.reviewSectionTitle}>리뷰</Text>
              <View style={styles.sortContainer}>
                <TouchableOpacity onPress={() => setSort('latest')}>
                  <Text style={[styles.sortButtonText, sort === 'latest' && styles.sortButtonTextActive]}>
                    최신순
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSort('likes')}>
                  <Text style={[styles.sortButtonText, sort === 'likes' && styles.sortButtonTextActive]}>
                    좋아요순
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.reviewDividerTop} />

            {!reviewsLoading && reviews.length === 0 && (
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
            <TouchableOpacity
              activeOpacity={0.95}
              disabled={!isOwnReview}
              onLongPress={() => handleReviewLongPress(item)}
              delayLongPress={250}
            >
              <View style={[styles.reviewItem, isOwnReview && styles.reviewItemOwn]}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewAuthor}>{item.author}</Text>
                  <Text style={styles.reviewRating}>{'★'.repeat(item.rating)}</Text>
                </View>
                <Text style={styles.reviewCommentText}>{item.comment}</Text>
                <View style={styles.reviewFooter}>
                  <Text style={styles.reviewDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                  <TouchableOpacity style={styles.likeButton} onPress={() => handleLikePress(item.id)}>
                    <Text style={[styles.likeText, item.isLikedByCurrentUser && styles.likeTextLiked]}>
                      도움이 돼요 {item.likeCount > 0 ? item.likeCount : ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={styles.reviewInputContainer}>
            {canWriteReview ? (
              <>
                {isEditingReview && (
                  <View style={styles.editingBanner}>
                    <Text style={styles.editingBannerText}>내 리뷰를 수정하는 중입니다</Text>
                    <TouchableOpacity style={styles.cancelEditButton} onPress={handleCancelEditing}>
                      <Text style={styles.cancelEditButtonText}>취소</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <ScrollView
                  style={styles.reviewInputScrollWrapper}
                  bounces={false}
                  nestedScrollEnabled
                >
                  <TextInput
                    style={styles.reviewInput}
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
                </ScrollView>
                <Text style={styles.reviewCharCount}>
                  {newReviewComment.length}/{REVIEW_MAX_LENGTH}
                </Text>
                {renderStar(setNewReviewRating, newReviewRating)}
                <TouchableOpacity style={styles.submitButton} onPress={handleReviewSubmit}>
                  <Text style={styles.submitButtonText}>{submitButtonLabel}</Text>
                </TouchableOpacity>
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
