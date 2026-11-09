package bookapp.bookappback.ai.service;

import bookapp.bookappback.common.exception.AppException;
import org.springframework.http.HttpStatus;

public class AiSearchCapacityException extends AppException {
    public AiSearchCapacityException() {
        super(HttpStatus.SERVICE_UNAVAILABLE, "AI_SEARCH_BUSY", "AI 사서가 바쁩니다. 잠시 후 다시 시도해주세요.");
    }
}
