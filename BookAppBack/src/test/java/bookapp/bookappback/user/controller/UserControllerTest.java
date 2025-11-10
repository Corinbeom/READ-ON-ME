package bookapp.bookappback.user.controller;

import bookapp.bookappback.common.exception.GlobalExceptionHandler;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.common.util.DataLoader;
import bookapp.bookappback.security.dto.SignInRequest;
import bookapp.bookappback.security.dto.SignUpRequest;
import bookapp.bookappback.user.dto.UserResponse;
import bookapp.bookappback.user.service.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
@ActiveProfiles("test")
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserService userService;

    @MockBean
    private DataLoader dataLoader;

    @Test
    @DisplayName("회원가입 성공 - 200 OK")
    void signUp_success() throws Exception {
        SignUpRequest request = new SignUpRequest("test@example.com", "Password1!", "nickname", null);
        UserResponse response = new UserResponse(1L, request.getEmail(), request.getNickname(), null, "2024-01-01T00:00:00");
        when(userService.signUp(any(SignUpRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/users/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.email").value(request.getEmail()));
    }

    @Test
    @DisplayName("회원가입 실패 - 이메일 중복")
    void signUp_duplicateEmail() throws Exception {
        SignUpRequest request = new SignUpRequest("dup@example.com", "Password1!", "nickname", null);
        Mockito.doThrow(new UserExceptions.EmailDuplicateException(request.getEmail()))
                .when(userService).signUp(any(SignUpRequest.class));

        mockMvc.perform(post("/api/users/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_DUPLICATE"));
    }

    @Test
    @DisplayName("로그인 실패 - 올바르지 않은 자격")
    void signIn_invalidLogin() throws Exception {
        SignInRequest request = new SignInRequest("test@example.com", "wrong");
        Mockito.doThrow(new UserExceptions.InvalidLoginException())
                .when(userService).signIn(any(SignInRequest.class));

        mockMvc.perform(post("/api/users/signin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_LOGIN"));
    }
}
