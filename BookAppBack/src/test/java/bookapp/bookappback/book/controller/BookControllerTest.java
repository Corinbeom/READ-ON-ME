package bookapp.bookappback.book.controller;

import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.service.BookService;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.common.exception.GlobalExceptionHandler;
import bookapp.bookappback.common.util.DataLoader;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
@ActiveProfiles("test")
class BookControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BookService bookService;

    @MockBean
    private DataLoader dataLoader;

    @Test
    @DisplayName("책 검색 성공 - 200 OK")
    void searchBooks_success() throws Exception {
        KakaoBookSearchResponse response = new KakaoBookSearchResponse();
        response.setDocuments(java.util.List.of());
        when(bookService.searchBooksFromKakao(anyString(), anyInt(), anyInt(), anyString(), any()))
                .thenReturn(response);

        mockMvc.perform(get("/api/books/search")
                        .param("query", "스프링")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("카카오 API 실패 시 502 반환")
    void searchBooks_externalApiError() throws Exception {
        when(bookService.searchBooksFromKakao(anyString(), anyInt(), anyInt(), anyString(), any()))
                .thenThrow(new BookExceptions.ExternalApiException("카카오 API 호출 실패"));

        mockMvc.perform(get("/api/books/search")
                        .param("query", "에러")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_ERROR"))
                .andExpect(jsonPath("$.message").value("카카오 API 호출 실패"));
    }

    @Test
    @DisplayName("검색 결과 없음 - 404 반환")
    void searchBooks_notFound() throws Exception {
        when(bookService.searchBooksFromKakao(anyString(), anyInt(), anyInt(), anyString(), any()))
                .thenThrow(new BookExceptions.BookNotFoundException("없는 책"));

        mockMvc.perform(get("/api/books/search")
                        .param("query", "없는책")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("검색 결과가 없습니다: 없는 책"));
    }
}
