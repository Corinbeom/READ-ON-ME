package bookapp.bookappback.common.exception;

import org.springframework.http.HttpStatus;

public class BookExceptions {

    public static class ExternalApiException extends AppException {
        public ExternalApiException(String message) {
            super(HttpStatus.BAD_GATEWAY, "EXTERNAL_API_ERROR", message);
        }
    }

    public static class BookNotFoundException extends AppException {
        public BookNotFoundException(String query) {
            super(HttpStatus.NOT_FOUND, "BOOK_NOT_FOUND", "검색 결과가 없습니다: " + query);
        }
    }

    public static class InvalidBookIdException extends AppException {
        public InvalidBookIdException(Long bookId) {
            super(HttpStatus.BAD_REQUEST, "INVALID_BOOK_ID", "잘못된 도서 ID입니다: " + bookId);
        }
    }
}
