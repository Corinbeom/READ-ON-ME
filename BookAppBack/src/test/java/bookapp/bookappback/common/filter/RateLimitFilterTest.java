package bookapp.bookappback.common.filter;

import bookapp.bookappback.ai.service.GalpiAvailability;
import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.user.entity.User;
import jakarta.servlet.FilterChain;
import bookapp.bookappback.ai.service.AiSearchService;
import bookapp.bookappback.common.exception.AppException;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RateLimitFilterTest {
    StringRedisTemplate redis;
    ValueOperations<String, String> values;
    RateLimitFilter filter;
    AiSearchService ai;
    GalpiAvailability availability;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setup() {
        redis = mock(StringRedisTemplate.class);
        values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(values.increment(anyString())).thenReturn(1L);
        ai = mock(AiSearchService.class);
        when(ai.releaseState("release")).thenReturn(GalpiAvailability.State.AVAILABLE);
        availability = new GalpiAvailability(ai, "release");
        filter = new RateLimitFilter(redis, availability);
    }

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    void authenticate(long id) {
        var user = new User();
        user.setId(id);
        var principal = new UserDetailsImpl(user);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    @Test
    void searchAndJobSubmissionsShareUserLimitButPollingDoesNotConsumeIt() throws Exception {
        authenticate(7L);
        for (String path : new String[]{"/api/ai/search", "/api/ai/jobs"}) {
            filter.doFilter(new MockHttpServletRequest("POST", path), new MockHttpServletResponse(), mock(FilterChain.class));
        }
        filter.doFilter(new MockHttpServletRequest("GET", "/api/ai/jobs/recent"), new MockHttpServletResponse(), mock(FilterChain.class));
        verify(values, times(2)).increment("rate:ai-search:user:7");
    }

    @Test
    void shareOneAdmissionCheckOnlyWithinEachAuthenticatedSubmission() throws Exception {
        authenticate(7L);
        when(ai.releaseState("release")).thenReturn(GalpiAvailability.State.AVAILABLE,
                GalpiAvailability.State.UNCONFIRMED, GalpiAvailability.State.MAINTENANCE);
        for (String expected : new String[]{"ok", "AI_STATUS_UNAVAILABLE", "AI_SEARCH_MAINTENANCE"}) {
            var request = new MockHttpServletRequest("POST", "/api/ai/jobs");
            var attributes = new ServletRequestAttributes(request);
            RequestContextHolder.setRequestAttributes(attributes);
            try {
                filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
                    if ("ok".equals(expected)) availability.requireAvailable();
                    else assertEquals(expected, assertThrows(
                            AppException.class, availability::requireAvailable).getCode());
                });
            } finally {
                RequestContextHolder.resetRequestAttributes();
            }
        }
        verify(ai, times(3)).releaseState("release");
        verify(values).increment("rate:ai-search:user:7");
        availability.state(); // dispatch and result reads must check again
        verify(ai, times(4)).releaseState("release");
    }

    @Test
    void forwardedHeaderCannotChangeAnonymousBookSearchBudget() throws Exception {
        for (String forwarded : new String[]{"1.2.3.4", "5.6.7.8"}) {
            var request = new MockHttpServletRequest("GET", "/api/books/search");
            request.setRemoteAddr("10.0.0.2");
            request.addHeader("X-Forwarded-For", forwarded);
            filter.doFilter(request, new MockHttpServletResponse(), mock(FilterChain.class));
        }
        verify(values, times(2)).increment("rate:book-search:ip:10.0.0.2");
    }

    @Test
    void overLimitAndUnavailableStoreNeverReachExpensiveApi() throws Exception {
        authenticate(7L);
        var chain = mock(FilterChain.class);
        var response = new MockHttpServletResponse();
        when(values.increment(anyString())).thenReturn(21L);
        filter.doFilter(new MockHttpServletRequest("POST", "/api/ai/jobs"), response, chain);
        assertEquals(429, response.getStatus());
        assertEquals("60", response.getHeader("Retry-After"));
        verifyNoInteractions(chain);

        response = new MockHttpServletResponse();
        when(values.increment(anyString())).thenThrow(new RedisConnectionFailureException("unavailable"));
        filter.doFilter(new MockHttpServletRequest("POST", "/api/ai/search"), response, chain);
        assertEquals(503, response.getStatus());
        verifyNoInteractions(chain);
    }

    @Test
    void anonymousFeedbackUsesItsOwnBoundedBudget() throws Exception {
        var chain = mock(FilterChain.class);
        var request = new MockHttpServletRequest("POST", "/api/feedback");
        request.setRemoteAddr("10.0.0.2");
        when(values.increment("rate:feedback:ip:10.0.0.2")).thenReturn(21L);
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertEquals(429, response.getStatus());
        verifyNoInteractions(chain);
    }
}
