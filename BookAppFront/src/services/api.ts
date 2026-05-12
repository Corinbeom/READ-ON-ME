// BookAppFront/src/services/api.ts
import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ReadingStatus } from '../types/readingStatus'
import customAlert from '../utils/alert'; // 이미 있는 Alert 유틸
import { handleApiError } from '../utils/apiErrorHandler'; // 아래에 따로 만들 파일

const resolveDevHost = (): string => {
  // 1) 명시적 오버라이드 (실기기 테스트 시 유용)
  const envHost = process.env.EXPO_PUBLIC_API_HOST?.trim();
  if (envHost) return envHost;

  // 2) Expo 개발 서버(hostUri)에서 호스트(IP) 추출
  // 예: "192.168.0.5:8081" -> "192.168.0.5"
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoClient?.hostUri;
  if (typeof hostUri === 'string' && hostUri.length > 0) {
    const host = hostUri.split(':')[0];
    if (host) return host;
  }

  // 3) Android 에뮬레이터는 10.0.2.2로 호스트 머신 접근
  if (Platform.OS === 'android') return '10.0.2.2';

  // 4) 그 외(웹/iOS 시뮬레이터 등)
  return 'localhost';
};

// 📍 환경별 Base URL 설정
export const API_BASE_URL = (() => {
  const host = resolveDevHost();
  return `http://${host}:8080`;
})();

// 📍 FastAPI 서버를 위한 Base URL 설정
const RECOMMENDATION_API_BASE_URL = (() => {
  const host = resolveDevHost();
  return `http://${host}:8000`;
})();

// 📍 공통 Axios 인스턴스
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// 📍 추천 API를 위한 별도 Axios 인스턴스
export const recommendationApiInstance = axios.create({
  baseURL: RECOMMENDATION_API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const noAuthPaths = [
    '/api/books/search',
    '/api/books/detail',
    '/api/users/signin',
    '/api/users/signup',
  ];
  
  const shouldSkipAuth = noAuthPaths.some((path) =>
    config.url?.includes(path)
  );

  if (!shouldSkipAuth) {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// 전역 알림을 띄우지 않을 경로 (화면/슬라이스에서 직접 처리하는 엔드포인트)
const silentPaths = [
  '/api/users/profile',
  '/api/users/signin',
  '/api/users/signup',
];

// ✅ 전역 인터셉터 — 모든 API 오류를 한 곳에서 처리
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    const isSilent = silentPaths.some((path) => url.includes(path));
    if (!isSilent) {
      const message = handleApiError(error);
      customAlert('오류', message);
    }
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

  signUp: (data: { email: string; password: string; nickname: string; birth_year?: number }) =>
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

  getBookEditions: (isbn: string) => api.get(`/api/books/${isbn}/editions`),

  updateBookStatus: (bookId: number, status: ReadingStatus) =>
    api.post(`/api/library/${bookId}`, null, { params: { status: status.toString() } }),

  getUserLibrary: () => api.get('/api/library'),

  getBooksByIds: (ids: number[]) => api.post('/api/books/details', ids),

  // 도서관 정보나루 인기 대출 도서 (로그인 시 나이대별, 비로그인 시 전체)
  getPopularBooksFromLibrary: (ageGroup?: number) =>
    api.get('/api/books/popular/naru', ageGroup ? { params: { ageGroup } } : {}),
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

// 🔮 추천 관련 API (Spring Boot 직접 호출로 변경 — FastAPI 불필요)
export const recommendationApi = {
  getRecommendations: () =>
    api.get<{ type: string; bookIds: number[] }>('/api/recommendations'),
};

// 🔔 알림 관련 API
export const notificationApi = {
  getNotifications: () => api.get('/api/notifications'),
  markAsRead: (notificationId: number) => api.post(`/api/notifications/${notificationId}/read`),
  markAllAsRead: () => api.post('/api/notifications/read-all'),
};
