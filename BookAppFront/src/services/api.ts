// BookAppFront/src/services/api.ts
import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import customAlert from '../utils/alert'; // 이미 있는 Alert 유틸
import { handleApiError } from '../utils/apiErrorHandler'; // 아래에 따로 만들 파일

// 📍 환경별 Base URL 설정
const API_BASE_URL = (() => {
  if (Platform.OS === 'android') return 'http://10.0.2.2:8080';
  return 'http://localhost:8080';
})();

// 📍 공통 Axios 인스턴스
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const noAuthPaths = [
    '/api/books/search',
    '/api/books/detail',
    '/api/books/popular',
    // '/api/books', 
    '/api/users/signin',
    '/api/users/signup',
  ];
  
  const shouldSkipAuth = noAuthPaths.some((path) =>
    config.url?.includes(path)
  );
  const token = await AsyncStorage.getItem('accessToken');

  console.log('📤 요청 URL:', config.url);
  console.log('🔐 shouldSkipAuth:', shouldSkipAuth);
  console.log('🔑 토큰:', token);

  if (!shouldSkipAuth) {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// ✅ 전역 인터셉터 — 모든 API 오류를 한 곳에서 처리
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const message = handleApiError(error);
    customAlert('오류', message); // 사용자에게 표시
    return Promise.reject(error);
  }
);

//
// 👇 아래부터는 기존의 API 모듈들 그대로 유지
//

// 🔹 인증 관련 API
export const authApi = {
  signIn: (data: { email: string; password: string }) =>
    api.post('/api/users/signin', data),

  signUp: (data: { email: string; password: string; nickname: string }) =>
    api.post('/api/users/signup', data),

  getProfile: (token: string) =>
    api.get('/api/users/profile', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  test: () => api.get('/api/users/test'),
};

// 🔹 책 관련 API
export const bookApi = {
  searchBooks: (params: {
    query: string;
    page?: number;
    size?: number;
    sort?: 'accuracy' | 'latest';
    target?: 'title' | 'isbn' | 'publisher' | 'person';
  }) => api.get('/api/books/search', { params }),

  getBookDetail: (isbn: string) => api.get(`/api/books/detail/${isbn}`),
  getPopularBooks: () => api.get('/api/books/popular'),
  test: () => api.get('/api/books/test'),

  getBookEditions: (isbn: string) => api.get(`api/books/${isbn}/editions`),

  updateBookStatus: (bookId: number, status: ReadingStatus) =>
    api.post(`/api/library/${bookId}`, null, { params: { status: status.toString() } }),

  getUserLibrary: () => api.get('/api/library'),
};

// 🔹 리뷰 관련 API
export const reviewApi = {
  createReview: (bookId: number, data: { comment: string; rating: number }) =>
    api.post(`/api/books/${bookId}/review`, data),

  getReviewsByBook: (bookId: number, sort: string) => api.get(`/api/books/${bookId}/reviews`, { params: { sort } }),

  updateReview: (reviewId: number, data: { comment: string; rating: number }) =>
    api.put(`/api/books/review/${reviewId}`, data),

  deleteReview: (reviewId: number) => api.delete(`/api/books/review/${reviewId}`),

  toggleReviewLike: (reviewId: number) => api.post(`/api/books/review/${reviewId}/like`),

  getMyReviews: () => api.get('/api/reviews/my'), // New method to fetch user's reviews
};
