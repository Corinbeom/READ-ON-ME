import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { reviewApi } from '../services/api';
import { Review } from '../types/review';

interface ReviewState {
  reviews: Review[];
  loading: boolean;
  error: any | null;
}

const initialState: ReviewState = {
  reviews: [],
  loading: false,
  error: null,
};

// 책에 대한 리뷰들 가져오기
export const fetchReviewsForBook = createAsyncThunk(
  'reviews/fetchForBook',
  async ({ bookId, sort }: { bookId: number; sort: string }, { rejectWithValue }) => {
    try {
      const response = await reviewApi.getReviewsByBook(bookId, sort);
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
    { bookId, comment, rating }: { bookId: number; comment: string; rating: number },
    { rejectWithValue }
  ) => {
    try {
      const response = await reviewApi.createReview(bookId, { comment, rating });
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
      .addCase(fetchReviewsForBook.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchReviewsForBook.fulfilled, (state, action: PayloadAction<Review[]>) => {
        state.loading = false;
        state.reviews = action.payload;
      })
      .addCase(fetchReviewsForBook.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Add review
      .addCase(addReviewForBook.pending, (state) => {
        state.loading = true;
      })
      .addCase(addReviewForBook.fulfilled, (state) => {
        state.loading = false;
        // 성공 시 리뷰 목록을 다시 가져오는 것을 고려할 수 있음
      })
      .addCase(addReviewForBook.rejected, (state, action) => {
        state.loading = false;
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
