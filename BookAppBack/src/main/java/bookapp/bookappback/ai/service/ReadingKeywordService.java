package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.dto.ReadingKeywordPickDto;
import bookapp.bookappback.ai.dto.ReadingTagsRequestDto;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.userbookstatus.dto.UserBookIsbnDto;
import bookapp.bookappback.userbookstatus.service.UserBookStatusService;
import io.netty.channel.ChannelOption;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Slf4j
public class ReadingKeywordService {

    private final WebClient webClient;
    private final UserBookStatusService userBookStatusService;
    private final BookRepository bookRepository;
    private final String internalToken;

    public ReadingKeywordService(
            WebClient.Builder webClientBuilder,
            @Value("${ai.base-url}") String aiBaseUrl,
            UserBookStatusService userBookStatusService,
            BookRepository bookRepository,
            @Value("${internal.api.token:}") String internalToken
    ) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3_000)
                .responseTimeout(Duration.ofSeconds(15));

        this.webClient = webClientBuilder
                .baseUrl(aiBaseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();

        this.userBookStatusService = userBookStatusService;
        this.bookRepository = bookRepository;
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
            return result != null ? result : Map.of("keywords", Collections.emptyList(), "analyzed", 0);
        } catch (Exception e) {
            log.warn("독서 키워드 집계 FastAPI 호출 실패: {}", e.getMessage());
            return Map.of("keywords", Collections.emptyList(), "analyzed", 0);
        }
    }

    public Mono<List<ReadingKeywordPickDto>> getPublicPicks(List<String> keywords) {
        return webClient.post()
                .uri("/api/books/reading-keyword-picks")
                .headers(this::setInternalToken)
                .bodyValue(Map.of("keywords", keywords))
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<String>>() {})
                .flatMap(isbns -> Mono.fromCallable(() -> findAvailablePicks(isbns)).subscribeOn(Schedulers.boundedElastic()))
                .timeout(Duration.ofSeconds(3));
    }

    private List<ReadingKeywordPickDto> findAvailablePicks(List<String> isbns) {
        if (isbns.isEmpty()) {
            return List.of();
        }
        var available = bookRepository.findReadingKeywordPicks(isbns).stream()
                .collect(Collectors.toMap(ReadingKeywordPickDto::isbn13, Function.identity()));
        return isbns.stream().map(available::get).filter(Objects::nonNull).limit(3).toList();
    }

    private void setInternalToken(HttpHeaders headers) {
        if (internalToken != null && !internalToken.isBlank()) {
            headers.set("X-Internal-Token", internalToken);
        }
    }
}
