package bookapp.bookappback.operations;

import bookapp.bookappback.common.exception.AppException;
import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static java.util.stream.Collectors.toMap;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/operations")
public class OperationsController {
    private static final int PAGE_SIZE = 30;
    private static final Set<String> CATEGORIES = Set.of("", "ERROR", "DISCOVERY", "USABILITY");
    private static final String FEEDBACK_STATUSES = "NEW|REVIEWING|RESOLVED";

    private final JdbcClient jdbc;

    @GetMapping("/summary")
    public Summary summary() {
        Map<String, Long> counts = jdbc.sql("SELECT status, count(*) AS total FROM beta_feedback GROUP BY status")
                .query((rs, row) -> Map.entry(rs.getString("status"), rs.getLong("total")))
                .list().stream().collect(toMap(Map.Entry::getKey, Map.Entry::getValue));
        var recommendation = jdbc.sql("SELECT * FROM operations_recommendation_summary")
                .query(RecommendationSummary.class).single();
        return new Summary(counts, recommendation);
    }

    @GetMapping("/feedback")
    public FeedbackPage feedback(@RequestParam(defaultValue = "") String category,
                                 @RequestParam(defaultValue = "") String status,
                                 @RequestParam(name = "before_id", defaultValue = "9223372036854775807") long beforeId) {
        if (!CATEGORIES.contains(category) || (!status.isEmpty() && !status.matches(FEEDBACK_STATUSES)) || beforeId <= 0) {
            throw new IllegalArgumentException("피드백 조회 조건이 올바르지 않습니다.");
        }
        var rows = jdbc.sql("""
                SELECT id, created_at, category, message, status, status_version
                FROM beta_feedback
                WHERE (:category = '' OR category = :category)
                  AND (:status = '' OR status = :status)
                  AND id < :beforeId
                ORDER BY id DESC
                LIMIT :fetchLimit
                """)
                .param("category", category).param("status", status)
                .param("beforeId", beforeId).param("fetchLimit", PAGE_SIZE + 1)
                .query(FeedbackItem.class).list();
        if (rows.size() <= PAGE_SIZE) return new FeedbackPage(rows, null);
        return new FeedbackPage(rows.subList(0, PAGE_SIZE), rows.get(PAGE_SIZE - 1).id());
    }

    @PutMapping("/feedback/{id}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateStatus(@PathVariable long id, @Valid @RequestBody StatusChange change) {
        int updated = jdbc.sql("""
                UPDATE beta_feedback
                SET status = :status, status_version = status_version + 1
                WHERE id = :id AND status_version = :version
                """)
                .param("id", id).param("status", change.status()).param("version", change.version())
                .update();
        if (updated > 0) return;
        boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM beta_feedback WHERE id = :id)")
                .param("id", id).query(Boolean.class).single();
        if (!exists) throw new AppException(HttpStatus.NOT_FOUND, "FEEDBACK_NOT_FOUND", "해당 의견을 찾을 수 없어요.");
        throw new AppException(HttpStatus.CONFLICT, "FEEDBACK_STATUS_CHANGED", "의견 상태가 바뀌었어요. 새로고침 후 다시 시도해주세요.");
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public void malformedRequest() {}

    public record StatusChange(@NotBlank @Pattern(regexp = FEEDBACK_STATUSES) String status,
                               @NotNull @PositiveOrZero Integer version) {}

    public record FeedbackItem(long id, @JsonFormat(shape = JsonFormat.Shape.STRING) OffsetDateTime createdAt, String category,
                               String message, String status, int statusVersion) {}

    public record FeedbackPage(List<FeedbackItem> items, Long nextBeforeId) {}

    public record RecommendationSummary(long completedJobs, long withResults, long fallbackResults,
                                        long noMatch, long errors, Long p50TotalMs, Long p95TotalMs) {}

    public record Summary(Map<String, Long> feedbackCounts, RecommendationSummary recommendation) {}
}
