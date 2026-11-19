package bookapp.bookappback.feedback;

import bookapp.bookappback.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FeedbackControllerTest {
    private final JdbcClient jdbc = mock(JdbcClient.class);
    private final JdbcClient.StatementSpec insert = mock(JdbcClient.StatementSpec.class, RETURNS_SELF);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new FeedbackController(jdbc))
            .setControllerAdvice(new GlobalExceptionHandler()).build();

    @Test
    void storesTheSelectedCategoryAndTrimmedMessage() throws Exception {
        when(jdbc.sql(anyString())).thenReturn(insert);
        mvc.perform(post("/api/feedback").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category\":\"USABILITY\",\"message\":\"  Help with the search layout  \"}"))
                .andExpect(status().isNoContent());
        verify(insert).param("category", "USABILITY");
        verify(insert).param("message", "Help with the search layout");
        verify(insert).update();
    }

    @Test
    void rejectsUnknownCategoriesAndBlankOrOversizeMessages() throws Exception {
        for (String body : new String[] {
                "{",
                "{\"category\":\"OTHER\",\"message\":\"feedback\"}",
                "{\"category\":\"ERROR\",\"message\":\"  \"}",
                "{\"category\":\"ERROR\",\"message\":\"" + "x".repeat(1001) + "\"}"
        }) {
            mvc.perform(post("/api/feedback").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(jdbc);
    }

}
