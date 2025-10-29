package bookapp.bookappback.common.exception;

import org.springframework.http.HttpStatus;

public class UserExceptions {

    public static class EmailDuplicateException extends AppException {
        public EmailDuplicateException(String email) {
            super(HttpStatus.CONFLICT, "EMAIL_DUPLICATE", "이미 가입된 이메일입니다: " + email);
        }
    }

    public static class NickNameDuplicateException extends AppException {
        public NickNameDuplicateException(String nickname) {
            super(HttpStatus.CONFLICT, "NICKNAME_DUPLICATE", "이미 가입된 이메일입니다: " + nickname);
        }
    }

    public static class InvalidLoginException extends AppException {
        public InvalidLoginException() {
            super(HttpStatus.UNAUTHORIZED, "INVALID_LOGIN", "이메일 또는 비밀번호가 올바르지 않습니다.");
        }
    }

    public static class UserNotFoundException extends AppException {
        public UserNotFoundException(Long userId) {
            super(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다. ID=" + userId);
        }
    }

    public static class EmailNotFoundException extends AppException {
        public EmailNotFoundException(String email) {
            super(HttpStatus.NOT_FOUND, "EMAIL_NOT_FOUND", "이메일을 찾을 수 없습니다. EMAIL=" + email);
        }
    }
}
