package bookapp.bookappback.user.controller;

import bookapp.bookappback.common.exception.GlobalExceptionHandler;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.common.util.JwtUtil;
import bookapp.bookappback.security.JwtAuthenticationFilter;
import bookapp.bookappback.security.dto.SignInRequest;
import bookapp.bookappback.security.dto.SignUpRequest;
import bookapp.bookappback.user.service.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService; // 실제 서비스 대신 mock 사용

    @Autowired
    private ObjectMapper objectMapper;

    @TestConfiguration
    static class MockConfig {
        @Bean
        public UserService userService() {
            return Mockito.mock(UserService.class);
        }
    }

    // ✅ 회원가입 성공
    @Test
    @DisplayName("회원가입 성공 - 200 OK")
    void signUp_success() throws Exception {
        SignUpRequest request = new SignUpRequest("test@example.com", "password", "nickname", null);

        mockMvc.perform(post("/api/users/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());
    }

    // ⚠️ 이메일 중복 예외
    @Test
    @DisplayName("회원가입 실패 - 중복 이메일 예외 409 반환")
    void signUp_duplicateEmail() throws Exception {
        SignUpRequest request = new SignUpRequest("dup@example.com", "password", "nickname", null);

        Mockito.doThrow(new UserExceptions.EmailDuplicateException(request.getEmail()))
                .when(userService).signUp(any(SignUpRequest.class));

        mockMvc.perform(post("/api/users/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_DUPLICATE"))
                .andExpect(jsonPath("$.message").value("이미 가입된 이메일입니다: " + request.getEmail()));
    }

    // ⚠️ 로그인 실패
    @Test
    @DisplayName("로그인 실패 - 잘못된 비밀번호 401 반환")
    void signIn_invalidLogin() throws Exception {
        SignInRequest request = new SignInRequest("test@example.com", "wrongpassword");

        Mockito.doThrow(new UserExceptions.InvalidLoginException())
                .when(userService).signIn(any(SignInRequest.class));

        mockMvc.perform(post("/api/users/signin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_LOGIN"))
                .andExpect(jsonPath("$.message").value("이메일 또는 비밀번호가 올바르지 않습니다."));
    }
}
