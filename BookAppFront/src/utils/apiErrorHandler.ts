// BookAppFront/src/utils/apiErrorHandler.ts
import { AxiosError } from 'axios';

interface ErrorResponseData {
    status?: number;
    code?: string;
    message?: string;
}

export const handleApiError = (error: unknown): string => {
  // 1️⃣ AxiosError 타입인 경우만 처리
    if (isAxiosError<ErrorResponseData>(error)) {
        const { response } = error;
        const status = response?.status;
        const message = response?.data?.message ?? '';

    switch (status) {
      case 400:
        return message || '잘못된 요청입니다.';
      case 401:
        return '로그인이 필요합니다.';
      case 403:
        return '접근 권한이 없습니다.';
      case 404:
        return message || '요청한 데이터를 찾을 수 없습니다.';
      case 409:
        return message || '이미 존재하는 데이터입니다.';
      case 502:
        return '외부 서비스 오류가 발생했습니다.';
      default:
        return message || '알 수 없는 오류가 발생했습니다.';
    }
  }

  // 2️⃣ AxiosError 외의 경우 (네트워크 오류 등)
  return '서버와의 연결이 불안정합니다.';
};

// AxiosError 타입 가드 함수
function isAxiosError<T>(error: unknown): error is AxiosError<T> {
  return !!(error && typeof error === 'object' && 'isAxiosError' in error);
}
