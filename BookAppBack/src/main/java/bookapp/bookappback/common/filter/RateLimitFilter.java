package bookapp.bookappback.common.filter;

import bookapp.bookappback.ai.service.GalpiAvailability;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataAccessException;
import org.springframework.security.core.context.SecurityContextHolder;
import bookapp.bookappback.security.UserDetailsImpl;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;

/**
 * 로그인 사용자는 사용자 ID, 익명 도서 검색은 연결 IP를 기준으로 Redis INCR/EXPIRE 사용.
 *
 * - /api/books/search, /api/books/reading-keyword-picks : 각각 분당 60회
 * - POST /api/ai/search, /api/ai/jobs : 사용자별 분당 20회 (조회 폴링 제외)
 *
 * Redis 키: "rate:{endpoint}:{subject}" — TTL 1분
 * INCR은 원자적 연산이므로 다중 인스턴스 환경에서도 안전.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final StringRedisTemplate redisTemplate;
    private final GalpiAvailability availability;

    private static final long BOOK_SEARCH_LIMIT = 60;
    private static final long AI_SEARCH_LIMIT    = 20;
    private static final long KAKAO_LOGIN_LIMIT = 30;
    private static final long FEEDBACK_LIMIT = 20;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String path = request.getRequestURI();

        boolean keywordPicks = "GET".equals(request.getMethod()) && path.equals("/api/books/reading-keyword-picks");
        if (path.startsWith("/api/books/search") || keywordPicks) {
            String endpoint = keywordPicks ? "reading-keyword-picks" : "book-search";
            if (!consumeOrRespond(request, response, endpoint, BOOK_SEARCH_LIMIT)) {
                return;
            }
        } else if ("POST".equals(request.getMethod()) &&
                (path.equals("/api/users/kakao/start") || path.equals("/api/users/kakao/exchange"))) {
            if (!consumeOrRespond(request, response, path.endsWith("/start") ? "kakao-start" : "kakao-exchange", KAKAO_LOGIN_LIMIT)) {
                return;
            }
        } else if ("POST".equals(request.getMethod()) && path.equals("/api/feedback")) {
            if (!consumeOrRespond(request, response, "feedback", FEEDBACK_LIMIT)) return;
        } else if ("POST".equals(request.getMethod()) &&
                (path.equals("/api/ai/search") || path.equals("/api/ai/jobs"))) {
            // Authorization rejects anonymous AI requests; do not spend Redis/API quota on them.
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (!availability.underMaintenance() && auth != null && auth.getPrincipal() instanceof UserDetailsImpl &&
                    !consumeOrRespond(request, response, "ai-search", AI_SEARCH_LIMIT)) {
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean consumeOrRespond(HttpServletRequest request, HttpServletResponse response,
                                     String endpoint, long limit) throws IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        String subject = auth != null && auth.getPrincipal() instanceof UserDetailsImpl principal
                ? "user:" + principal.getUser().getId() : "ip:" + request.getRemoteAddr();
        try {
            if (tryConsume(subject, endpoint, limit)) return true;
            rejectRequest(response, request.getRequestURI());
        } catch (DataAccessException error) {
            log.warn("Rate limit store unavailable endpoint={}", endpoint);
            response.setStatus(HttpStatus.SERVICE_UNAVAILABLE.value());
            response.setHeader("Retry-After", "5");
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"요청을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.\"}");
        }
        return false;
    }

    private boolean tryConsume(String ip, String endpoint, long limit) {
        String key = "rate:" + endpoint + ":" + ip;
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1) {
            redisTemplate.expire(key, Duration.ofMinutes(1));
        }
        return count != null && count <= limit;
    }

    private void rejectRequest(HttpServletResponse response, String path) throws IOException {
        log.warn("Rate limit 초과 [path={}]", path);
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", "60");
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"요청이 너무 많습니다. 잠시 후 다시 시도해주세요.\"}");
    }

}
