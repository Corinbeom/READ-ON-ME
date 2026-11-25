package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.dto.AiSearchRequestDto;
import bookapp.bookappback.ai.dto.AiSearchOutcome;
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
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import reactor.core.publisher.Mono;

@Slf4j
@Service
public class AiSearchService {

    private final WebClient webClient;
    private final String internalToken;
    @Value("${galpi.reviewed-release:}")
    private String release = "";

    public AiSearchService(
            WebClient.Builder webClientBuilder,
            @Value("${ai.base-url}") String aiBaseUrl,
            @Value("${internal.api.token:}") String internalToken
    ) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3_000)
                .responseTimeout(Duration.ofSeconds(65));

        this.webClient = webClientBuilder
                .baseUrl(aiBaseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
        this.internalToken = internalToken;
    }

    public GalpiAvailability.State releaseState(String expected) {
        return webClient.get().uri("/api/ai/reviewed-release")
                .header("X-Internal-Token", internalToken)
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(com.fasterxml.jackson.databind.JsonNode.class).map(body -> {
                            var releaseId = body.path("release");
                            if (!releaseId.isTextual() || releaseId.asText().isBlank()) return GalpiAvailability.State.UNCONFIRMED;
                            return expected.equals(releaseId.asText()) ? GalpiAvailability.State.AVAILABLE : GalpiAvailability.State.MAINTENANCE;
                        });
                    }
                    if (response.statusCode().value() == 503) {
                        return response.bodyToMono(com.fasterxml.jackson.databind.JsonNode.class)
                                .map(body -> GalpiAvailability.MAINTENANCE.equals(body.path("code").asText())
                                        ? GalpiAvailability.State.MAINTENANCE : GalpiAvailability.State.UNCONFIRMED);
                    }
                    return Mono.just(GalpiAvailability.State.UNCONFIRMED);
                })
                .defaultIfEmpty(GalpiAvailability.State.UNCONFIRMED)
                .timeout(Duration.ofSeconds(3)).onErrorReturn(GalpiAvailability.State.UNCONFIRMED).block();
    }

    public bookapp.bookappback.book.entity.Book reviewedDetail(String isbn, String release) {
        if (release.isBlank()) return null;
        return webClient.get().uri("/api/ai/reviewed-books/{isbn}", isbn)
                .header("X-Internal-Token", internalToken)
                .header("X-Reviewed-Release", release).retrieve()
                .bodyToMono(bookapp.bookappback.book.entity.Book.class)
                .filter(book -> isbn.equals(book.getIsbn13()) && book.getTitle() != null)
                .timeout(Duration.ofSeconds(3)).onErrorResume(error -> Mono.empty()).block();
    }

    public Mono<List<?>> search(String query) {
        return search(query, UUID.randomUUID().toString());
    }

    public Mono<List<?>> search(String query, String requestId) {
        return searchWithOutcome(query, requestId).map(AiSearchOutcome::books);
    }

    public Mono<AiSearchOutcome> searchWithOutcome(String query, String requestId) {
        return webClient.post()
                    .uri("/api/ai/search")
                    .headers(headers -> {
                        if (internalToken != null && !internalToken.isBlank()) {
                            headers.set("X-Internal-Token", internalToken);
                        }
                        headers.set("X-Request-ID", requestId);
                        headers.set("X-Reviewed-Release", release);
                    })
                    .bodyValue(new AiSearchRequestDto(query))
                    .exchangeToMono(response -> {
                        long headersAt = System.nanoTime();
                        log.info("reviewed_http_headers request_id={} status={}", requestId, response.statusCode().value());
                        if (response.statusCode().value() >= 400) return response.createError();
                        return response.toEntity(new ParameterizedTypeReference<List<?>>() {})
                                .doOnNext(entity -> log.info("reviewed_http_body request_id={} decode_ms={}", requestId,
                                        TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - headersAt)));
                    })
                    .map(response -> {
                        List<?> books = response.getBody();
                        if (books == null) throw new IllegalStateException("AI search returned no body");
                        String status = response.getHeaders().getFirst("X-Search-Outcome");
                        if (status == null) throw new IllegalStateException("AI search returned no outcome");
                        return new AiSearchOutcome(
                                books, status,
                                response.getHeaders().getFirst("X-Search-Reason"),
                                response.getHeaders().getFirst("X-Search-Basis")
                        );
                    })
                    .switchIfEmpty(Mono.error(new IllegalStateException("AI search returned no body")))
                    .timeout(Duration.ofSeconds(60));
    }
}
