package bookapp.bookappback.operations;

import bookapp.bookappback.common.dto.ApiResponse;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/operations/users")
public class OperationsUserOverviewController {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final int PAGE_SIZE = 30;
    private final JdbcClient jdbc;

    @GetMapping
    public ApiResponse<UserOverview> overview() {
        ZonedDateTime now = ZonedDateTime.now();
        UserOverview overview = jdbc.sql("""
                WITH accounts AS (
                    SELECT count(*) AS total_users,
                           count(CASE WHEN created_at >= :today AND created_at <= :now THEN 1 END) AS joined_today,
                           count(CASE WHEN created_at >= :week AND created_at <= :now THEN 1 END) AS joined_last_seven_days,
                           count(CASE WHEN kakao_id IS NULL THEN 1 END) AS email_accounts,
                           count(kakao_id) AS kakao_accounts
                    FROM users
                ), shelf AS (
                    SELECT count(DISTINCT user_id) AS shelf_users,
                           count(CASE WHEN status = 'TO_READ' THEN 1 END) AS to_read_books,
                           count(CASE WHEN status = 'READING' THEN 1 END) AS reading_books,
                           count(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed_books
                    FROM user_book_status
                ), galpi AS (
                    SELECT count(DISTINCT user_id) AS galpi_users_last_day
                    FROM ai_search_jobs
                    WHERE created_at >= :lastDay AND created_at <= :now
                )
                SELECT accounts.*, shelf.*, galpi.*
                FROM accounts CROSS JOIN shelf CROSS JOIN galpi
                """)
                .param("today", seoulDayStart(now, 0))
                .param("week", seoulDayStart(now, 6))
                .param("lastDay", now.minusHours(24).toLocalDateTime())
                .param("now", now.toLocalDateTime())
                .query(UserOverview.class).single();
        return new ApiResponse<>(true, "유저 현황 조회 완료", overview);
    }

    @GetMapping("/list")
    public ApiResponse<UserPage> list(@RequestParam(name = "before_id", defaultValue = "9223372036854775807") long beforeId) {
        if (beforeId <= 0) throw new IllegalArgumentException("유저 목록 조회 위치가 올바르지 않습니다.");
        ZoneId storageZone = ZoneId.systemDefault();
        var rows = jdbc.sql("""
                SELECT id, nickname, created_at, kakao_id IS NOT NULL AS kakao_account
                FROM users
                WHERE id < :beforeId
                ORDER BY id DESC
                LIMIT :limit
                """).param("beforeId", beforeId).param("limit", PAGE_SIZE + 1)
                .query((row, index) -> new UserItem(row.getLong("id"), row.getString("nickname"),
                        row.getObject("created_at", LocalDateTime.class).atZone(storageZone).toOffsetDateTime(),
                        row.getBoolean("kakao_account") ? "KAKAO" : "EMAIL")).list();
        UserPage page = rows.size() <= PAGE_SIZE ? new UserPage(rows, null)
                : new UserPage(rows.subList(0, PAGE_SIZE), rows.get(PAGE_SIZE - 1).id());
        return new ApiResponse<>(true, "유저 목록 조회 완료", page);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public void malformedRequest() {}

    static LocalDateTime seoulDayStart(ZonedDateTime now, int daysAgo) {
        return now.withZoneSameInstant(SEOUL).toLocalDate().minusDays(daysAgo)
                .atStartOfDay(SEOUL).withZoneSameInstant(now.getZone()).toLocalDateTime();
    }

    @JsonNaming(PropertyNamingStrategies.LowerCamelCaseStrategy.class)
    public record UserOverview(long totalUsers, long joinedToday, long joinedLastSevenDays,
                               long emailAccounts, long kakaoAccounts, long shelfUsers,
                               long toReadBooks, long readingBooks, long completedBooks, long galpiUsersLastDay) {}

    @JsonNaming(PropertyNamingStrategies.LowerCamelCaseStrategy.class)
    public record UserItem(long id, String nickname, @JsonFormat(shape = JsonFormat.Shape.STRING) OffsetDateTime joinedAt,
                           String provider) {}

    @JsonNaming(PropertyNamingStrategies.LowerCamelCaseStrategy.class)
    public record UserPage(List<UserItem> items, Long nextBeforeId) {}
}
