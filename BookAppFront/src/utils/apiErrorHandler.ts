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

export function signInErrorMessage(error: unknown): string {
  if (isAxiosError<ErrorResponseData>(error)) {
    const { response, code } = error;
    if (response?.status === 401 && response.data?.code === 'INVALID_LOGIN') {
      return '이메일 또는 비밀번호를 확인해주세요.';
    }
    if (response?.status === 400 && response.data?.code === 'INVALID_INPUT') {
      return response.data.message || '입력한 이메일 형식을 확인해주세요.';
    }
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return '로그인 응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.';
    }
    if (!response) return '서버에 연결할 수 없어요. 네트워크 연결을 확인한 뒤 다시 시도해주세요.';
    if (response.status >= 500) return '로그인 서버가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해주세요.';
  }
  return '로그인을 완료하지 못했어요. 잠시 후 다시 시도해주세요.';
}
