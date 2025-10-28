import React, { useEffect, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import customAlert from '../../src/utils/alert';
import { bookApi } from '../../src/services/api';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/src/store';
import {
  fetchReviewsForBook,
  addReviewForBook,
  toggleLikeForReview,
} from '@/src/store/reviewSlice';
import { Review } from '@/src/types/review';
import styles from '../../src/styles/BookDetailScreen.styles';

// Type definition for book details from API
type BookDetail = {
  id: number;
  title?: string;
  authors?: string;
  publisher?: string;
  thumbnail?: string;
  contents?: string;
  isbn13: string; // Change from 'isbn' to 'isbn13'
  groupTitle?: string;
};

export default function BookDetailScreen() {
  const { isbn } = useLocalSearchParams<{ isbn?: string }>();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // Global state
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const { reviews, loading: reviewsLoading } = useSelector((state: RootState) => state.reviews);

  // Local state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<BookDetail | null>(null);
  const [otherEditions, setOtherEditions] = useState<BookDetail[]>([]);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(0);
  const [sort, setSort] = useState('latest'); // 'latest' or 'likes'

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
    fetchBookDetailsAndEditions(normalizedIsbn); // Pass normalizedIsbn to the fetch function
  }, [normalizedIsbn]);

  useEffect(() => {
    if (book?.id) {
      dispatch(fetchReviewsForBook({ bookId: book.id, sort }));
    }
  }, [book, dispatch, sort]);

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

    const result = await dispatch(
      addReviewForBook({ bookId: book.id, comment: newReviewComment, rating: newReviewRating })
    );

    if (addReviewForBook.fulfilled.match(result)) {
      customAlert('성공', '리뷰가 등록되었습니다.');
      setNewReviewComment('');
      setNewReviewRating(0);
      dispatch(fetchReviewsForBook({ bookId: book.id, sort })); // Refetch reviews
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

  const userHasReviewed = useMemo(() => {
    if (!isAuthenticated || !user) return false;
    return reviews.some((review) => review.authorId === user.id);
  }, [reviews, user, isAuthenticated]);

  const renderStar = (onPress: (star: number) => void, currentRating: number) => (
    <View style={styles.ratingContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onPress(star)}>
          <Text style={currentRating >= star ? styles.starFilled : styles.starEmpty}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator /></View>;
  }
  if (error) {
    return <View style={styles.centered}><Text>{error}</Text></View>;
  }

  return (
    <>
      <Stack.Screen options={{ title: book?.title || '책 상세' }} />
      <FlatList
  ListHeaderComponent={
    <>
      {/* 책 정보 섹션 */}
      <View style={styles.coverWrap}>
        {book?.thumbnail ? (
          <Image source={{ uri: book.thumbnail }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]} />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{book?.title}</Text>
        <Text style={styles.meta}>{book?.authors}</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>소개</Text>
          <Text style={styles.description}>{book?.contents || '소개 정보가 없습니다.'}</Text>
        </View>
      </View>

      {/* 리뷰 타이틀 + 정렬 버튼 같은 줄 배치 */}
      <View style={styles.reviewHeaderRow}>
        <Text style={styles.reviewSectionTitle}>리뷰</Text>
        <View style={styles.sortContainer}>
          <TouchableOpacity
            onPress={() => setSort('latest')}
            style={[styles.sortButton, sort === 'latest' && styles.sortButtonActive]}
          >
            <Text style={[styles.sortButtonText, sort === 'latest' && styles.sortButtonTextActive]}>
              최신순
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSort('likes')}
            style={[styles.sortButton, sort === 'likes' && styles.sortButtonActive]}
          >
            <Text style={[styles.sortButtonText, sort === 'likes' && styles.sortButtonTextActive]}>
              좋아요순
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 리뷰가 없을 때 표시 */}
      {!reviewsLoading && reviews.length === 0 && (
        <Text style={styles.noReviews}>아직 작성된 리뷰가 없어요 😢{'\n'}첫 번째 리뷰의 주인공이 되어보시는건 어떨까요?</Text>
      )}
    </>
  }
  data={reviews}
  keyExtractor={(item) => item.id.toString()}
  renderItem={({ item }: { item: Review }) => (
    <View style={styles.reviewItem}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewAuthor}>{item.author}</Text>
        <Text style={styles.reviewRating}>{'★'.repeat(item.rating)}</Text>
      </View>
      <Text style={styles.reviewCommentText}>{item.comment}</Text>
      <View style={styles.reviewFooter}>
        <Text style={styles.reviewDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        <TouchableOpacity style={styles.likeButton} onPress={() => handleLikePress(item.id)}>
          <Text style={[styles.likeText, item.isLikedByCurrentUser && styles.likeTextLiked]}>
            👍 도움이 돼요 {item.likeCount > 0 && item.likeCount}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )}
  ListFooterComponent={
    <View style={styles.reviewInputContainer}>
      {isAuthenticated && !userHasReviewed ? (
        <>
          <TextInput
            style={styles.reviewInput}
            placeholder="리뷰를 남겨주세요..."
            value={newReviewComment}
            onChangeText={setNewReviewComment}
            multiline
          />
          {renderStar(setNewReviewRating, newReviewRating)}
          <TouchableOpacity style={styles.submitButton} onPress={handleReviewSubmit}>
            <Text style={styles.submitButtonText}>등록</Text>
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

    </>
  );
}

