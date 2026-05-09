package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import io.netty.channel.ChannelOption;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

@Service
public class KakaoBookService {

    private final WebClient webClient;

    @Value("${kakao.api.key}")
    private String kakaoApiKey;

    public KakaoBookService() {
        // 커넥션 타임아웃 3초, 응답 타임아웃 5초
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3_000)
                .responseTimeout(Duration.ofSeconds(5));

        this.webClient = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    // 테스트용 생성자
    public KakaoBookService(WebClient webClient) {
        this.webClient = webClient;
    }

    public Mono<KakaoBookSearchResponse> searchBooks(
            String query,
            int page,
            int size,
            String sort,
            String target
    ) {
        return webClient.get()
                .uri(uriBuilder -> {
                    var builder = uriBuilder
                            .scheme("https")
                            .host("dapi.kakao.com")
                            .path("/v3/search/book")
                            .queryParam("query", query)
                            .queryParam("page", page)
                            .queryParam("size", size)
                            .queryParam("sort", sort);

                    if (target != null) {
                        builder.queryParam("target", target);
                    }

                    return builder.build();
                })
                .header("Authorization", "KakaoAK " + kakaoApiKey)
                .retrieve()
                .bodyToMono(KakaoBookSearchResponse.class);
    }

    public Mono<KakaoBookSearchResponse> searchBooks(String query) {
        return searchBooks(query, 1, 10, "accuracy", null);
    }

    public Mono<KakaoBookSearchResponse> searchBookByIsbn(String isbn) {
        return searchBooks(isbn, 1, 1, "accuracy", "isbn");
    }
}