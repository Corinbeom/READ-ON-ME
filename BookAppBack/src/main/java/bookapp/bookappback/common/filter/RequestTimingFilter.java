package bookapp.bookappback.common.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * 포트폴리오/운영 관점의 기본 관측(Observability)을 위해
 * 요청 단위 latency/상태코드/요청ID를 구조화 로그로 남깁니다.
 *
 * - request_id: 클라이언트가 X-Request-Id를 주면 그대로 사용, 없으면 생성
 * - latency_ms: 처리 시간(ms)
 */
@Component
@Slf4j
public class RequestTimingFilter extends OncePerRequestFilter {

    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String MDC_KEY = "request_id";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        long start = System.nanoTime();

        String requestId = request.getHeader(REQUEST_ID_HEADER);
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }

        MDC.put(MDC_KEY, requestId);
        response.setHeader(REQUEST_ID_HEADER, requestId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            int status = response.getStatus();
            String method = request.getMethod();
            String path = request.getRequestURI();
            String query = request.getQueryString();

            // JSON-ish 형태로 로그를 남기면 나중에 grep/집계하기 쉽습니다.
            log.info("request_completed method={} path={} query={} status={} latency_ms={} request_id={}",
                    method,
                    path,
                    query,
                    status,
                    elapsedMs,
                    requestId
            );

            MDC.remove(MDC_KEY);
        }
    }
}








