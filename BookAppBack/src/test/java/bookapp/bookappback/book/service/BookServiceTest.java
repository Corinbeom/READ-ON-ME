package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Collections;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookServiceTest {

    @Mock
    private BookRepository bookRepository;

    @Mock
    private KakaoBookService kakaoBookService;

    @InjectMocks
    private BookService bookService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    // ✅ 성공: DB에 책이 존재할 때
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
        verify(kakaoBookService, never()).searchBookByIsbn(anyString());
    }

    // ⚠️ 외부 API 실패
    @Test
    @DisplayName("카카오 API 호출 실패 - ExternalApiException 발생")
    void getBookByIsbn_externalApiError() {
        when(bookRepository.findByIsbn13("9780000000000")).thenReturn(Optional.empty());
        when(kakaoBookService.searchBookByIsbn("9780000000000"))
                .thenReturn(Mono.error(new RuntimeException("카카오 API 오류"))); // ✅ Mono.error 사용

        assertThrows(BookExceptions.ExternalApiException.class, () ->
                bookService.getBookByIsbn("9780000000000")
        );
    }

    // ⚠️ 책 미존재
    @Test
    @DisplayName("카카오 API 결과 없음 - BookNotFoundException 발생")
    void getBookByIsbn_notFound() {
        KakaoBookSearchResponse emptyResponse = new KakaoBookSearchResponse();
        emptyResponse.setDocuments(Collections.emptyList());

        when(bookRepository.findByIsbn13("9999999999")).thenReturn(Optional.empty());
        when(kakaoBookService.searchBookByIsbn("9999999999"))
                .thenReturn(Mono.just(emptyResponse)); // ✅ Mono.just 로 감싸줌

        assertThrows(BookExceptions.BookNotFoundException.class, () ->
                bookService.getBookByIsbn("9999999999")
        );
    }
}
