package bookapp.bookappback.operations;

import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.user.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.operations.admin-user-ids=5,12")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OperationsSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

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
