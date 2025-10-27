package bookapp.bookappback.common.exception;

import org.springframework.http.HttpStatus;

public class ReviewExceptions {

    public static class ReviewNotFoundException extends AppException {
        public ReviewNotFoundException(Long reviewId) {
            super(HttpStatus.NOT_FOUND, "REVIEW_NOT_FOUND", "리뷰를 찾을 수 없습니다. ID=" + reviewId);
        }
    }

    public static class ReviewAccessDeniedException extends AppException {
        public ReviewAccessDeniedException() {
            super(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "해당 리뷰에 대한 접근 권한이 없습니다.");
        }
    }

    public static class InvalidReviewContentException extends AppException {
        public InvalidReviewContentException() {
            super(HttpStatus.BAD_REQUEST, "INVALID_REVIEW_CONTENT", "리뷰 내용이 비어 있습니다.");
        }
    }

    public static class ReviewAlreadyExistsException extends AppException {
        public ReviewAlreadyExistsException(String isbn) {
            super(HttpStatus.CONFLICT, "REVIEW_ALREADY_EXISTS", "이미 이 책에 대한 리뷰를 작성했습니다. ISBN=" + isbn);
        }
    }
}
