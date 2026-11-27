package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.dto.DailyBookChoice;
import bookapp.bookappback.ai.dto.ReadingKeywordPickDto;
import bookapp.bookappback.ai.dto.ReadingTagsRequestDto;
import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.recommendation.dto.HomeRecommendations;
import bookapp.bookappback.userbookstatus.dto.UserBookIsbnDto;
import bookapp.bookappback.userbookstatus.service.UserBookStatusService;
import io.netty.channel.ChannelOption;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@Slf4j
public class ReadingKeywordService {

    private final GalpiAvailability availability;
    private final WebClient webClient;
    private final UserBookStatusService userBookStatusService;
    private final String internalToken;

    public ReadingKeywordService(
            GalpiAvailability availability,
            WebClient.Builder webClientBuilder,
            @Value("${ai.base-url}") String aiBaseUrl,
            UserBookStatusService userBookStatusService,
            @Value("${internal.api.token:}") String internalToken
    ) {
        this.availability = availability;
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3_000)
                .responseTimeout(Duration.ofSeconds(15));

        this.webClient = webClientBuilder
                .baseUrl(aiBaseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();

        this.userBookStatusService = userBookStatusService;
        this.internalToken = internalToken;
    }

    /**
     * 유저의 READING + COMPLETED 도서 isbn을 기반으로 독서 키워드를 집계한다.
     *
     * @param userId 유저 ID
     * @return 키워드별 책 수와 근거 ISBN 목록, 분석한 책 수
     */
    public Map<String, Object> getReadingKeywords(Long userId) {
        List<UserBookIsbnDto> userBooks = userBookStatusService.getUserBooksWithIsbn(userId);

        List<String> isbns = userBooks.stream()
                .filter(b -> "READING".equals(b.getStatus()) || "COMPLETED".equals(b.getStatus()))
                .map(UserBookIsbnDto::getIsbn)
                .filter(isbn -> isbn != null && !isbn.isBlank())
                .collect(Collectors.toList());

        if (isbns.isEmpty()) {
            return Map.of("keywords", Collections.emptyList(), "analyzed", 0);
        }

        ReadingTagsRequestDto requestDto = new ReadingTagsRequestDto(isbns, 12);
        try {
            Map<String, Object> result = webClient.post()
                    .uri("/api/user/reading-tags")
                    .headers(this::setInternalToken)
                    .bodyValue(requestDto)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                    .block();
            return Objects.requireNonNull(result, "Empty keyword response");
        } catch (Exception e) {
            log.warn("독서 키워드 집계 FastAPI 호출 실패: {}", e.getMessage());
            throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "KEYWORDS_UNAVAILABLE", "독서 키워드를 불러오지 못했어요.");
        }
    }

    public Mono<List<ReadingKeywordPickDto>> getPublicPicks(List<String> keywords) {
        if (availability.release().isBlank()) return Mono.just(List.of());
        return webClient.post()
                .uri("/api/books/reading-keyword-picks")
                .header("X-Reviewed-Release", availability.release())
                .headers(this::setInternalToken)
                .bodyValue(Map.of("keywords", keywords))
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<ReadingKeywordPickDto>>() {})
                .timeout(Duration.ofSeconds(15));
    }

    public Mono<List<DailyBookChoice>> getDailyChoices() {
        if (availability.release().isBlank()) return Mono.just(List.of());
        return webClient.get()
                .uri("/api/books/daily-choices")
                .header("X-Reviewed-Release", availability.release())
                .headers(this::setInternalToken)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<DailyBookChoice>>() {})
                .timeout(Duration.ofSeconds(10));
    }

    public HomeRecommendations getHomePicks(List<String> reading, List<String> owned, List<String> peers) {
        if (availability.release().isBlank()) return HomeRecommendations.empty();
        try {
            return Objects.requireNonNull(webClient.post()
                    .uri("/api/user/home-picks")
                    .header("X-Reviewed-Release", availability.release())
                    .headers(this::setInternalToken)
                    .bodyValue(Map.of("reading", reading, "owned", owned, "peers", peers))
                    .retrieve()
                    .bodyToMono(HomeRecommendations.class)
                    .timeout(Duration.ofSeconds(15)).block());
        } catch (Exception e) {
            throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "HOME_RECOMMENDATIONS_UNAVAILABLE",
                    "추천 책을 불러오지 못했어요.");
        }
    }

    private void setInternalToken(HttpHeaders headers) {
        if (internalToken != null && !internalToken.isBlank()) {
            headers.set("X-Internal-Token", internalToken);
        }
    }
}
