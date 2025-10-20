// BookAppFront/src/store/bookSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { bookApi } from '../services/api';
import { Book, BookSearchResponse, BookSearchParams } from '../types/book';

interface BookState {
  books: Book[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  hasMore: boolean;
  currentPage: number;
}

const initialState: BookState = {
  books: [],
  loading: false,
  error: null,
  searchQuery: '',
  hasMore: true,
  currentPage: 1,
};

// 비동기 액션: 책 검색
export const searchBooks = createAsyncThunk(
  'books/search',
  async (params: BookSearchParams) => {
    const response = await bookApi.searchBooks(params);
    return response.data as BookSearchResponse;
  }
);

// 비동기 액션: 더 많은 책 로드 (페이징)
export const loadMoreBooks = createAsyncThunk(
  'books/loadMore',
  async (params: BookSearchParams) => {
    const response = await bookApi.searchBooks(params);
    return response.data as BookSearchResponse;
  }
);

const bookSlice = createSlice({
  name: 'books',
  initialState,
  reducers: {
    clearBooks: (state) => {
      state.books = [];
      state.currentPage = 1;
      state.hasMore = true;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // 새로운 검색
      .addCase(searchBooks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(searchBooks.fulfilled, (state, action) => {
        state.loading = false;
        state.books = action.payload.documents;
        state.hasMore = !action.payload.meta.is_end;
        state.currentPage = 1;
      })
      .addCase(searchBooks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '검색 중 오류가 발생했습니다.';
      })
      // 더 보기
      .addCase(loadMoreBooks.fulfilled, (state, action) => {
        state.books = [...state.books, ...action.payload.documents];
        state.hasMore = !action.payload.meta.is_end;
        state.currentPage += 1;
      });
  },
});

export const { clearBooks, setSearchQuery } = bookSlice.actions;
export default bookSlice.reducer;