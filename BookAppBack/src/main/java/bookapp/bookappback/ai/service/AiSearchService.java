package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.dto.AiSearchRequestDto;
import io.netty.channel.ChannelOption;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.List;

@Service
@Slf4j
public class AiSearchService {

    private final WebClient webClient;

    public AiSearchService(
            WebClient.Builder webClientBuilder,
            @Value("${ai.base-url}") String aiBaseUrl
    ) {
        // AI 서비스는 임베딩 연산이 있어 응답이 느릴 수 있으므로 30초로 설정
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3_000)
                .responseTimeout(Duration.ofSeconds(30));

        this.webClient = webClientBuilder
                .baseUrl(aiBaseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    public List<?> search(AiSearchRequestDto requestDto) {
        log.info("Sending AI search request to FastAPI with query: {}", requestDto.getQuery());
        try {
            return webClient.post()
                    .uri("/api/ai/search")
                    .bodyValue(requestDto)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<List<?>>() {})
                    .block();
        } catch (Exception e) {
            log.error("FastAPI AI search 호출 실패: {}", e.getMessage());
            throw new RuntimeException("AI search failed", e);
        }
    }
}
