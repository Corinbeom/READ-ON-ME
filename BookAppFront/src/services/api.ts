// BookAppFront/src/services/api.ts
import axios from 'axios';
import { Platform } from 'react-native';

// 디바이스/에뮬레이터 환경별 기본 URL 설정
// - iOS 시뮬레이터: localhost 접근 가능
// - Android 에뮬레이터: 10.0.2.2 사용
// - 실제 디바이스: 같은 네트워크의 개발 머신 IP 사용
const API_BASE_URL = (() => {
  if (Platform.OS === 'android') return 'http://10.0.2.2:8080';
  return 'http://localhost:8080';
})();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 인증 관련 API
export const authApi = {
  // 로그인
  signIn: (data: { email: string; password: string }) =>
    api.post('/api/users/signin', data),

  // 회원가입
  signUp: (data: { email: string; password: string; nickname: string }) =>
    api.post('/api/users/signup', data),

  // 프로필 조회
  getProfile: (token: string) =>
    api.get('/api/users/profile', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // API 테스트
  test: () => api.get('/api/users/test'),
};

// 책 관련 API
export const bookApi = {
  // 책 검색
  searchBooks: (params: {
    query: string;
    page?: number;
    size?: number;
    sort?: 'accuracy' | 'latest';
    target?: 'title' | 'isbn' | 'publisher' | 'person';
  }) => api.get('/api/books/search', { params }),

  // 책 상세 조회
  getBookDetail: (isbn: string) => api.get(`/api/books/detail/${isbn}`),

  // 인기 책 조회
  getPopularBooks: () => api.get('/api/books/popular'),

  // API 테스트
  test: () => api.get('/api/books/test'),
};


// 리뷰 관련 API
export const reviewApi = {
  // 리뷰 생성
  createReview: (
    bookId: number,
    data: { comment: string; rating: number },
    token: string
  ) =>
    api.post(`/api/book/${bookId}/review`, data, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // 특정 책의 리뷰 목록 조회
  getReviewsByBook: (bookId: number) => api.get(`/api/book/${bookId}/reviews`),

  // 리뷰 수정
  updateReview: (
    reviewId: number,
    data: { comment: string; rating: number },
    token: string
  ) =>
    api.put(`/api/book/review/${reviewId}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // 리뷰 삭제
  deleteReview: (reviewId: number, token: string) =>
    api.delete(`/api/book/review/${reviewId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
};
