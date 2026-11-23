import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { reviewApi } from '../services/api';
import { Review } from '../types/review';

interface ReviewState {
  reviews: Review[];
  submitting: boolean;
  list?: { bookId: number; sort: string; requestId: string; status: 'loading' | 'ready' | 'failed' };
  error: any | null;
}

const initialState: ReviewState = {
  reviews: [],
  submitting: false,
  error: null,
};

// 책에 대한 리뷰들 가져오기
export const fetchReviewsForBook = createAsyncThunk(
  'reviews/fetchForBook',
  async ({ bookId, sort }: { bookId: number; sort: string }, { rejectWithValue }) => {
    try {
      const response = await reviewApi.getReviewsByBook(bookId, sort, { handleErrorLocally: true });
      return response.data.data.content; // ApiResponse<Slice<ReviewResponse>> -> content
    } catch (error: any) {
      return rejectWithValue(error.response?.data);
    }
  }
);

// 리뷰 추가
export const addReviewForBook = createAsyncThunk(
  'reviews/addForBook',
  async (
    { bookId, isbn, comment, rating }: { bookId: number | null; isbn: string; comment: string; rating: number },
    { rejectWithValue }
  ) => {
    try {
      const response = await (bookId == null ? reviewApi.createReviewByIsbn(isbn, { comment, rating }) : reviewApi.createReview(bookId, { comment, rating }));
      return response.data.data; // Returns reviewId, but we may need to refetch
    } catch (error: any) {
      return rejectWithValue(error.response?.data);
    }
  }
);

// 리뷰 좋아요 토글
export const toggleLikeForReview = createAsyncThunk(
  'reviews/toggleLike',
  async (reviewId: number, { getState, rejectWithValue }) => {
    try {
      await reviewApi.toggleReviewLike(reviewId);
      return reviewId;
    } catch (error: any) {
      return rejectWithValue({ reviewId, error: error.response?.data });
    }
  }
);

const reviewSlice = createSlice({
  name: 'reviews',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch reviews
      .addCase(fetchReviewsForBook.pending, (state, action) => {
        state.list = { ...action.meta.arg, requestId: action.meta.requestId, status: 'loading' };
        state.error = null;
      })
      .addCase(fetchReviewsForBook.fulfilled, (state, action) => {
        if (state.list?.requestId !== action.meta.requestId) return;
        state.list.status = 'ready';
        state.reviews = action.payload;
      })
      .addCase(fetchReviewsForBook.rejected, (state, action) => {
        if (state.list?.requestId !== action.meta.requestId) return;
        state.list.status = 'failed';
        state.error = action.payload;
      })
      // Add review
      .addCase(addReviewForBook.pending, (state) => {
        state.submitting = true;
      })
      .addCase(addReviewForBook.fulfilled, (state) => {
        state.submitting = false;
        // 성공 시 리뷰 목록을 다시 가져오는 것을 고려할 수 있음
      })
      .addCase(addReviewForBook.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.payload;
      })
      // Toggle like
      .addCase(toggleLikeForReview.pending, (state, action) => {
        const reviewId = action.meta.arg;
        const review = state.reviews.find((r) => r.id === reviewId);
        if (review) {
          // Optimistic update
          review.isLikedByCurrentUser = !review.isLikedByCurrentUser;
          review.likeCount += review.isLikedByCurrentUser ? 1 : -1;
        }
      })
      .addCase(toggleLikeForReview.rejected, (state, action) => {
        // Revert optimistic update on failure
        const { reviewId } = action.payload as { reviewId: number; error: any };
        const review = state.reviews.find((r) => r.id === reviewId);
        if (review) {
          review.isLikedByCurrentUser = !review.isLikedByCurrentUser;
          review.likeCount += review.isLikedByCurrentUser ? 1 : -1;
        }
        state.error = (action.payload as any).error;
      });
  },
});

export default reviewSlice.reducer;
