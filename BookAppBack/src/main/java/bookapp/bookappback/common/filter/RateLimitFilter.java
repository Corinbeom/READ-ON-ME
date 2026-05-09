package bookapp.bookappback.common.filter;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * IP 기반 Rate Limiting 필터.
 * 퍼블릭 검색 API의 무제한 호출을 방지한다.
 *
 * - /api/books/search : 분당 60회
 * - /api/ai/search    : 분당 20회
 */
@Slf4j
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    // IP별 버킷 저장 (추후 Redis 기반으로 교체 가능)
    private final Map<String, Bucket> bookSearchBuckets = new ConcurrentHashMap<>();
    private final Map<String, Bucket> aiSearchBuckets   = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String path = request.getRequestURI();

        if (path.startsWith("/api/books/search")) {
            if (!tryConsume(bookSearchBuckets, getClientIp(request), 60)) {
                rejectRequest(response, "/api/books/search");
                return;
            }
        } else if (path.startsWith("/api/ai/search")) {
            if (!tryConsume(aiSearchBuckets, getClientIp(request), 20)) {
                rejectRequest(response, "/api/ai/search");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean tryConsume(Map<String, Bucket> bucketMap, String ip, long capacity) {
        Bucket bucket = bucketMap.computeIfAbsent(ip, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(capacity)
                                .refillGreedy(capacity, Duration.ofMinutes(1))
                                .build())
                        .build()
        );
        return bucket.tryConsume(1);
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
