package bookapp.bookappback.common.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;

/**
 * IP 기반 Rate Limiting 필터 — Redis INCR/EXPIRE 사용.
 *
 * - /api/books/search : 분당 60회
 * - /api/ai/search    : 분당 20회
 *
 * Redis 키: "rate:{endpoint}:{ip}" — TTL 1분
 * INCR은 원자적 연산이므로 다중 인스턴스 환경에서도 안전.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final StringRedisTemplate redisTemplate;

    private static final long BOOK_SEARCH_LIMIT = 60;
    private static final long AI_SEARCH_LIMIT    = 20;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String path = request.getRequestURI();

        if (path.startsWith("/api/books/search")) {
            if (!tryConsume(getClientIp(request), "book-search", BOOK_SEARCH_LIMIT)) {
                rejectRequest(response, path);
                return;
            }
        } else if (path.startsWith("/api/ai/search")) {
            if (!tryConsume(getClientIp(request), "ai-search", AI_SEARCH_LIMIT)) {
                rejectRequest(response, path);
                return;
            }
        }

        filterChain.doFilter(request, response);
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
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"요청이 너무 많습니다. 잠시 후 다시 시도해주세요.\"}");
    }

    private String getClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
