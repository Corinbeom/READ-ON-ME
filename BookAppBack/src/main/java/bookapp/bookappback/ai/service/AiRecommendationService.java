package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.dto.ContentRecommendRequestDto;
import bookapp.bookappback.userbookstatus.dto.UserBookIsbnDto;
import io.netty.channel.ChannelOption;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.Collections;
import java.util.List;

/**
 * FastAPI /recommendations/content 를 호출해
 * Content-based 추천 ISBN 목록을 가져온다.
 *
 * 실패(타임아웃, 서버 다운 등) 시 빈 리스트를 반환해
 * RecommendationService 가 CF-only 로 폴백할 수 있게 한다.
 */
@Service
@Slf4j
public class AiRecommendationService {

    private final WebClient webClient;

    public AiRecommendationService(
            WebClient.Builder webClientBuilder,
            @Value("${ai.base-url}") String aiBaseUrl
    ) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3_000)
                .responseTimeout(Duration.ofSeconds(15));

        this.webClient = webClientBuilder
                .baseUrl(aiBaseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    /**
     * @param userBooks 유저 독서 목록 (isbn + status)
     * @param limit     요청할 추천 수
     * @return 추천 ISBN 목록 (유사도 내림차순). 실패 시 빈 리스트.
     */
    public List<String> getContentRecommendations(List<UserBookIsbnDto> userBooks, int limit) {
        if (userBooks == null || userBooks.isEmpty()) {
            return Collections.emptyList();
        }

        ContentRecommendRequestDto requestDto = new ContentRecommendRequestDto(userBooks, limit);
        try {
            List<String> result = webClient.post()
                    .uri("/recommendations/content")
                    .bodyValue(requestDto)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<List<String>>() {})
                    .block();
            return result != null ? result : Collections.emptyList();
        } catch (Exception e) {
            log.warn("Content-based 추천 FastAPI 호출 실패 — CF-only 폴백: {}", e.getMessage());
            return Collections.emptyList();
        }
    }
}
