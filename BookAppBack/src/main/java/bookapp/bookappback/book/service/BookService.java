package bookapp.bookappback.book.service;

import lombok.RequiredArgsConstructor;
import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.entity.CatalogFieldObservation;
import bookapp.bookappback.book.repository.CatalogFieldObservationRepository;
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
import org.springframework.transaction.annotation.Transactional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class BookService {

    private final bookapp.bookappback.ai.service.AiSearchService reviewedCatalog;
    @org.springframework.beans.factory.annotation.Value("${galpi.reviewed-release:}")
    private String release = "";
    private final BookRepository bookRepository;
    private final CatalogFieldObservationRepository observations;
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
        var stored = bookRepository.findByIsbn13(isbn);
        if (stored.isPresent()) return forDisplay(stored.get());
        String canonical = IsbnNormalizer.toIsbn13(isbn);
        if (!canonical.equals(isbn)) return getBookByIsbn(canonical);
        Book reviewed = release.isBlank() ? null : reviewedCatalog.reviewedDetail(canonical, release);
        return reviewed != null ? reviewed : lookup(canonical);
    }

    private Book lookup(String isbn) {
        var response = kakaoSearchCacheService.searchBookByIsbn(isbn);
        String isbn10 = IsbnNormalizer.toIsbn10(isbn);
        if ((response == null || response.getDocuments() == null || response.getDocuments().isEmpty()) && isbn10 != null) {
            response = kakaoSearchCacheService.searchBookByIsbn(isbn10);
        }
        if (response != null && response.getDocuments() != null) {
            for (KakaoBookDto item : response.getDocuments()) {
                try {
                    if (isbn.equals(IsbnNormalizer.toIsbn13(item.getIsbn()))) return Book.fromKakaoApiResponse(item);
                } catch (IllegalArgumentException ignored) {
                    // Kakao may include unrelated editions with malformed ISBNs.
                }
            }
        }
        throw new BookExceptions.BookNotFoundException("검색 결과가 없습니다: " + isbn);
    }

    public Book forDisplay(Book identity) {
        if (!release.isBlank()) {
            Book reviewed = reviewedCatalog.reviewedDetail(identity.getIsbn13(), release);
            if (reviewed != null) {
                reviewed.setId(identity.getId());
                reviewed.setAverageRating(identity.getAverageRating());
                return reviewed;
            }
        }
        Book display;
        try {
            display = lookup(identity.getIsbn13());
        } catch (BookExceptions.BookNotFoundException | BookExceptions.ExternalApiException unavailable) {
            display = new Book();
            display.setIsbn13(identity.getIsbn13());
            display.setTitle(identity.getIsbn13());
        }
        display.setId(identity.getId());
        display.setAverageRating(identity.getAverageRating());
        return display;
    }

    @Transactional
    public Long resolveSelectedIsbn(String raw) {
        String isbn = IsbnNormalizer.toIsbn13(raw);
        return bookRepository.lockByIsbn(isbn).map(Book::getId).orElseGet(() -> {
            Book reviewed = release.isBlank() ? null : reviewedCatalog.reviewedDetail(isbn, release);
            Book catalog = reviewed == null ? lookup(isbn) : null;
            if (bookRepository.insertIdentity(isbn) == 1 && catalog != null) recordSelection(catalog);
            return bookRepository.lockByIsbn(isbn).orElseThrow().getId();
        });
    }

    private void recordSelection(Book book) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("title", book.getTitle());
        fields.put("authors", book.getAuthors());
        fields.put("contents", book.getContents());
        fields.put("thumbnail", book.getThumbnail());
        fields.put("publisher", book.getPublisher());
        fields.put("translators", book.getTranslators());
        fields.put("publish_date", book.getPublishDate());
        fields.put("price", book.getPrice());
        fields.put("sale_price", book.getSalePrice());
        fields.put("url", book.getUrl());
        observations.saveAll(fields.entrySet().stream()
                .filter(entry -> entry.getValue() != null && !entry.getValue().toString().isBlank())
                .map(entry -> new CatalogFieldObservation(book.getIsbn13(), entry.getKey(), entry.getValue().toString()))
                .toList());
    }

    // 출판사별 책 조회
    public List<Book> getBookEditions(String isbn) {
        Book originalBook = getBookByIsbn(isbn);

        String groupTitle = originalBook.getGroupTitle();

        if (groupTitle == null || groupTitle.isEmpty()) {
            return Collections.emptyList();
        }

        return bookRepository.findByGroupTitle(groupTitle).stream()
                .filter(book -> !book.getIsbn13().equals(originalBook.getIsbn13()))
                .map(this::forDisplay)
                .collect(Collectors.toList());
    }

    // 인기 도서 조회 — 매 요청마다 COUNT 집계를 피하기 위해 1시간 캐시
    @Cacheable(value = "popularBooksCache", key = "'catalog-v2:' + #limit", condition = "@galpiAvailability.release() == ''")
    public List<Book> getPopularBooks(int limit) {
        List<Object[]> raw = userBookStatusRepository.findPopularBooksByStatuses(
                List.of(ReadingStatus.READING, ReadingStatus.COMPLETED)
        );
        if (raw.isEmpty()) {
            return bookRepository.findTopNByOrderByCreatedAtDesc(limit).stream().map(this::forDisplay).toList();
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
                .map(this::forDisplay)
                .collect(Collectors.toList());
    }

    public List<Book> getBooksByIds(List<Long> ids) {
        return bookRepository.findAllById(ids).stream().map(this::forDisplay).toList();
    }
}
