package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
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
}
