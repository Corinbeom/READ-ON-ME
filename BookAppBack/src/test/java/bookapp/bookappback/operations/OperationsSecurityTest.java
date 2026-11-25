package bookapp.bookappback.operations;

import bookapp.bookappback.common.util.JwtUtil;
import bookapp.bookappback.config.JwtConfig;
import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.user.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.operations.admin-user-ids=5,12")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OperationsSecurityTest {
    @Autowired JwtConfig jwtConfig;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcClient jdbc;

    @Test
    void expiredSessionPromptsReauthenticationOnProtectedRoutesOnly() throws Exception {
        var expired = new JwtUtil(
                new JwtConfig(jwtConfig.getSecret(), -1000L));
        var bearer = "Bearer " + expired.generateToken(123L, "reader@example.test");
        mvc.perform(get("/api/users/profile").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));
        mvc.perform(get("/api/books/popular/naru").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());
    }

    @Test
    void anonymousAndRegularUsersCannotReadOrUpdateFeedback() throws Exception {
        mvc.perform(get("/api/operations/feedback")).andExpect(status().isForbidden());
        mvc.perform(get("/api/operations/summary").with(user(principal(7L))))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/operations/recommendation-feedback").with(user(principal(7L))))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/operations/feedback/1/status").with(user(principal(7L)))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REVIEWING\",\"version\":0}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void operationsShortcutChecksTheAuthenticatedAccount() throws Exception {
        String path = "/api/operations/access";
        mvc.perform(get(path)).andExpect(status().isForbidden());
        mvc.perform(get(path).with(user(principal(7L)))).andExpect(status().isForbidden());
        mvc.perform(get(path).with(user(principal(5L))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.user_id").value(5));
    }

    @Test
    @Transactional
    void userListIsRestrictedAndPaginatesOnlyTheAccountFieldsShownInOperations() throws Exception {
        String path = "/api/operations/users/list";
        mvc.perform(get(path)).andExpect(status().isForbidden());
        mvc.perform(get(path).with(user(principal(7L)))).andExpect(status().isForbidden());
        mvc.perform(get(path).with(user(principal(5L))).param("before_id", "0")).andExpect(status().isBadRequest());
        mvc.perform(get(path).with(user(principal(5L))).param("before_id", "abc")).andExpect(status().isBadRequest());

        LocalDateTime joinedAt = LocalDateTime.of(2026, 11, 19, 12, 30);
        for (int id = 2000; id < 2030; id++) {
            jdbc.sql("""
                    INSERT INTO users (id, email, password, nickname, created_at)
                    VALUES (:id, :email, 'fixture', :nickname, :joinedAt)
                    """).param("id", id).param("email", "reader-" + id + "@example.test")
                    .param("nickname", "reader-" + id).param("joinedAt", joinedAt).update();
        }
        jdbc.sql("""
                INSERT INTO users (id, kakao_id, nickname, created_at)
                VALUES (2030, 123987, 'KakaoUser', :joinedAt)
                """).param("joinedAt", joinedAt).update();

        mvc.perform(get(path).with(user(principal(5L))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(30))
                .andExpect(jsonPath("$.data.items[0].nickname").value("KakaoUser"))
                .andExpect(jsonPath("$.data.items[0].provider").value("KAKAO"))
                .andExpect(jsonPath("$.data.items[0].joinedAt").isString())
                .andExpect(jsonPath("$.data.items[0].kakao_id").doesNotExist())
                .andExpect(jsonPath("$.data.items[1].email").doesNotExist())
                .andExpect(jsonPath("$.data.items[1].password").doesNotExist())
                .andExpect(jsonPath("$.data.nextBeforeId").value(2001));
        mvc.perform(get(path).with(user(principal(5L))).param("before_id", "2001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(2000))
                .andExpect(jsonPath("$.data.items[0].provider").value("EMAIL"));
    }

    @Test
    @Transactional
    void userOverviewIsRestrictedAndCountsMembersOncePerActivity() throws Exception {
        String path = "/api/operations/users";
        mvc.perform(get(path)).andExpect(status().isForbidden());
        mvc.perform(get(path).with(user(principal(7L)))).andExpect(status().isForbidden());

        ZonedDateTime now = ZonedDateTime.now();
        jdbc.sql("""
                INSERT INTO users (id, email, password, kakao_id, nickname, created_at) VALUES
                    (901, 'overview@example.test', 'fixture', NULL, 'Overview01', :today),
                    (902, NULL, NULL, 98765, 'Overview02', :earlier),
                    (903, 'older@example.test', 'fixture', NULL, 'Overview03', :older)
                """).param("today", OperationsUserOverviewController.seoulDayStart(now, 0))
                .param("earlier", OperationsUserOverviewController.seoulDayStart(now, 6))
                .param("older", OperationsUserOverviewController.seoulDayStart(now, 7)).update();
        jdbc.sql("""
                INSERT INTO books (id, isbn13, title, embedded) VALUES
                    (901, '9780000000001', 'A', false), (902, '9780000000002', 'B', false)
                """).update();
        jdbc.sql("""
                INSERT INTO user_book_status (user_id, book_id, status) VALUES
                    (901, 901, 'TO_READ'), (901, 902, 'READING'), (902, 901, 'COMPLETED')
                """).update();
        insertOverviewJob(901, "SUCCEEDED", now.minusHours(1));
        insertOverviewJob(901, "FAILED", now.minusHours(2));
        insertOverviewJob(902, "QUEUED", now.minusHours(3));
        insertOverviewJob(903, "SUCCEEDED", now.minusHours(25));

        mvc.perform(get(path).with(user(principal(5L))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalUsers").value(3))
                .andExpect(jsonPath("$.data.joinedToday").value(1))
                .andExpect(jsonPath("$.data.joinedLastSevenDays").value(2))
                .andExpect(jsonPath("$.data.emailAccounts").value(2))
                .andExpect(jsonPath("$.data.kakaoAccounts").value(1))
                .andExpect(jsonPath("$.data.shelfUsers").value(2))
                .andExpect(jsonPath("$.data.toReadBooks").value(1))
                .andExpect(jsonPath("$.data.readingBooks").value(1))
                .andExpect(jsonPath("$.data.completedBooks").value(1))
                .andExpect(jsonPath("$.data.galpiUsersLastDay").value(2));
    }

    @Test
    void seoulMidnightIsConvertedToTheZoneUsedForStoredTimestamps() {
        var utc = ZonedDateTime.parse("2026-11-19T16:00:00Z");

        assertEquals(LocalDateTime.parse("2026-11-19T15:00"), OperationsUserOverviewController.seoulDayStart(utc, 0));
        assertEquals(LocalDateTime.parse("2026-11-13T15:00"), OperationsUserOverviewController.seoulDayStart(utc, 6));
    }

    private void insertOverviewJob(long userId, String status, ZonedDateTime time) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO ai_search_jobs (id, user_id, idempotency_key, query, status, created_at, expires_at)
                VALUES (:id, :userId, :key, 'overview fixture', :status, :createdAt, :expiresAt)
                """).param("id", id).param("userId", userId).param("key", id.toString()).param("status", status)
                .param("createdAt", time.toLocalDateTime()).param("expiresAt", time.plusHours(24).toLocalDateTime()).update();
    }

    @Test
    void allowedWebOriginCanReadTheAccessDenial() throws Exception {
        String origin = "http://localhost:8081";
        mvc.perform(get("/api/operations/summary").with(user(principal(7L))).header(HttpHeaders.ORIGIN, origin))
                .andExpect(status().isForbidden())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, origin));
        mvc.perform(get("/api/operations/summary").with(user(principal(5L)))
                        .header(HttpHeaders.ORIGIN, "https://untrusted.example.test"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void allowlistedUsersReachControllerValidation() throws Exception {
        mvc.perform(get("/api/operations/feedback").with(user(principal(5L))).param("status", "unknown"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/operations/recommendation-feedback").with(user(principal(5L))).param("rating", "6"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/operations/feedback/1/status").with(user(principal(12L)))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REVIEWING\",\"version\":-1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void recommendationRatingsRequireAuthenticationAndRejectInvalidSubmissionsBeforeTouchingTheJob() throws Exception {
        String path = "/api/ai/jobs/" + UUID.randomUUID() + "/feedback";
        mvc.perform(get(path)).andExpect(status().isForbidden());
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"rating\":5}"))
                .andExpect(status().isForbidden());
        mvc.perform(put(path).with(user(principal(7L))).contentType(MediaType.APPLICATION_JSON).content("{\"rating\":0}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put(path).with(user(principal(7L))).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":5,\"comment\":\"" + "가".repeat(501) + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void feedbackReceiptTimeIsAnIsoTimestampRatherThanNumericSeconds() {
        var created = OffsetDateTime.parse("2026-11-19T12:28:34Z");
        var feedback = new OperationsController.FeedbackItem(1, created, "ERROR", "feedback", "NEW", 0);
        var time = mapper.valueToTree(feedback).path("createdAt");

        assertTrue(time.isTextual());
        assertEquals(created, OffsetDateTime.parse(time.asText()));
    }

    private static UserDetailsImpl principal(long id) {
        var user = new User();
        user.setId(id);
        return new UserDetailsImpl(user);
    }
}
