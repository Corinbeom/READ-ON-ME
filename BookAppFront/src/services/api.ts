// BookAppFront/src/services/api.ts
import axios, { AxiosError, isCancel } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ReadingStatus } from '../types/readingStatus'
import type { BookDto } from '../types/BookDto';
import type { AiSearchTiming } from '../utils/aiSearchTiming';
import type { KakaoExchange, KakaoStart } from '../utils/kakaoLogin';
import type { FeedbackCategory, FeedbackStatus, RecommendationRating } from '../utils/feedback';
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

const galpiAvailabilityPath = '/api/ai/availability';
const readingKeywordPicksPath = '/api/books/reading-keyword-picks';
const kakaoAuthPath = '/api/users/kakao/';
const feedbackPath = '/api/feedback';
const operationsPath = '/api/operations';

api.interceptors.request.use(async (config) => {
  const noAuthPaths = [
    galpiAvailabilityPath,
    '/api/books/search',
    '/api/books/detail',
    readingKeywordPicksPath,
    '/api/users/signin',
    '/api/users/signup',
    kakaoAuthPath,
    feedbackPath,
  ];
  
  const shouldSkipAuth = noAuthPaths.some((path) =>
    config.url?.includes(path)
  );

  if (!shouldSkipAuth && !config.headers.Authorization) {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// 전역 알림을 띄우지 않을 경로 (화면/슬라이스에서 직접 처리하는 엔드포인트)
const silentPaths = [
  '/api/ai/jobs',
  galpiAvailabilityPath,
  readingKeywordPicksPath,
  '/api/users/profile',
  '/api/users/signin',
  '/api/users/signup',
  kakaoAuthPath,
  feedbackPath,
  operationsPath,
];

export interface AiSearchBook {
  contents?: string | null;
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

export type RecommendationFeedback = { rating: RecommendationRating | null; comment: string | null };

export const aiJobApi = {
  availability: (signal: AbortSignal) => api.get<AiJobResponse<boolean>>(galpiAvailabilityPath, { signal }),
  submit: (query: string, key: string) =>
    api.post<AiJobResponse<AiSearchJob>>('/api/ai/jobs', { query }, { headers: { 'Idempotency-Key': key } }),
  recordTiming: (id: string, timing: AiSearchTiming) =>
    api.put<void>(`/api/ai/jobs/${id}/client-timing`, timing),
  recent: () => api.get<AiJobResponse<AiSearchJob[]>>('/api/ai/jobs/recent'),
  get: (id: string, signal?: AbortSignal) => api.get<AiJobResponse<AiSearchJob>>(`/api/ai/jobs/${id}`, { signal }),
  feedback: (id: string, signal: AbortSignal) =>
    api.get<AiJobResponse<RecommendationFeedback>>(`/api/ai/jobs/${id}/feedback`, { signal }),
  sendFeedback: (id: string, rating: RecommendationRating, comment: string, signal: AbortSignal) =>
    api.put<AiJobResponse<RecommendationFeedback>>(`/api/ai/jobs/${id}/feedback`, { rating, comment }, { signal }),
};

// The active session owner compares the bearer with the current token before signing out.
let onExpiredSession: ((token: string) => void) | undefined;

export function observeSessionExpiry(listener: (token: string) => void) {
  onExpiredSession = listener;
  return () => { if (onExpiredSession === listener) onExpiredSession = undefined; };
}

// ✅ 전역 인터셉터 — 모든 API 오류를 한 곳에서 처리
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (isCancel(error)) return Promise.reject(error);
    const url = error.config?.url ?? '';
    const bearer = error.config?.headers?.Authorization;
    const body = error.response?.data as { code?: string } | undefined;
    if (error.response?.status === 401 && body?.code === 'SESSION_EXPIRED' &&
        typeof bearer === 'string' && bearer.startsWith('Bearer ')) {
      onExpiredSession?.(bearer.slice(7));
      return Promise.reject(error);
    }
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

  startKakao: (challenge: string, signal: AbortSignal) =>
    api.post<KakaoStart>(kakaoAuthPath + 'start', { challenge }, { signal }),

  exchangeKakao: (data: KakaoExchange) =>
    api.post(kakaoAuthPath + 'exchange', data, { timeout: 15000 }),

  getProfile: (token: string) =>
    api.get('/api/users/profile', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  updateNickname: (nickname: string, signal: AbortSignal) =>
    api.put<{ data: { id: number; nickname: string } }>('/api/users/profile', { nickname }, { signal }),

  suggestNickname: (exclude: string, signal: AbortSignal) =>
    api.post<{ data: { nickname: string } }>('/api/users/profile/nickname-suggestion', { exclude }, { signal }),

  test: () => api.get('/api/users/test'),
};

export const feedbackApi = {
  submit: (category: FeedbackCategory, message: string, signal: AbortSignal) =>
    api.post(feedbackPath, { category, message }, { signal }),
};

export type OperationsSummary = {
  feedbackCounts: Partial<Record<FeedbackStatus, number>>;
  recommendation: {
    completedJobs: number;
    withResults: number;
    fallbackResults: number;
    noMatch: number;
    errors: number;
    p50TotalMs: number | null;
    p95TotalMs: number | null;
  };
};

export type OperationsUserOverview = {
  totalUsers: number;
  joinedToday: number;
  joinedLastSevenDays: number;
  emailAccounts: number;
  kakaoAccounts: number;
  shelfUsers: number;
  toReadBooks: number;
  readingBooks: number;
  completedBooks: number;
  galpiUsersLastDay: number;
};

export type OperationsUserPage = {
  items: { id: number; nickname: string; joinedAt: string; provider: 'KAKAO' | 'EMAIL' }[];
  nextBeforeId: number | null;
};

export type OperationsFeedback = {
  id: number;
  createdAt: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  statusVersion: number;
  message: string;
};

export type OperationsFeedbackPage = { items: OperationsFeedback[]; nextBeforeId: number | null };

export type OperationsRecommendationFeedback = {
  id: number;
  query: string;
  outcome: 'MODEL' | 'FALLBACK' | 'NO_MATCH';
  books: Pick<AiSearchBook, 'isbn' | 'title' | 'authors' | 'reason'>[];
  rating: RecommendationRating;
  comment: string | null;
  submittedAt: string;
};

export type OperationsRecommendationFeedbackPage = {
  items: OperationsRecommendationFeedback[];
  nextBeforeId: number | null;
};

export const operationsApi = {
  summary: (signal: AbortSignal) => api.get<OperationsSummary>(operationsPath + '/summary', { signal }),
  access: (signal: AbortSignal) => api.get<AiJobResponse<{ user_id: number }>>(operationsPath + '/access', { signal }),
  users: (signal: AbortSignal) => api.get<AiJobResponse<OperationsUserOverview>>(operationsPath + '/users', { signal }),
  userList: (beforeId: number | undefined, signal: AbortSignal) =>
    api.get<AiJobResponse<OperationsUserPage>>(operationsPath + '/users/list', { params: { before_id: beforeId }, signal }),
  feedback: (params: { category: FeedbackCategory | ''; status: FeedbackStatus | ''; before_id?: number }, signal: AbortSignal) =>
    api.get<OperationsFeedbackPage>(operationsPath + '/feedback', { params, signal }),
  recommendationFeedback: (params: { rating?: RecommendationRating; before_id?: number }, signal: AbortSignal) =>
    api.get<AiJobResponse<OperationsRecommendationFeedbackPage>>(operationsPath + '/recommendation-feedback', { params, signal }),
  updateStatus: (entry: OperationsFeedback, status: FeedbackStatus, signal: AbortSignal) =>
    api.put(operationsPath + `/feedback/${entry.id}/status`, { status, version: entry.statusVersion }, { signal }),
};

// 🔹 책 관련 API
type LocalRequestOptions = { signal?: AbortSignal; handleErrorLocally?: boolean };
export type ReadingKeywordPick = Pick<BookDto, 'isbn13' | 'title' | 'authors' | 'thumbnail'>;

export const bookApi = {
  getReadingKeywordPicks: (keywords: string[], signal: AbortSignal) => {
    const params = new URLSearchParams();
    keywords.forEach(keyword => params.append('tag', keyword));
    return api.get<ReadingKeywordPick[]>(readingKeywordPicksPath, { params, signal });
  },

  searchBooks: (params: {
    query: string;
    page?: number;
    size?: number;
    sort?: 'accuracy' | 'latest';
    target?: 'title' | 'isbn' | 'publisher' | 'person';
  }, options?: LocalRequestOptions) => api.get('/api/books/search', { params, ...options }),

  getBookDetail: (isbn: string, signal?: AbortSignal, options?: Pick<LocalRequestOptions, 'handleErrorLocally'>) =>
    api.get(`/api/books/detail/${isbn}`, { signal, ...options }),
  getPopularBooks: () => api.get('/api/books/popular'),
  test: () => api.get('/api/books/test'),

  getBookEditions: (isbn: string) => api.get(`/api/books/${isbn}/editions`),

  updateBookStatus: (bookId: number, status: ReadingStatus, options?: LocalRequestOptions) =>
    api.post(`/api/library/${bookId}`, null, { params: { status: status.toString() }, ...options }),

  updateBookStatusByIsbn: (isbn: string, status: ReadingStatus, options?: LocalRequestOptions) =>
    api.post<number>(`/api/library/isbn/${isbn}`, null, { params: { status }, ...options }),

  removeLibraryBook: (bookId: number, options?: LocalRequestOptions) => api.delete(`/api/library/${bookId}`, options),

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

  createReviewByIsbn: (isbn: string, data: { comment: string; rating: number }) =>
    api.post(`/api/books/isbn/${isbn}/review`, data),

  getReviewsByBook: (bookId: number, sort: string, options?: LocalRequestOptions) => api.get(`/api/books/${bookId}/reviews`, { params: { sort }, ...options }),

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
  getNotifications: (options?: LocalRequestOptions) => api.get('/api/notifications', options),
  markAsRead: (notificationId: number) => api.post(`/api/notifications/${notificationId}/read`),
  markAllAsRead: () => api.post('/api/notifications/read-all'),
};
