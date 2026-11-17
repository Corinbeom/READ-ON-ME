// BookAppFront/src/services/api.ts
import axios, { AxiosError, isCancel } from 'axios';
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

// Expo inlines EXPO_PUBLIC variables at build time; only public URLs belong here.
export const API_BASE_URL = (() => {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error('EXPO_PUBLIC_API_URL must be an absolute API URL.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('EXPO_PUBLIC_API_URL must be an HTTP(S) URL without credentials, query, or fragment.');
    }
    if (!__DEV__ && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Release builds require an external HTTPS EXPO_PUBLIC_API_URL.');
    }
    return configured.replace(/\/+$/, '');
  }
  if (!__DEV__) throw new Error('Set EXPO_PUBLIC_API_URL before building for release.');
  return `http://${resolveDevHost()}:8080`;
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
  '/api/ai/jobs',
  '/api/users/profile',
  '/api/users/signin',
  '/api/users/signup',
];

export interface AiSearchBook {
  isbn: string;
  title: string;
  authors?: string | string[] | null;
  thumbnail?: string | null;
  reason?: string | null;
  reason_evidence?: string | null;
  ranking_status?: 'GEMINI' | 'GROQ' | 'FALLBACK';
}

export interface AiSearchJob {
  id: string;
  query: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  results: AiSearchBook[] | null;
  error_code: string | null;
  result_outcome: 'MODEL' | 'FALLBACK' | 'NO_MATCH' | 'DEGRADED_EMPTY' | null;
  result_reason: string | null;
  result_basis: 'SHARED_THEMES' | 'NONE' | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string;
}

interface AiJobResponse<T> { success: boolean; message: string; data: T }

export const aiJobApi = {
  submit: (query: string, key: string) =>
    api.post<AiJobResponse<AiSearchJob>>('/api/ai/jobs', { query }, { headers: { 'Idempotency-Key': key } }),
  recent: () => api.get<AiJobResponse<AiSearchJob[]>>('/api/ai/jobs/recent'),
  get: (id: string) => api.get<AiJobResponse<AiSearchJob>>(`/api/ai/jobs/${id}`),
};

// ✅ 전역 인터셉터 — 모든 API 오류를 한 곳에서 처리
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (isCancel(error)) return Promise.reject(error);
    const url = error.config?.url ?? '';
    const handledLocally = error.config && 'handleErrorLocally' in error.config && error.config.handleErrorLocally === true;
    const isSilent = handledLocally || silentPaths.some((path) => url.includes(path));
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
type LocalRequestOptions = { signal?: AbortSignal; handleErrorLocally?: boolean };

export const bookApi = {
  searchBooks: (params: {
    query: string;
    page?: number;
    size?: number;
    sort?: 'accuracy' | 'latest';
    target?: 'title' | 'isbn' | 'publisher' | 'person';
  }, options?: LocalRequestOptions) => api.get('/api/books/search', { params, ...options }),

  getBookDetail: (isbn: string) => api.get(`/api/books/detail/${isbn}`),
  getPopularBooks: () => api.get('/api/books/popular'),
  test: () => api.get('/api/books/test'),

  getBookEditions: (isbn: string) => api.get(`/api/books/${isbn}/editions`),

  updateBookStatus: (bookId: number, status: ReadingStatus, options?: LocalRequestOptions) =>
    api.post(`/api/library/${bookId}`, null, { params: { status: status.toString() }, ...options }),

  getUserLibrary: (options?: LocalRequestOptions) => api.get('/api/library', options),

  getBooksByIds: (ids: number[], options?: LocalRequestOptions) => api.post('/api/books/details', ids, options),

  // 도서관 정보나루 인기 대출 도서 (로그인 시 나이대별, 비로그인 시 전체)
  getPopularBooksFromLibrary: (ageGroup?: number, options?: LocalRequestOptions) =>
    api.get('/api/books/popular/naru', { params: ageGroup ? { ageGroup } : undefined, ...options }),
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

  getMyReviews: (options?: LocalRequestOptions) => api.get('/api/reviews/my', options),
}; 

// 🔮 추천 관련 API (Spring Boot 직접 호출로 변경 — FastAPI 불필요)
export const recommendationApi = {
  getRecommendations: (options?: LocalRequestOptions) =>
    api.get<{ type: string; bookIds: number[] }>('/api/recommendations', options),
};

// 👤 유저 관련 API
export const userApi = {
  getReadingKeywords: (options?: LocalRequestOptions) => api.get('/api/users/reading-keywords', options),
};

// 🔔 알림 관련 API
export const notificationApi = {
  getNotifications: () => api.get('/api/notifications'),
  markAsRead: (notificationId: number) => api.post(`/api/notifications/${notificationId}/read`),
  markAllAsRead: () => api.post('/api/notifications/read-all'),
};
