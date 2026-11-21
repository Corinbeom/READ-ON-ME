package bookapp.bookappback.ai.service;

import bookapp.bookappback.common.exception.AppException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class GalpiAvailability {
    public static final String MAINTENANCE = "AI_SEARCH_MAINTENANCE";

    public enum State {
        AVAILABLE, MAINTENANCE, UNCONFIRMED;

        public boolean confirmedAvailable() {
            if (this == UNCONFIRMED) {
                throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "AI_STATUS_UNAVAILABLE",
                        "갈피 상태를 잠시 확인할 수 없어요.");
            }
            return this == AVAILABLE;
        }
    }

    private final AiSearchService client;
    private final String release;

    public GalpiAvailability(AiSearchService client,
                             @org.springframework.beans.factory.annotation.Value("${galpi.reviewed-release:}") String release) {
        this.client = client;
        this.release = release;
    }

    public String release() { return release; }

    public State state() {
        return release.isBlank() ? State.MAINTENANCE : client.releaseState(release);
    }

    public boolean underMaintenance() {
        return state() != State.AVAILABLE;
    }

    public void requireAvailable() {
        if (!state().confirmedAvailable()) {
            throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, MAINTENANCE, "갈피의 추천 도서를 정비하고 있어요");
        }
    }
}
