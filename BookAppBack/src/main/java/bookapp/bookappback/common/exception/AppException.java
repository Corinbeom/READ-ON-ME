package bookapp.bookappback.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class AppException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public AppException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
