package bookapp.bookappback.ai.service;

import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.ai.repository.AiSearchJobRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.stereotype.Component;

@Component
public class GalpiAvailability {
    private static final String SUBMISSION_STATE = GalpiAvailability.class.getName() + ".submission";
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
    private final AiSearchJobRepository jobs;

    public GalpiAvailability(AiSearchService client,
                             @org.springframework.beans.factory.annotation.Value("${galpi.reviewed-release:}") String release,
                             AiSearchJobRepository jobs) {
        this.client = client;
        this.release = release;
        this.jobs = jobs;
    }

    public String release() { return release; }

    public State state() {
        if (release.isBlank()) return State.MAINTENANCE;
        State state = client.releaseState(release);
        // A rejected candidate can roll back. Keep existing jobs retryable until the switch is verified.
        if (state == State.MAINTENANCE && jobs.deploymentHoldsClaims()) return State.UNCONFIRMED;
        return state;
    }

    public boolean underMaintenance() {
        return state() != State.AVAILABLE;
    }

    public State checkSubmission(HttpServletRequest request) {
        State checked = state();
        request.setAttribute(SUBMISSION_STATE, checked);
        return checked;
    }

    public void requireAvailable() {
        State checked = null;
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            checked = (State) attributes.getRequest().getAttribute(SUBMISSION_STATE);
        }
        State current = checked == null ? state() : checked;
        if (!current.confirmedAvailable()) {
            throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, MAINTENANCE, "갈피의 추천 도서를 정비하고 있어요");
        }
    }
}
