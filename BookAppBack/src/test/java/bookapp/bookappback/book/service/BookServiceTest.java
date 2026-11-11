package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.userbookstatus.repository.UserBookStatusRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookServiceTest {

    @Mock
    private BookRepository bookRepository;

    @Mock
    private KakaoSearchCacheService kakaoSearchCacheService;

    @Mock
    private WebClient.Builder webClientBuilder;

    @Mock
    private UserBookStatusRepository userBookStatusRepository;

    @InjectMocks
    private BookService bookService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    @DisplayName("ISBN으로 책 조회 성공 - DB에 존재")
    void getBookByIsbn_successFromDb() {
        Book mockBook = new Book();
        mockBook.setId(1L);
        mockBook.setIsbn13("9781234567890");

        when(bookRepository.findByIsbn13("9781234567890")).thenReturn(Optional.of(mockBook));

        Book result = bookService.getBookByIsbn("9781234567890");

        assertNotNull(result);
        assertEquals("9781234567890", result.getIsbn13());
        verify(bookRepository, times(1)).findByIsbn13("9781234567890");
        verify(kakaoSearchCacheService, never()).searchBookByIsbn(anyString());
    }

    @Test
    @DisplayName("카카오 API 호출 실패 - ExternalApiException 발생")
    void getBookByIsbn_externalApiError() {
        when(bookRepository.findByIsbn13("9780000000000")).thenReturn(Optional.empty());
        when(kakaoSearchCacheService.searchBookByIsbn("9780000000000"))
                .thenThrow(new BookExceptions.ExternalApiException("카카오 API 오류"));

        assertThrows(BookExceptions.ExternalApiException.class, () ->
                bookService.getBookByIsbn("9780000000000")
        );
    }

    @Test
    @DisplayName("카카오 API 결과 없음 - BookNotFoundException 발생")
    void getBookByIsbn_notFound() {
        KakaoBookSearchResponse emptyResponse = new KakaoBookSearchResponse();
        emptyResponse.setDocuments(Collections.emptyList());

        when(bookRepository.findByIsbn13("9999999999")).thenReturn(Optional.empty());
        when(kakaoSearchCacheService.searchBookByIsbn("9999999999"))
                .thenReturn(emptyResponse);

        assertThrows(BookExceptions.BookNotFoundException.class, () ->
                bookService.getBookByIsbn("9999999999")
        );
    }

    @Test
    void savesKakaoBookUnderValidatedIsbnInsteadOfInvalidThirteenDigitValue() {
        BookService service = spy(new BookService(
                bookRepository, kakaoSearchCacheService, webClientBuilder,
                userBookStatusRepository, "http://localhost:8000", "test-token"));
        doNothing().when(service).submitCorpusIngestion(any(Book.class));
        when(bookRepository.findByIsbn13("9781127241347")).thenReturn(Optional.empty());
        when(bookRepository.save(any(Book.class))).thenAnswer(invocation -> invocation.getArgument(0));
        KakaoBookDto dto = new KakaoBookDto();
        dto.setTitle("플랫랜드");
        dto.setIsbn("1127241346 1400000309490");

        Book saved = service.saveBookToUserLibrary(dto);

        assertEquals("9781127241347", saved.getIsbn13());
        verify(bookRepository).findByIsbn13("9781127241347");
        verify(bookRepository, never()).findByIsbn13("1400000309490");
        verify(service).submitCorpusIngestion(saved);
    }

    @Test
    void findsCanonicalIsbn13ThroughKakaoIsbn10AndChecksTheReturnedBook() {
        BookService service = spy(new BookService(
                bookRepository, kakaoSearchCacheService, webClientBuilder,
                userBookStatusRepository, "http://localhost:8000", "test-token"));
        KakaoBookDto wrong = new KakaoBookDto();
        wrong.setIsbn("9780306406157");
        KakaoBookDto matching = new KakaoBookDto();
        matching.setIsbn("1127241346 1400000309490");
        Book expected = new Book();
        expected.setIsbn13("9781127241347");
        when(bookRepository.findByIsbn13("9781127241347")).thenReturn(Optional.empty());
        when(kakaoSearchCacheService.searchBookByIsbn("9781127241347"))
                .thenReturn(new KakaoBookSearchResponse(null, Collections.emptyList()));
        when(kakaoSearchCacheService.searchBookByIsbn("1127241346"))
                .thenReturn(new KakaoBookSearchResponse(null, List.of(wrong, matching)));
        doReturn(expected).when(service).saveBookToUserLibrary(matching);

        assertSame(expected, service.getBookByIsbn("9781127241347"));
        verify(service, never()).saveBookToUserLibrary(wrong);
        verify(kakaoSearchCacheService).searchBookByIsbn("1127241346");
    }

    @Test
    void rejectsKakaoIsbn10FallbackWhenReturnedBookDoesNotMatch() {
        KakaoBookDto wrong = new KakaoBookDto();
        wrong.setIsbn("9780306406157");
        when(bookRepository.findByIsbn13("9781127241347")).thenReturn(Optional.empty());
        when(kakaoSearchCacheService.searchBookByIsbn("9781127241347"))
                .thenReturn(new KakaoBookSearchResponse(null, Collections.emptyList()));
        when(kakaoSearchCacheService.searchBookByIsbn("1127241346"))
                .thenReturn(new KakaoBookSearchResponse(null, List.of(wrong)));

        assertThrows(BookExceptions.BookNotFoundException.class,
                () -> bookService.getBookByIsbn("9781127241347"));
        verify(bookRepository, never()).save(any(Book.class));
    }
}
