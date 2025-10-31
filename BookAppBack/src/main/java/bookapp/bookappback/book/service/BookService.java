package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.scheduler.Schedulers;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Slf4j
public class BookService {

    private final BookRepository bookRepository;
    private final KakaoBookService kakaoBookService;
    private final WebClient.Builder webClientBuilder;

    private static final String FASTAPI_URL = "http://localhost:8000";

    @Autowired
    public BookService(BookRepository bookRepository, KakaoBookService kakaoBookService, WebClient.Builder webClientBuilder) {
        this.bookRepository = bookRepository;
        this.kakaoBookService = kakaoBookService;
        this.webClientBuilder = webClientBuilder;
    }


    // ✅ 카카오 API에서 책 검색 (동기식)
    @Cacheable(value = "bookSearchCache", key = "#query + #page + #size + #sort + #target")
    public KakaoBookSearchResponse searchBooksFromKakao(
            String query, int page, int size, String sort, String target
    ) {
        try {
            return kakaoBookService.searchBooks(query, page, size, sort, target)
                    .retryWhen(Retry.fixedDelay(1, Duration.ofMillis(300)))
                    .subscribeOn(Schedulers.boundedElastic())
                    .block(); // ✅ Mono → 동기 변환
        } catch (Exception e) {
            log.error("카카오 API 호출 실패: {}", e.getMessage());
            throw new BookExceptions.ExternalApiException("카카오 API 호출 실패: " + e.getMessage());
        }
    }

    // 기본값 오버로드
    public KakaoBookSearchResponse searchBooksFromKakao(String query) {
        return searchBooksFromKakao(query, 1, 10, "accuracy", null);
    }

    // ✅ ISBN으로 책 상세 정보 조회
    public Book getBookByIsbn(String isbn) {
        return bookRepository.findByIsbn13(isbn)
                .orElseGet(() -> {
                    KakaoBookSearchResponse response = fetchKakaoBookByIsbnAndCache(isbn); // Call the cached method

                    if (response == null || response.getDocuments().isEmpty()) {
                        throw new BookExceptions.BookNotFoundException("검색 결과가 없습니다: " + isbn);
                    }

                    return saveBookToUserLibrary(response.getDocuments().get(0));
                });
    }

    public List<Book> getBookEditions(String isbn) {
        Book originalBook = bookRepository.findByIsbn13(isbn)
                .orElseThrow(() -> new BookExceptions.BookNotFoundException("책을 찾을 수 없습니다: " + isbn));

        String groupTitle = originalBook.getGroupTitle();

        if (groupTitle == null || groupTitle.isEmpty()) {
            return Collections.emptyList();
        }

        return bookRepository.findByGroupTitle(groupTitle).stream()
                .filter(book -> !book.getIsbn13().equals(originalBook.getIsbn13()))
                .collect(Collectors.toList());
    }

    // ✅ DB에 책 저장 (사용자 서재 추가 시)
    public Book saveBookToUserLibrary(KakaoBookDto kakaoBook) {
        try {
            String[] isbns = kakaoBook.getIsbn().split(" ");
            String isbn13 = isbns.length > 1 ? isbns[1] : isbns[0];

            Optional<Book> existingBook = bookRepository.findByIsbn13(isbn13);
            if (existingBook.isPresent()) {
                return existingBook.get();
            }

            Book bookToSave = Book.fromKakaoApiResponse(kakaoBook);
            Book savedBook = bookRepository.save(bookToSave);

            // Trigger the embedding for the newly saved book
            triggerSingleBookEmbedding(savedBook);

            return savedBook;
        } catch (Exception e) {
            log.error("책 저장 중 오류 발생: {}", e.getMessage());
            throw new BookExceptions.ExternalApiException("DB 저장 실패: " + e.getMessage());
        }
    }

    // Book → KakaoBookDto 변환
    private KakaoBookDto convertToDto(Book book) {
        return new KakaoBookDto(
                book.getTitle(),
                book.getContents() != null ? book.getContents() : "",
                book.getUrl() != null ? book.getUrl() : "",
                (book.getIsbn10() != null ? book.getIsbn10() : "") +
                        (book.getIsbn13() != null ? " " + book.getIsbn13() : ""),
                book.getPublishDate() != null ? book.getPublishDate().toString() : "",
                book.getAuthors() != null ? Arrays.asList(book.getAuthors().split(",")) : Collections.emptyList(),
                book.getPublisher() != null ? book.getPublisher() : "",
                book.getTranslators() != null ? Arrays.asList(book.getTranslators().split(",")) : Collections.emptyList(),
                book.getPrice() != null ? book.getPrice() : 0,
                book.getSalePrice() != null ? book.getSalePrice() : 0,
                book.getThumbnail() != null ? book.getThumbnail() : "",
                ""
        );
    }

    // 인기 도서 조회
    public List<Book> getPopularBooks(int limit) {
        return bookRepository.findAll()
                .stream()
                .sorted((b1, b2) -> b2.getCreatedAt().compareTo(b1.getCreatedAt()))
                .limit(limit)
                .toList();
    }

    // ✅ 카카오 API에서 ISBN으로 책을 가져와 캐시하는 private 메소드
    @Cacheable(value = "bookSearchCache", key = "#isbn")
    private KakaoBookSearchResponse fetchKakaoBookByIsbnAndCache(String isbn) {
        try {
            return kakaoBookService.searchBookByIsbn(isbn)
                    .subscribeOn(Schedulers.boundedElastic())
                    .block();
        } catch (Exception e) {
            log.error("카카오 API (ISBN) 호출 실패: {}", e.getMessage());
            throw new BookExceptions.ExternalApiException("카카오 API (ISBN) 호출 실패: " + e.getMessage());
        }
    }

    public List<Book> getBooksByIds(List<Long> ids) {
        return bookRepository.findAllById(ids);
    }

    private void triggerSingleBookEmbedding(Book book) {
        WebClient webClient = webClientBuilder.baseUrl(FASTAPI_URL).build();

        Map<String, Object> bookData = Map.of(
                "title", book.getTitle(),
                "contents", Optional.ofNullable(book.getContents()).orElse(""),
                "isbn", book.getIsbn13(),
                "authors", Optional.ofNullable(book.getAuthors()).map(a -> a.split(",")).orElse(new String[0]),
                "publisher", Optional.ofNullable(book.getPublisher()).orElse(""),
                "thumbnail", Optional.ofNullable(book.getThumbnail()).orElse("")
        );

        webClient.post()
                .uri("/api/books/embed-single")
                .bodyValue(bookData)
                .retrieve()
                .bodyToMono(String.class)
                .doOnSuccess(response -> log.info("✅ Successfully triggered single book embedding for ISBN {}: {}", book.getIsbn13(), response))
                .doOnError(error -> log.error("❌ Failed to trigger single book embedding for ISBN {}: {}", book.getIsbn13(), error.getMessage()))
                .subscribe();
    }
}
