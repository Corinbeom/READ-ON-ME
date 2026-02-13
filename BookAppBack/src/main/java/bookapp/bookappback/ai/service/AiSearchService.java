package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.dto.AiSearchRequestDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class AiSearchService {

    private final WebClient webClient;

    public AiSearchService(
            WebClient.Builder webClientBuilder,
            @Value("${ai.base-url}") String aiBaseUrl
    ) {
        this.webClient = webClientBuilder.baseUrl(aiBaseUrl).build();
    }

    public List<?> search(AiSearchRequestDto requestDto) {
        log.info("Sending AI search request to FastAPI with query: {}", requestDto.getQuery());
        try {
            return webClient.post()
                    .uri("/api/ai/search")
                    .bodyValue(requestDto)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<List<?>>() {})
                    .block(); // 결과를 받을 때까지 동기적으로 대기
        } catch (Exception e) {
            log.error("❌ Failed to call FastAPI AI search: {}", e.getMessage());
            // 실제 프로덕션에서는 좀 더 정교한 예외 처리가 필요합니다.
            throw new RuntimeException("AI search failed", e);
        }
    }
}
