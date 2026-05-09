package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.repository.UserBookStatusRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Slf4j
public class BookService {

    private final BookRepository bookRepository;
    private final KakaoSearchCacheService kakaoSearchCacheService;
    private final WebClient.Builder webClientBuilder;
    private final UserBookStatusRepository userBookStatusRepository;

    private final String aiBaseUrl;

    @Autowired
    public BookService(BookRepository bookRepository,
                       KakaoSearchCacheService kakaoSearchCacheService,
                       WebClient.Builder webClientBuilder,
                       UserBookStatusRepository userBookStatusRepository,
                       @org.springframework.beans.factory.annotation.Value("${ai.base-url}") String aiBaseUrl) {
        this.bookRepository = bookRepository;
        this.kakaoSearchCacheService = kakaoSearchCacheService;
        this.webClientBuilder = webClientBuilder;
        this.userBookStatusRepository = userBookStatusRepository;
        this.aiBaseUrl = aiBaseUrl;
    }


    // 카카오 API에서 책 검색 (캐싱은 KakaoSearchCacheService에서 처리)
    public KakaoBookSearchResponse searchBooksFromKakao(
            String query, int page, int size, String sort, String target
    ) {
        return kakaoSearchCacheService.searchBooks(query, page, size, sort, target);
    }

    // 기본값 오버로드
    public KakaoBookSearchResponse searchBooksFromKakao(String query) {
        return searchBooksFromKakao(query, 1, 10, "accuracy", null);
    }

    // ISBN으로 책 상세 정보 조회
    public Book getBookByIsbn(String isbn) {
        return bookRepository.findByIsbn13(isbn)
                .orElseGet(() -> {
                    KakaoBookSearchResponse response = kakaoSearchCacheService.searchBookByIsbn(isbn);

                    if (response == null || response.getDocuments().isEmpty()) {
                        throw new BookExceptions.BookNotFoundException("검색 결과가 없습니다: " + isbn);
                    }

                    return saveBookToUserLibrary(response.getDocuments().get(0));
                });
    }

    // 출판사별 책 조회
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

    // DB에 책 저장 (사용자 서재 추가 시)
    public Book saveBookToUserLibrary(KakaoBookDto kakaoBook) {
        try {
            String rawIsbn = kakaoBook.getIsbn();
            if (rawIsbn == null || rawIsbn.isBlank()) {
                throw new BookExceptions.ExternalApiException("ISBN 정보가 없습니다.");
            }
            String[] isbns = rawIsbn.split(" ");
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

    // 인기 도서 조회 — 매 요청마다 COUNT 집계를 피하기 위해 1시간 캐시
    @Cacheable(value = "popularBooksCache", key = "#limit")
    public List<Book> getPopularBooks(int limit) {
        List<Object[]> raw = userBookStatusRepository.findPopularBooksByStatuses(
                List.of(ReadingStatus.READING, ReadingStatus.COMPLETED)
        );
        if (raw.isEmpty()) {
            return bookRepository.findTopNByOrderByCreatedAtDesc(limit);
        }

        LinkedHashMap<Long, Long> orderedIds = new LinkedHashMap<>();
        for (Object[] row : raw) {
            Long bookId = ((Number) row[0]).longValue();
            Long count = ((Number) row[1]).longValue();
            orderedIds.put(bookId, count);
            if (orderedIds.size() >= limit) break;
        }

        List<Book> books = bookRepository.findAllById(orderedIds.keySet());
        Map<Long, Book> bookById = books.stream().collect(Collectors.toMap(Book::getId, b -> b));

        return orderedIds.keySet().stream()
                .map(bookById::get)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toList());
    }

    public List<Book> getBooksByIds(List<Long> ids) {
        return bookRepository.findAllById(ids);
    }

    public void triggerSingleBookEmbedding(Book book) {
        WebClient webClient = webClientBuilder.baseUrl(aiBaseUrl).build();

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
                .flatMap(response -> Mono.fromRunnable(() -> {
                    log.info("임베딩 성공 [isbn={}]", book.getIsbn13());
                    bookRepository.markAsEmbedded(book.getIsbn13());
                }).subscribeOn(Schedulers.boundedElastic()).thenReturn(response))
                .doOnError(error -> log.error("임베딩 실패 [isbn={}]: {} — 스케줄러가 재시도합니다", book.getIsbn13(), error.getMessage()))
                .subscribe();
    }
}
