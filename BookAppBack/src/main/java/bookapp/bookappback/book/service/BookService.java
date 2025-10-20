package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import lombok.extern.slf4j.Slf4j; // Add this import
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@Service
@Slf4j // Add this annotation
public class BookService {

    private final BookRepository bookRepository;
    private final KakaoBookService kakaoBookService;

    @Autowired
    public BookService(BookRepository bookRepository, KakaoBookService kakaoBookService) {
        this.bookRepository = bookRepository;
        this.kakaoBookService = kakaoBookService;
    }

    // 카카오 API에서 책 검색 (target 파라미터 포함)
    public Mono<KakaoBookSearchResponse> searchBooksFromKakao(
            String query,
            int page,
            int size,
            String sort,
            String target
    ) {
        return kakaoBookService.searchBooks(query, page, size, sort, target);
    }

    // Overloaded method with default parameters
    public Mono<KakaoBookSearchResponse> searchBooksFromKakao(String query) {
        return searchBooksFromKakao(query, 1, 10, "accuracy", null);
    }

    // ISBN으로 책 상세 정보 가져오기
    public Mono<Book> getBookByIsbn(String isbn) {
        // 1. DB에서 ISBN13 기준으로 조회
        return Mono.justOrEmpty(bookRepository.findByIsbn13(isbn).stream().findFirst())
                .switchIfEmpty(Mono.defer(() -> {
                    // 2. DB에 없으면 카카오 API에서 조회
                    return kakaoBookService.searchBookByIsbn(isbn)
                            .map(response -> {
                                if (response.getDocuments().isEmpty()) {
                                    log.warn("No book found for ISBN {} from Kakao API.", isbn); // Log if no book from Kakao
                                    return null;
                                }
                                KakaoBookDto kakaoBookDto = response.getDocuments().get(0);
                                // 3. 카카오 API에서 가져온 책을 DB에 저장하고 반환
                                return saveBookToUserLibrary(kakaoBookDto);
                            });
                }))
                .doOnNext(book -> { // Add logging here
                    if (book != null) {
                        log.info("Returning book with ID: {} for ISBN: {}", book.getId(), isbn);
                    } else {
                        log.warn("Returning null book for ISBN: {}", isbn);
                    }
                });
    }

    // 사용자가 서재에 추가할 때만 DB에 저장
    public Book saveBookToUserLibrary(KakaoBookDto kakaoBook) {
        // ISBN13 우선 사용, 없으면 ISBN10 사용
        String[] isbns = kakaoBook.getIsbn().split(" ");
        String isbn13 = isbns.length > 1 ? isbns[1] : isbns[0];
        String isbn10 = isbns.length > 0 ? isbns[0] : null;

        // DB에 이미 존재하는지 체크 (ISBN13 기준)
        Book existingBook = bookRepository.findByIsbn13(isbn13).stream().findFirst().orElse(null);
        if (existingBook != null) {
            return existingBook;
        } else {
            Book book = Book.fromKakaoApiResponse(kakaoBook);
            return bookRepository.save(book);
        }
    }

    // Book → KakaoBookDto 변환
    private KakaoBookDto convertToDto(Book book) {
        return new KakaoBookDto(
                book.getTitle(),
                book.getContents() != null ? book.getContents() : "",
                book.getUrl() != null ? book.getUrl() : "",
                // ISBN 합치기 (isbn10 + 공백 + isbn13)
                (book.getIsbn10() != null ? book.getIsbn10() : "") +
                        (book.getIsbn13() != null ? " " + book.getIsbn13() : ""),
                book.getPublishDate() != null ? book.getPublishDate().toString() : "",
                book.getAuthors() != null ? Arrays.asList(book.getAuthors().split(",")) : Collections.emptyList(),
                book.getPublisher() != null ? book.getPublisher() : "",
                book.getTranslators() != null ? Arrays.asList(book.getTranslators().split(",")) : Collections.emptyList(),
                book.getPrice() != null ? book.getPrice() : 0,
                book.getSalePrice() != null ? book.getSalePrice() : 0,
                book.getThumbnail() != null ? book.getThumbnail() : "",
                "" // status는 Book 엔티티에 없음
        );
    }

    public List<Book> getPopularBooks(int limit) {
        // 현재는 단순히 최근 추가된 책 기준으로 조회
        return bookRepository.findAll()
                .stream()
                .sorted((b1, b2) -> b2.getCreatedAt().compareTo(b1.getCreatedAt()))
                .limit(limit)
                .toList();
    }
}
