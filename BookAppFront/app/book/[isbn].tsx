import React, { useEffect, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
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

// Type definition for book details from API
type BookDetail = {
  id: number;
  title?: string;
  authors?: string[];
  publisher?: string;
  thumbnail?: string;
  contents?: string;
  isbn: string; // isbn is used as a key, ensure it exists
};

export default function BookDetailScreen() {
  const { isbn } = useLocalSearchParams<{ isbn?: string }>();
  const dispatch = useDispatch<AppDispatch>();

  // Global state
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const { reviews, loading: reviewsLoading } = useSelector((state: RootState) => state.reviews);

  // Local state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<BookDetail | null>(null);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(0);

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
    fetchBookDetails();
  }, [normalizedIsbn]);

  useEffect(() => {
    if (book?.id) {
      dispatch(fetchReviewsForBook(book.id));
    }
  }, [book, dispatch]);

  const fetchBookDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bookApi.getBookDetail(normalizedIsbn);
      if (res.data) {
        setBook(res.data); // The response is the book object itself
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
      dispatch(fetchReviewsForBook(book.id)); // Refetch reviews
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
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>리뷰</Text>
              {isAuthenticated && !userHasReviewed && (
                <View style={styles.reviewInputContainer}>
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
                </View>
              )}
              {isAuthenticated && userHasReviewed && (
                <Text style={styles.loginPrompt}>이미 이 책에 대한 리뷰를 작성하셨습니다.</Text>
              )}
              {!isAuthenticated && (
                 <Text style={styles.loginPrompt}>리뷰를 작성하려면 로그인이 필요합니다.</Text>
              )}
            </View>
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
            {/* TODO: Add Edit/Delete buttons if authorId matches user.id */}
          </View>
        )}
        ListEmptyComponent={!reviewsLoading ? <Text style={styles.noReviews}>아직 작성된 리뷰가 없습니다.</Text> : null}
        contentContainerStyle={styles.container}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { backgroundColor: '#FAF8F3', paddingBottom: 24 },
  coverWrap: { alignItems: 'center', paddingVertical: 24 },
  cover: { width: 180, height: 260, borderRadius: 8 },
  coverPlaceholder: { backgroundColor: '#e9ecef' },
  card: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 3, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  meta: { color: '#666', marginBottom: 12 },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  description: { lineHeight: 20 },
  reviewSection: { paddingHorizontal: 16, marginTop: 8 },
  reviewSectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  reviewInputContainer: { marginBottom: 20, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  reviewInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, minHeight: 80, textAlignVertical: 'top' },
  ratingContainer: { flexDirection: 'row', marginVertical: 10, justifyContent: 'center' },
  starEmpty: { fontSize: 30, color: '#ccc', marginHorizontal: 5 },
  starFilled: { fontSize: 30, color: '#FFD700', marginHorizontal: 5 },
  submitButton: { backgroundColor: '#007AFF', padding: 12, borderRadius: 5, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontWeight: 'bold' },
  loginPrompt: { color: '#888', textAlign: 'center', marginVertical: 20 },
  reviewItem: { borderBottomWidth: 1, borderColor: '#eee', padding: 16, backgroundColor: '#fff' },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewAuthor: { fontWeight: 'bold' },
  reviewRating: { color: '#FFD700' },
  reviewCommentText: { marginTop: 8, lineHeight: 20 },
  reviewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  reviewDate: { color: '#888', fontSize: 12 },
  likeButton: {},
  likeText: { color: '#888' },
  likeTextLiked: { color: '#007AFF', fontWeight: 'bold' },
  noReviews: { textAlign: 'center', color: '#888', marginTop: 20, paddingBottom: 40 },
});