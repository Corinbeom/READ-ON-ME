package bookapp.bookappback.user.service;

import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.security.dto.TokenResponse;
import bookapp.bookappback.user.entity.User;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
@EnableConfigurationProperties(KakaoLoginSettings.class)
public class KakaoLoginService {
    private static final Duration FLOW_TTL = Duration.ofMinutes(10);
    private static final int MAX_SIGNUP_ATTEMPTS = 5;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final HexFormat HEX = HexFormat.of();

    private final KakaoLoginSettings settings;
    private final StringRedisTemplate redis;
    private final KakaoLoginClient client;
    private final UserService userService;

    public StartResult start(String challenge) {
        if (!settings.enabled()) return null;
        byte[] entropy = new byte[32];
        RANDOM.nextBytes(entropy);
        String state = HEX.formatHex(entropy);
        try {
            redis.opsForValue().set(flowKey(state, challenge), "1", FLOW_TTL);
        } catch (DataAccessException e) {
            throw unavailable();
        }
        return new StartResult(state, settings.javascriptKey(), settings.redirectUri(), FLOW_TTL.toSeconds());
    }

    public TokenResponse exchange(String code, String state, String verifier) {
        if (!settings.enabled()) throw unavailable();
        String marker;
        try {
            marker = redis.opsForValue().getAndDelete(flowKey(state, challengeFor(verifier)));
        } catch (DataAccessException e) {
            throw unavailable();
        }
        if (marker == null) {
            throw new AppException(HttpStatus.BAD_REQUEST, "INVALID_KAKAO_LOGIN", "로그인 요청이 만료됐어요. 다시 시작해주세요.");
        }

        var user = client.exchange(code, settings);
        for (int i = 0; i < MAX_SIGNUP_ATTEMPTS; i++) {
            try {
                return userService.signInWithKakao(user.id());
            } catch (DataIntegrityViolationException failure) {
                // Each attempt starts a new transaction after a competing insert wins.
                if (!UserService.violatesConstraint(failure, User.KAKAO_ID_CONSTRAINT)
                        && !UserService.violatesConstraint(failure, User.NICKNAME_CONSTRAINT)) throw failure;
            }
        }
        throw unavailable();
    }

    private static String flowKey(String state, String challenge) {
        return "auth:kakao:" + state + ":" + challenge;
    }

    static String challengeFor(String verifier) {
        try {
            return HEX.formatHex(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private static AppException unavailable() {
        return new AppException(HttpStatus.SERVICE_UNAVAILABLE, "KAKAO_LOGIN_UNAVAILABLE", "카카오 로그인을 잠시 사용할 수 없어요.");
    }

    public record StartResult(
            String state,
            @JsonProperty("javascript_key") String javascriptKey,
            @JsonProperty("redirect_uri") String redirectUri,
            @JsonProperty("expires_in_seconds") long expiresInSeconds
    ) {}
}
