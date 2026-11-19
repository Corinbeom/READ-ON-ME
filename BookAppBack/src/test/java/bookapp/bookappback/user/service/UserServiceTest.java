package bookapp.bookappback.user.service;

import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.common.util.JwtUtil;
import bookapp.bookappback.security.dto.SignInRequest;
import bookapp.bookappback.security.dto.SignUpRequest;
import bookapp.bookappback.user.dto.UpdateProfileRequest;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.sql.SQLException;
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
        SignUpRequest request = new SignUpRequest("test@example.com", "password123", "nickname", null, null);

        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(request.getPassword())).thenReturn("encodedPassword");

        assertDoesNotThrow(() -> userService.signUp(request));

        verify(userRepository, times(1)).save(any(User.class));
    }

    // ⚠️ 이메일 중복 예외
    @Test
    @DisplayName("회원가입 실패 - 이메일 중복 예외 발생")
    void signUp_emailDuplicateException() {
        SignUpRequest request = new SignUpRequest("test@example.com", "password123", "nickname", null, null);
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
        User user = new User("test@example.com", "encodedPassword", "nickname", null, null);

        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(request.getPassword(), user.getPassword())).thenReturn(false);

        assertThrows(UserExceptions.InvalidLoginException.class, () -> userService.signIn(request));
    }

    // ✅ 로그인 성공
    @Test
    @DisplayName("로그인 성공 - JWT 토큰 생성")
    void signIn_success() {
        SignInRequest request = new SignInRequest("test@example.com", "password");
        User user = new User("test@example.com", "encodedPassword", "nickname", null, null);
        user.setId(10L);

        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(request.getPassword(), user.getPassword())).thenReturn(true);
        when(jwtUtil.generateToken(anyLong(), eq(user.getEmail()))).thenReturn("fake.jwt.token");
        when(jwtUtil.getExpirationTimeInSeconds()).thenReturn(3600L);

        assertDoesNotThrow(() -> userService.signIn(request));
    }

    @Test
    void kakaoAccountIsCreatedWithoutEmailAndReusedByKakaoId() {
        long kakaoId = 40001L;
        User[] stored = new User[1];
        when(userRepository.findByKakaoId(kakaoId)).thenAnswer(call -> Optional.ofNullable(stored[0]));
        when(userRepository.saveAndFlush(any(User.class))).thenAnswer(call -> {
            User user = call.getArgument(0);
            user.setId(37L);
            stored[0] = user;
            return user;
        });
        userService.signInWithKakao(kakaoId);

        assertNull(stored[0].getEmail());
        assertNull(stored[0].getPassword());
        assertEquals(Long.valueOf(kakaoId), stored[0].getKakaoId());
        assertTrue(stored[0].getNickname().matches("[가-힣 ]+ [가-힣]+"));
        assertTrue(stored[0].getNickname().length() <= 10);

        stored[0].setNickname("기존 닉네임");
        userService.signInWithKakao(kakaoId);
        assertEquals("기존 닉네임", stored[0].getNickname());
        verify(userRepository).saveAndFlush(any(User.class));
        verify(jwtUtil, times(2)).generateToken(37L, "kakao:37");
        verifyNoInteractions(passwordEncoder);

        when(userRepository.findById(37L)).thenReturn(Optional.of(stored[0]));
        assertEquals("kakao:37", userService.loadUserByUsername("kakao:37").getUsername());
        assertThrows(UsernameNotFoundException.class, () -> userService.loadUserByUsername("kakao:invalid"));
    }

    @Test
    void suggestsAnotherAvailableNicknameWithoutSavingIt() {
        String current = userService.suggestNickname(null);
        when(userRepository.existsByNickname(anyString())).thenReturn(true, false);

        String suggestion = userService.suggestNickname(current);

        assertNotEquals(current, suggestion);
        assertTrue(suggestion.length() <= 10);
        verify(userRepository, times(3)).existsByNickname(anyString());
        verify(userRepository, never()).saveAndFlush(any(User.class));
    }

    @Test
    void savesAndReturnsTheNormalizedNickname() {
        User user = User.forKakao(20L, "이전 닉네임");
        user.setId(1L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));

        var profile = userService.updateUserProfile(1L, new UpdateProfileRequest(" 달을 보는 여우 ", null));

        assertEquals("달을 보는 여우", profile.getNickname());
        verify(userRepository).saveAndFlush(user);
    }

    @Test
    void reportsDuplicateWhenAnotherUserSavesTheNameFirst() {
        var user = User.forKakao(20L, "이전 닉네임");
        user.setId(1L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(userRepository.saveAndFlush(user)).thenThrow(new DataIntegrityViolationException("concurrent edit",
                new ConstraintViolationException("duplicate", new SQLException("duplicate", "23505"), User.NICKNAME_CONSTRAINT)));

        assertThrows(UserExceptions.NickNameDuplicateException.class, () ->
                userService.updateUserProfile(1L, new UpdateProfileRequest("작은 여우", null)));
    }
}
