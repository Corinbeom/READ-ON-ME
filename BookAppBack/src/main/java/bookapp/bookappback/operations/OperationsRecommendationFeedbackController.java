package bookapp.bookappback.operations;

import bookapp.bookappback.common.dto.ApiResponse;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/operations/recommendation-feedback")
public class OperationsRecommendationFeedbackController {
    private static final int PAGE_SIZE = 30;
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    @GetMapping
    public ApiResponse<Page> list(@RequestParam(defaultValue = "0") int rating,
                                  @RequestParam(name = "before_id", defaultValue = "9223372036854775807") long beforeId) {
        if (rating < 0 || rating > 5 || beforeId <= 0) {
            throw new IllegalArgumentException("추천 피드백 조회 조건이 올바르지 않습니다.");
        }
        List<Entry> rows = jdbc.sql("""
                SELECT id, query, outcome, books, rating, comment, submitted_at
                FROM recommendation_feedback
                WHERE id < :beforeId AND (:rating = 0 OR rating = :rating)
                ORDER BY id DESC
                LIMIT :limit
                """).param("beforeId", beforeId).param("rating", rating).param("limit", PAGE_SIZE + 1)
                .query((rs, index) -> new Entry(rs.getLong("id"), rs.getString("query"), rs.getString("outcome"),
                        parseBooks(rs.getString("books")), rs.getInt("rating"), rs.getString("comment"),
                        rs.getObject("submitted_at", OffsetDateTime.class))).list();
        Page page = rows.size() <= PAGE_SIZE ? new Page(rows, null)
                : new Page(rows.subList(0, PAGE_SIZE), rows.get(PAGE_SIZE - 1).id());
        return new ApiResponse<>(true, "추천 피드백 조회 완료", page);
    }

    private JsonNode parseBooks(String json) throws SQLException {
        try {
            return mapper.readTree(json);
        } catch (JsonProcessingException invalid) {
            throw new SQLException("Invalid recommendation snapshot");
        }
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public void malformedRequest() {}

    @JsonNaming(PropertyNamingStrategies.LowerCamelCaseStrategy.class)
    public record Entry(long id, String query, String outcome, JsonNode books, int rating, String comment,
                        @JsonFormat(shape = JsonFormat.Shape.STRING) OffsetDateTime submittedAt) {}

    @JsonNaming(PropertyNamingStrategies.LowerCamelCaseStrategy.class)
    public record Page(List<Entry> items, Long nextBeforeId) {}
}
