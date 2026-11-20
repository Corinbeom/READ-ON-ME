package bookapp.bookappback.book.service;

import lombok.RequiredArgsConstructor;
import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.util.IsbnNormalizer;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.repository.UserBookStatusRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class BookService {

    private final BookRepository bookRepository;
    private final KakaoSearchCacheService kakaoSearchCacheService;
    private final UserBookStatusRepository userBookStatusRepository;

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

                    String isbn10 = IsbnNormalizer.toIsbn10(isbn);
                    if ((response == null || response.getDocuments() == null || response.getDocuments().isEmpty())
                            && isbn10 != null) {
                        response = kakaoSearchCacheService.searchBookByIsbn(isbn10);
                    }

                    if (response == null || response.getDocuments() == null || response.getDocuments().isEmpty()) {
                        throw new BookExceptions.BookNotFoundException("검색 결과가 없습니다: " + isbn);
                    }

                    if (isbn10 == null) {
                        return saveBookToUserLibrary(response.getDocuments().get(0));
                    }
                    return response.getDocuments().stream()
                            .filter(document -> {
                                try {
                                    return isbn.equals(IsbnNormalizer.toIsbn13(document.getIsbn()));
                                } catch (IllegalArgumentException exception) {
                                    return false;
                                }
                            })
                            .findFirst()
                            .map(this::saveBookToUserLibrary)
                            .orElseThrow(() -> new BookExceptions.BookNotFoundException("검색 결과가 없습니다: " + isbn));
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
            String isbn13 = IsbnNormalizer.toIsbn13(rawIsbn);

            Optional<Book> existingBook = bookRepository.findByIsbn13(isbn13);
            if (existingBook.isPresent()) {
                return existingBook.get();
            }

            Book bookToSave = Book.fromKakaoApiResponse(kakaoBook);
            return bookRepository.save(bookToSave);
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
}
