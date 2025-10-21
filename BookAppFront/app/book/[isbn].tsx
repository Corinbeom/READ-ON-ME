import React, { useEffect, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import axios, { AxiosError } from 'axios';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import customAlert from '../../src/utils/alert';
import { bookApi, reviewApi } from '../../src/services/api';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';

// Type definitions
type BookDetail = {
  id: number;
  title?: string;
  authors?: string[];
  publisher?: string;
  thumbnail?: string;
  contents?: string;
  isbn10?: string;
  isbn13?: string;
};

type Review = {
  id: number;
  comment: string; // Changed from content to comment
  rating: number;
  author: string;
  createdAt: string;
};

export default function BookDetailScreen() {
  const { isbn } = useLocalSearchParams<{ isbn?: string }>();
  const { isAuthenticated, token, user } = useSelector((state: RootState) => state.auth);

  // States for book details
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<BookDetail | null>(null);

  // States for reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewComment, setReviewComment] = useState('');
  const [rating, setRating] = useState(0);

  // States for editing a review
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const [editingComment, setEditingComment] = useState('');
  const [editingRating, setEditingRating] = useState(0);

  const normalizedIsbn = useMemo(() => {
    const raw = String(isbn ?? '');
    const digits = raw.replace(/[^0-9]/g, '');
    return digits.length >= 13 ? digits.slice(-13) : '';
  }, [isbn]);

  // Fetch book details and reviews
  useEffect(() => {
    if (!normalizedIsbn) {
      setError('유효하지 않은 ISBN입니다.');
      setLoading(false);
      return;
    }
    fetchBookAndReviews();
  }, [normalizedIsbn]);

  const fetchBookAndReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bookApi.getBookDetail(normalizedIsbn);
      const body: BookDetail = res.data;
      if (body) {
        setBook(body);
        fetchReviews(body.id);
      } else {
        throw new Error('책 정보를 찾을 수 없습니다.');
      }
    } catch (err: any) {
      setError(err?.message ?? '상세 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async (bookId: number) => {
    try {
      const res = await reviewApi.getReviewsByBook(bookId);
      if (res.data.success) {
        setReviews(res.data.data);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.log('리뷰 조회 실패(Axios Erro):', error.response?.data || error.message);
      } else {
        console.log('알 수 없는 오류:', error);
      }
    }
  };

  // Review handlers
  const handleReviewSubmit = async () => {
    console.log('handleReviewSubmit called');
    console.log('book:', book);
    console.log('token:', token);
    if (!book || !token) {
      console.log('Review submission aborted: book or token is missing.');
      customAlert('알림', '리뷰를 등록하려면 로그인하거나 책 정보를 불러와야 합니다.'); // More informative alert
      return;
    }
    console.log('reviewComment:', reviewComment);
    console.log('rating:', rating);
    if (!reviewComment.trim() || rating === 0) {
      console.log('Review submission aborted: comment or rating is missing.');
      customAlert('알림', '리뷰 내용과 별점을 모두 입력해주세요.');
      return;
    }
    try {
      console.log('Attempting to create review...');
      await reviewApi.createReview(book.id, { comment: reviewComment, rating }, token);
      console.log('Review created successfully.');
      customAlert('성공', '리뷰가 등록되었습니다.');
      setReviewComment('');
      setRating(0);
      fetchReviews(book.id);
    } catch (error) {
      console.error('Error creating review:', error);
      customAlert('오류', '리뷰 등록에 실패했습니다.');
    }
  };

  const handleDeleteReview = (reviewId: number) => {
    if (!token || !book) return;
    customAlert('삭제 확인', '정말로 이 리뷰를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await reviewApi.deleteReview(reviewId, token);
            customAlert('성공', '리뷰가 삭제되었습니다.');
            fetchReviews(book.id);
          } catch (error) {
            customAlert('오류', '리뷰 삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const handleUpdateReview = async (reviewId: number) => {
    if (!book || !token) return;
    try {
      await reviewApi.updateReview(reviewId, { comment: editingComment, rating: editingRating }, token);
      customAlert('성공', '리뷰가 수정되었습니다.');
      setEditingReviewId(null);
      fetchReviews(book.id);
    } catch (error) {
      customAlert('오류', '리뷰 수정에 실패했습니다.');
    }
  };

  const startEditing = (review: Review) => {
    setEditingReviewId(review.id);
    setEditingComment(review.comment);
    setEditingRating(review.rating);
  };

  // Memoized view properties
  const view = useMemo(() => {
    const displayTitle = book?.title || `ISBN ${normalizedIsbn}`;
    const authorsArray = book?.authors ? book.authors.split(',').map(author => author.trim()) : [];
    return { ...book, displayTitle, authors: authorsArray };
  }, [book, normalizedIsbn]);

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
      <Stack.Screen options={{
        title: '책 상세', // Explicitly set title
        headerBackTitle: '이전', // 
      }} />
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.coverWrap}>
              {view.thumbnail ? (
                <Image source={{ uri: view.thumbnail }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]} />
              )}
            </View>
            <View style={styles.card}>
              <Text style={styles.title}>{view.displayTitle}</Text>
              {(view.authors?.length || view.publisher) && (
                <View style={styles.metaRow}>
                  {view.authors?.length ? <Text style={styles.meta}>{view.authors.join(', ')}</Text> : null}
                  {view.authors?.length && view.publisher ? <Text style={styles.dot}> · </Text> : null}
                  {view.publisher ? <Text style={styles.meta}>{view.publisher}</Text> : null}
                </View>
              )}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>소개</Text>
                <Text style={styles.description}>{view.contents || '소개 정보가 없습니다.'}</Text>
              </View>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>리뷰</Text>
              {isAuthenticated ? (
                <View style={styles.reviewInputContainer}>
                  <TextInput
                    style={styles.reviewInput}
                    placeholder="리뷰를 남겨주세요..."
                    value={reviewComment}
                    onChangeText={setReviewComment}
                    multiline
                  />
                  {renderStar(setRating, rating)}
                  <TouchableOpacity style={styles.submitButton} onPress={handleReviewSubmit}>
                    <Text style={styles.submitButtonText}>등록</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.loginPrompt}>리뷰를 작성하려면 로그인이 필요합니다.</Text>
              )}
            </View>
          </>
        }
        data={reviews}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.reviewItem}>
            {editingReviewId === item.id ? (
              // Editing View
              <View>
                <TextInput
                  style={styles.reviewInput}
                  value={editingComment}
                  onChangeText={setEditingComment}
                  multiline
                />
                {renderStar(setEditingRating, editingRating)}
                <View style={styles.reviewActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => handleUpdateReview(item.id)}>
                    <Text style={styles.actionButtonText}>저장</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => setEditingReviewId(null)}>
                    <Text style={styles.actionButtonText}>취소</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Display View
              <>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewAuthor}>{item.author}</Text>
                  <Text style={styles.reviewRating}>{'★'.repeat(item.rating)}</Text>
                </View>
                <Text style={styles.reviewCommentText}>{item.comment}</Text>
                {user?.nickname === item.author && (
                  <View style={styles.reviewActions}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => startEditing(item)}>
                      <Text style={styles.actionButtonText}>수정</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleDeleteReview(item.id)}>
                      <Text style={[styles.actionButtonText, { color: 'red' }]}>삭제</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        )}
        ListEmptyComponent={!loading && <Text style={styles.noReviews}>아직 작성된 리뷰가 없습니다.</Text>}
        contentContainerStyle={styles.container}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  container: { backgroundColor: '#FAF8F3', paddingBottom: 24 },
  coverWrap: { width: '100%', backgroundColor: '#FAF8F3', alignItems: 'center', justifyContent: 'center', paddingVertical: 24, },
  cover: { width: 180, height: 260, borderRadius: 8 },
  coverPlaceholder: { backgroundColor: '#e9ecef' },
  card: {
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#212529', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  meta: { color: '#666' },
  dot: { color: '#adb5bd' },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#343a40', marginBottom: 6 },
  description: { lineHeight: 20, color: '#212529' },
  
  // Review Styles
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
  reviewActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 15 },
  actionButton: {},
  actionButtonText: { color: '#007AFF', fontWeight: '600' },
  noReviews: { textAlign: 'center', color: '#888', marginTop: 20, paddingBottom: 40 },
});
