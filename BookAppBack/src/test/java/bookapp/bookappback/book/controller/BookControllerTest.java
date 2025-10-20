package bookapp.bookappback.book.controller;

import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.service.BookService;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.common.exception.GlobalExceptionHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Import({GlobalExceptionHandler.class, BookControllerTest.MockConfig.class})
class BookControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private BookService bookService;

    @Autowired
    private ObjectMapper objectMapper;

    @TestConfiguration
    static class MockConfig {
        @Bean
        public BookService bookService() {
            return Mockito.mock(BookService.class);
        }
    }

    @BeforeEach
    void setup() {
        Mockito.reset(bookService);
    }

    // ✅ 정상 검색
    @Test
    @DisplayName("책 검색 성공 - 200 OK")
    void searchBooks_success() throws Exception {
        KakaoBookSearchResponse response = new KakaoBookSearchResponse();
        response.setDocuments(java.util.List.of());

        when(bookService.searchBooksFromKakao(anyString(), anyInt(), anyInt(), anyString(), isNull()))
                .thenReturn(response);

        mockMvc.perform(get("/api/books/search")
                        .param("query", "스프링")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
    }

    // ⚠️ 외부 API 실패
    @Test
    @DisplayName("카카오 API 호출 실패 - 502 반환")
    void searchBooks_externalApiError() throws Exception {
        when(bookService.searchBooksFromKakao(anyString(), anyInt(), anyInt(), anyString(), isNull()))
                .thenThrow(new BookExceptions.ExternalApiException("카카오 API 호출 실패"));

        mockMvc.perform(get("/api/books/search")
                        .param("query", "에러발생")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_ERROR"))
                .andExpect(jsonPath("$.message").value("카카오 API 호출 실패"));
    }

    // ⚠️ 책 미존재
    @Test
    @DisplayName("검색 결과 없음 - 404 반환")
    void searchBooks_notFound() throws Exception {
        when(bookService.searchBooksFromKakao(anyString(), anyInt(), anyInt(), anyString(), isNull()))
                .thenThrow(new BookExceptions.BookNotFoundException("없는 책"));

        mockMvc.perform(get("/api/books/search")
                        .param("query", "없는책")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("검색 결과가 없습니다: 없는 책"));
    }
}
