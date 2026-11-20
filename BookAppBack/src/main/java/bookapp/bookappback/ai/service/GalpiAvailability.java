package bookapp.bookappback.ai.service;

import bookapp.bookappback.common.exception.AppException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class GalpiAvailability {
    public static final String MAINTENANCE = "AI_SEARCH_MAINTENANCE";

    private final AiSearchService client;
    private final String release;

    public GalpiAvailability(AiSearchService client,
                             @org.springframework.beans.factory.annotation.Value("${galpi.reviewed-release:}") String release) {
        this.client = client;
        this.release = release;
    }

    public String release() { return release; }

    public boolean underMaintenance() {
        return release.isBlank() || !client.releaseReady(release);
    }

    public void requireAvailable() {
        if (underMaintenance()) {
            throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, MAINTENANCE, "갈피의 추천 도서를 정비하고 있어요");
        }
    }
}
