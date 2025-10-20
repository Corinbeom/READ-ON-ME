package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@Service
public class KakaoBookService {

    private final WebClient webClient;

    @Value("${kakao.api.key}")
    private String kakaoApiKey;

    public KakaoBookService() {
        this.webClient = WebClient.builder().build();
    }

    // Constructor for dependency injection (if needed)
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

                    // target이 있으면 추가
                    if (target != null) {
                        builder.queryParam("target", target);
                    }

                    return builder.build();
                })
                .header("Authorization", "KakaoAK " + kakaoApiKey)
                .retrieve()
                .bodyToMono(KakaoBookSearchResponse.class);
    }

    // Overloaded method with default parameters
    public Mono<KakaoBookSearchResponse> searchBooks(String query) {
        return searchBooks(query, 1, 10, "accuracy", null);
    }

    public Mono<KakaoBookSearchResponse> searchBookByIsbn(String isbn) {
        return searchBooks(isbn, 1, 1, "accuracy", "isbn");
    }
}