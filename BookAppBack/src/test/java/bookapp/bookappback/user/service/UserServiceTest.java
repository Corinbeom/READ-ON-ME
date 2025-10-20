package bookapp.bookappback.user.service;

import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.common.util.JwtUtil;
import bookapp.bookappback.security.dto.SignInRequest;
import bookapp.bookappback.security.dto.SignUpRequest;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtUtil jwtUtil;

    @InjectMocks
    private UserService userService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    // ✅ 회원가입 성공 케이스
    @Test
    @DisplayName("회원가입 성공 - 예외 없음")
    void signUp_success() {
        SignUpRequest request = new SignUpRequest("test@example.com", "password123", "nickname", null);

        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(request.getPassword())).thenReturn("encodedPassword");

        assertDoesNotThrow(() -> userService.signUp(request));

        verify(userRepository, times(1)).save(any(User.class));
    }

    // ⚠️ 이메일 중복 예외
    @Test
    @DisplayName("회원가입 실패 - 이메일 중복 예외 발생")
    void signUp_emailDuplicateException() {
        SignUpRequest request = new SignUpRequest("test@example.com", "password123", "nickname", null);
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);

        assertThrows(UserExceptions.EmailDuplicateException.class, () -> userService.signUp(request));
    }

    // ⚠️ 로그인 실패 - 이메일 없음
    @Test
    @DisplayName("로그인 실패 - 존재하지 않는 이메일")
    void signIn_userNotFound() {
        SignInRequest request = new SignInRequest("no_user@example.com", "password");
        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.empty());

        assertThrows(UserExceptions.InvalidLoginException.class, () -> userService.signIn(request));
    }

    // ⚠️ 로그인 실패 - 비밀번호 불일치
    @Test
    @DisplayName("로그인 실패 - 비밀번호 불일치")
    void signIn_invalidPassword() {
        SignInRequest request = new SignInRequest("test@example.com", "wrongpass");
        User user = new User("test@example.com", "encodedPassword", "nickname", null);

        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(request.getPassword(), user.getPassword())).thenReturn(false);

        assertThrows(UserExceptions.InvalidLoginException.class, () -> userService.signIn(request));
    }

    // ✅ 로그인 성공
    @Test
    @DisplayName("로그인 성공 - JWT 토큰 생성")
    void signIn_success() {
        SignInRequest request = new SignInRequest("test@example.com", "password");
        User user = new User("test@example.com", "encodedPassword", "nickname", null);

        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(request.getPassword(), user.getPassword())).thenReturn(true);
        when(jwtUtil.generateToken(anyLong(), eq(user.getEmail()))).thenReturn("fake.jwt.token");
        when(jwtUtil.getExpirationTimeInSeconds()).thenReturn(3600L);

        assertDoesNotThrow(() -> userService.signIn(request));
    }
}
