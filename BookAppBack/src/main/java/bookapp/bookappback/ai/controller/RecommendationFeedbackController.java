package bookapp.bookappback.ai.controller;

import bookapp.bookappback.ai.service.GalpiAvailability;
import bookapp.bookappback.common.dto.ApiResponse;
import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.security.UserDetailsImpl;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.sql.Types;
import java.time.LocalDateTime;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai/jobs/{jobId}/feedback")
public class RecommendationFeedbackController {
    private static final String ELIGIBLE_JOB = """
            WHERE j.id = :jobId AND j.user_id = :userId AND j.expires_at > :now
              AND j.status = 'SUCCEEDED' AND j.result_outcome IS DISTINCT FROM 'DEGRADED_EMPTY'
            """;

    private final JdbcClient jdbc;
    private final GalpiAvailability availability;

    @GetMapping
    public ApiResponse<Rating> read(@AuthenticationPrincipal UserDetailsImpl principal, @PathVariable UUID jobId) {
        Rating rating = jdbc.sql("""
                SELECT feedback.rating, feedback.comment FROM ai_search_jobs j
                LEFT JOIN recommendation_feedback feedback ON feedback.job_id = j.id
                """ + ELIGIBLE_JOB)
                .param("jobId", jobId).param("userId", principal.getUser().getId()).param("now", LocalDateTime.now())
                .query(Rating.class).optional().orElseThrow(RecommendationFeedbackController::unavailable);
        return new ApiResponse<>(true, "추천 평가 조회 완료", rating);
    }

    @PutMapping
    public ApiResponse<Rating> submit(@AuthenticationPrincipal UserDetailsImpl principal, @PathVariable UUID jobId,
                                      @Valid @RequestBody Submission submission) {
        availability.requireAvailable();
        String comment = submission.comment() == null ? "" : submission.comment().strip();
        Rating rating = jdbc.sql("""
                INSERT INTO recommendation_feedback (job_id, query, outcome, books, rating, comment)
                SELECT j.id, j.query, COALESCE(j.result_outcome, CASE
                           WHEN jsonb_array_length(result.books) = 0 THEN 'NO_MATCH'
                           WHEN result.books @> '[{"ranking_status":"FALLBACK"}]'::jsonb THEN 'FALLBACK'
                           ELSE 'MODEL' END),
                       (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                   'isbn', book ->> 'isbn', 'title', book ->> 'title',
                                   'authors', book -> 'authors', 'reason', CASE
                                       WHEN book ->> 'ranking_status' IN ('GEMINI', 'GROQ')
                                           AND btrim(book ->> 'reason_evidence') <> ''
                                       THEN NULLIF(btrim(book ->> 'reason'), '')
                                   END
                               ) ORDER BY position), '[]'::jsonb)
                        FROM jsonb_array_elements(result.books) WITH ORDINALITY AS displayed(book, position)
                        WHERE position <= 5), :rating, :comment
                FROM ai_search_jobs j
                CROSS JOIN LATERAL (
                    SELECT COALESCE(NULLIF(CAST(j.result_json AS jsonb), 'null'::jsonb), '[]'::jsonb) AS books
                ) result
                """ + ELIGIBLE_JOB + """
                ON CONFLICT (job_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
                RETURNING rating, comment
                """)
                .param("jobId", jobId).param("userId", principal.getUser().getId()).param("now", LocalDateTime.now())
                .param("rating", submission.rating()).param("comment", comment.isEmpty() ? null : comment, Types.VARCHAR)
                .query(Rating.class).optional().orElseThrow(RecommendationFeedbackController::unavailable);
        return new ApiResponse<>(true, "추천 평가 저장 완료", rating);
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, HttpMessageNotReadableException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public void malformedRequest() {}

    private static AppException unavailable() {
        return new AppException(HttpStatus.NOT_FOUND, "RATING_JOB_UNAVAILABLE", "이 검색의 평가 기간이 종료됐어요.");
    }

    public record Submission(@NotNull @Min(1) @Max(5) Integer rating, @Size(max = 500) String comment) {}
    public record Rating(Integer rating, String comment) {}
}
