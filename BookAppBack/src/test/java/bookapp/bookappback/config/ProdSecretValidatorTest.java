package bookapp.bookappback.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatNoException;

class ProdSecretValidatorTest {

    private static final String VALID_SECRET = "super-secure-random-secret-key-at-least-32chars";
    private static final String VALID_TOKEN  = "super-secure-internal-token-at-least-32chars!!";
    private static final String VALID_DB_PW  = "str0ng-db-password";
    private static final String SAFE_CORS    = "https://example.com";
    private static final String SAFE_AI_URL  = "http://ai:8000";

    private ProdSecretValidator validator;

    @BeforeEach
    void setUp() {
        validator = new ProdSecretValidator();
        setFields(VALID_SECRET, VALID_TOKEN, VALID_DB_PW, SAFE_CORS, SAFE_AI_URL);
    }

    @Test
    void passesWhenAllValuesAreValid() {
        assertThatNoException().isThrownBy(validator::validate);
    }

    @Test
    void failsWhenJwtSecretIsEmpty() {
        ReflectionTestUtils.setField(validator, "jwtSecret", "");
        assertThatThrownBy(validator::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("JWT_SECRET");
    }

    @Test
    void failsWhenJwtSecretIsChangeMe() {
        ReflectionTestUtils.setField(validator, "jwtSecret", "change-me");
        assertThatThrownBy(validator::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("JWT_SECRET");
    }

    @Test
    void failsWhenJwtSecretIsTooShort() {
        ReflectionTestUtils.setField(validator, "jwtSecret", "short");
        assertThatThrownBy(validator::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("JWT_SECRET")
            .hasMessageContaining("짧습니다");
    }

    @Test
    void failsWhenInternalApiTokenIsDevDefault() {
        ReflectionTestUtils.setField(validator, "internalApiToken", "dev-internal-token");
        assertThatThrownBy(validator::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("INTERNAL_API_TOKEN");
    }

    @Test
    void failsWhenDbPasswordIsReadonme() {
        ReflectionTestUtils.setField(validator, "dbPassword", "readonme");
        assertThatThrownBy(validator::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("DB_PASSWORD");
    }

    @Test
    void failsWhenDbPasswordIsEmpty() {
        ReflectionTestUtils.setField(validator, "dbPassword", "");
        assertThatThrownBy(validator::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("DB_PASSWORD");
    }

    @Test
    void reportsAllErrorsAtOnce() {
        setFields("change-me", "dev-internal-token", "readonme", SAFE_CORS, SAFE_AI_URL);
        assertThatThrownBy(validator::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("JWT_SECRET")
            .hasMessageContaining("INTERNAL_API_TOKEN")
            .hasMessageContaining("DB_PASSWORD");
    }

    @Test
    void doesNotFailOnLocalhostCorsUrl() {
        // CORS_URL localhost → 경고만, 시작 실패 아님
        ReflectionTestUtils.setField(validator, "corsUrl", "http://localhost:8081");
        assertThatNoException().isThrownBy(validator::validate);
    }

    private void setFields(String jwt, String token, String dbPw, String cors, String aiUrl) {
        ReflectionTestUtils.setField(validator, "jwtSecret",        jwt);
        ReflectionTestUtils.setField(validator, "internalApiToken", token);
        ReflectionTestUtils.setField(validator, "dbPassword",       dbPw);
        ReflectionTestUtils.setField(validator, "corsUrl",          cors);
        ReflectionTestUtils.setField(validator, "aiBaseUrl",        aiUrl);
    }
}
