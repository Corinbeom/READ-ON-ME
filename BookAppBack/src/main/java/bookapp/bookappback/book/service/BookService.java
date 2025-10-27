package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Slf4j
public class BookService {

    private final BookRepository bookRepository;
    private final KakaoBookService kakaoBookService;

    @Autowired
    public BookService(BookRepository bookRepository, KakaoBookService kakaoBookService) {
        this.bookRepository = bookRepository;
        this.kakaoBookService = kakaoBookService;
    }


    // ✅ 카카오 API에서 책 검색 (동기식)
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
        return bookRepository.findByIsbn13(isbn).stream().findFirst()
                .orElseGet(() -> {
                    KakaoBookSearchResponse response;
                    try {
                        response = kakaoBookService.searchBookByIsbn(isbn)
                                .subscribeOn(Schedulers.boundedElastic())
                                .block();
                    } catch (Exception e) {
                        throw new BookExceptions.ExternalApiException("카카오 API 호출 실패: " + e.getMessage());
                    }

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

            Book book = Book.fromKakaoApiResponse(kakaoBook);
            return bookRepository.save(book);
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
}
