package bookapp.bookappback.common.exception;

import org.springframework.http.HttpStatus;

public class NotificationExceptions {

    public static class NotificationNotFoundException extends AppException {
        public NotificationNotFoundException(Long notificationId) {
            super(HttpStatus.NOT_FOUND, "NOTIFICATION_NOT_FOUND",
                    "알림을 찾을 수 없습니다. ID=" + notificationId);
        }
    }

    public static class NotificationAccessDeniedException extends AppException {
        public NotificationAccessDeniedException() {
            super(HttpStatus.FORBIDDEN, "NOTIFICATION_ACCESS_DENIED",
                    "해당 알림에 대한 접근 권한이 없습니다.");
        }
    }
}
