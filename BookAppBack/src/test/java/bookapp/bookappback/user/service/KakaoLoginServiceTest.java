package bookapp.bookappback.user.service;

import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.security.dto.TokenResponse;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class KakaoLoginServiceTest {
    private final KakaoLoginSettings settings = new KakaoLoginSettings(
            "test-js", "test-rest", "test-secret", "https://example.test/auth/kakao/callback");
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final KakaoLoginClient kakao = mock(KakaoLoginClient.class);
    private final UserService users = mock(UserService.class);
    private final KakaoLoginService login = new KakaoLoginService(settings, redis, kakao, users);

    @Test
    void onlyTheMatchingVerifierCanConsumeTheFlowAndItCannotBeReplayed() {
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> values = mock(ValueOperations.class);
        Map<String, String> stored = new HashMap<>();
        when(redis.opsForValue()).thenReturn(values);
        doAnswer(call -> {
            stored.put(call.getArgument(0), call.getArgument(1));
            return null;
        }).when(values).set(anyString(), eq("1"), eq(Duration.ofMinutes(10)));
        when(values.getAndDelete(anyString())).thenAnswer(call -> stored.remove((String) call.getArgument(0)));
        String verifier = "a".repeat(64);
        var flow = login.start(KakaoLoginService.challengeFor(verifier));
        assertNotNull(flow);
        assertEquals(settings.redirectUri(), flow.redirectUri());
        assertTrue(flow.state().matches("[0-9a-f]{64}"));
        assertThrows(AppException.class, () -> login.exchange("code", flow.state(), "b".repeat(64)));
        verifyNoInteractions(kakao, users);

        var authenticatedUser = new KakaoLoginClient.KakaoUser(123L, null);
        var token = mock(TokenResponse.class);
        when(kakao.exchange("code", settings)).thenReturn(authenticatedUser);
        when(users.signInWithKakao(123L, null))
                .thenThrow(new DataIntegrityViolationException("concurrent signup")).thenReturn(token);

        assertSame(token, login.exchange("code", flow.state(), verifier));
        assertThrows(AppException.class, () -> login.exchange("code", flow.state(), verifier));
        verify(kakao, times(1)).exchange("code", settings);
        verify(users, times(2)).signInWithKakao(123L, null);
    }

    @Test
    void missingClientSecretKeepsKakaoLoginDisabled() {
        var disabled = new KakaoLoginService(
                new KakaoLoginSettings("js", "rest", "", settings.redirectUri()), redis, kakao, users);
        assertNull(disabled.start("a".repeat(64)));
        assertThrows(AppException.class, () -> disabled.exchange("code", "b".repeat(64), "c".repeat(64)));
        verifyNoInteractions(redis, kakao, users);
    }
}
