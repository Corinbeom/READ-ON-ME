package bookapp.bookappback.operations;

import bookapp.bookappback.common.dto.ApiResponse;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/operations/users")
public class OperationsUserOverviewController {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
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

    static LocalDateTime seoulDayStart(ZonedDateTime now, int daysAgo) {
        return now.withZoneSameInstant(SEOUL).toLocalDate().minusDays(daysAgo)
                .atStartOfDay(SEOUL).withZoneSameInstant(now.getZone()).toLocalDateTime();
    }

    @JsonNaming(PropertyNamingStrategies.LowerCamelCaseStrategy.class)
    public record UserOverview(long totalUsers, long joinedToday, long joinedLastSevenDays,
                               long emailAccounts, long kakaoAccounts, long shelfUsers,
                               long toReadBooks, long readingBooks, long completedBooks, long galpiUsersLastDay) {}
}
