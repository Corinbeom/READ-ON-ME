package bookapp.bookappback.user.controller;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.user.service.KakaoLoginClient;
import bookapp.bookappback.user.service.KakaoLoginSettings;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "app.kakao-login.javascript-key=test-js",
        "app.kakao-login.rest-api-key=test-rest",
        "app.kakao-login.client-secret=test-secret",
        "app.kakao-login.redirect-uri=https://example.test/auth/kakao/callback"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class KakaoLoginControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired BookRepository books;
    @MockitoBean StringRedisTemplate redis;
    @MockitoBean KakaoLoginClient kakao;

    @Test
    void aKakaoUserCanAccessTheProfileAndSaveTheSelectedBookWithoutEmail() throws Exception {
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> values = mock(ValueOperations.class);
        Map<String, String> state = new HashMap<>();
        when(redis.opsForValue()).thenReturn(values);
        when(values.increment(anyString())).thenReturn(1L);
        doAnswer(call -> {
            state.put(call.getArgument(0), call.getArgument(1));
            return null;
        }).when(values).set(anyString(), anyString(), any(Duration.class));
        when(values.getAndDelete(anyString())).thenAnswer(call -> state.remove((String) call.getArgument(0)));
        when(kakao.exchange(eq("test-code"), any(KakaoLoginSettings.class))).thenReturn(
                new KakaoLoginClient.KakaoUser(99L));

        String verifier = "a".repeat(64);
        String challenge = HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        var start = mvc.perform(post("/api/users/kakao/start").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("challenge", challenge))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.javascript_key").value("test-js"))
                .andExpect(jsonPath("$.client_secret").doesNotExist())
                .andReturn();
        String authState = mapper.readTree(start.getResponse().getContentAsByteArray()).path("state").asText();
        var exchange = mapper.writeValueAsString(Map.of("code", "test-code", "state", authState, "verifier", verifier));
        var login = mvc.perform(post("/api/users/kakao/exchange").contentType(MediaType.APPLICATION_JSON).content(exchange))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.nickname").value(matchesPattern("[가-힣 ]{2,10}")))
                .andExpect(jsonPath("$.data.user.email").doesNotExist())
                .andReturn();
        var session = mapper.readTree(login.getResponse().getContentAsByteArray()).path("data");
        String auth = "Bearer " + session.path("access_token").asText();
        String initialNickname = session.path("user").path("nickname").asText();
        mvc.perform(post("/api/users/profile/nickname-suggestion").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("exclude", initialNickname))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value(not(initialNickname)));
        mvc.perform(get("/api/users/profile").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value(initialNickname));
        mvc.perform(put("/api/users/profile").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"문장을 줍는 독자\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("문장을 줍는 독자"));
        mvc.perform(get("/api/users/profile").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("문장을 줍는 독자"));

        Book book = new Book();
        book.setTitle("서재 테스트 책");
        book.setIsbn13("9791198363503");
        var savedBook = books.saveAndFlush(book);
        mvc.perform(post("/api/library/{bookId}", savedBook.getId()).header("Authorization", auth).param("status", "READING"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/library").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.readingBooks[0].isbn13").value(book.getIsbn13()));
        mvc.perform(post("/api/users/kakao/exchange").contentType(MediaType.APPLICATION_JSON).content(exchange))
                .andExpect(status().isBadRequest());
        verify(kakao, times(1)).exchange(eq("test-code"), any(KakaoLoginSettings.class));
    }
}
