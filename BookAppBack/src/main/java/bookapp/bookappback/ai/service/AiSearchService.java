package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.dto.AiSearchRequestDto;
import io.netty.channel.ChannelOption;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import reactor.core.publisher.Mono;

@Service
public class AiSearchService {

    private final WebClient webClient;
    private final String internalToken;

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

    public Mono<List<?>> search(String query) {
        return search(query, UUID.randomUUID().toString());
    }

    public Mono<List<?>> search(String query, String requestId) {
        return webClient.post()
                    .uri("/api/ai/search")
                    .headers(headers -> {
                        if (internalToken != null && !internalToken.isBlank()) {
                            headers.set("X-Internal-Token", internalToken);
                        }
                        headers.set("X-Request-ID", requestId);
                    })
                    .bodyValue(new AiSearchRequestDto(query))
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<List<?>>() {})
                    .switchIfEmpty(Mono.error(new IllegalStateException("AI search returned no body")))
                    .timeout(Duration.ofSeconds(60));
    }
}
