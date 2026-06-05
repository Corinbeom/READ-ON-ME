package bookapp.bookappback.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Profile("prod")
@Component
public class ProdSecretValidator {

    private static final Logger log = LoggerFactory.getLogger(ProdSecretValidator.class);
    private static final Set<String> FORBIDDEN = Set.of("change-me", "dev-internal-token", "readonme");
    private static final int MIN_SECRET_LEN = 32;

    @Value("${jwt.secret:}")
    String jwtSecret;

    @Value("${internal.api.token:}")
    String internalApiToken;

    @Value("${spring.datasource.password:}")
    String dbPassword;

    @Value("${cors.allowed.origins:}")
    String corsUrl;

    @Value("${ai.base-url:}")
    String aiBaseUrl;

    @PostConstruct
    public void validate() {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        checkSecret("JWT_SECRET", jwtSecret, errors);
        checkSecret("INTERNAL_API_TOKEN", internalApiToken, errors);
        checkDbPassword(errors);
        checkLocalhostUrl("CORS_URL", corsUrl, warnings);
        checkLocalhostUrl("AI_BASE_URL", aiBaseUrl, warnings);

        warnings.forEach(w -> log.warn("[운영 설정 경고] {}", w));

        if (!errors.isEmpty()) {
            throw new IllegalStateException(
                "[운영 필수 설정 오류] 아래 값을 확인 후 재배포하세요:\n" + String.join("\n", errors)
            );
        }
    }

    private void checkSecret(String name, String value, List<String> errors) {
        if (value == null || value.isBlank()) {
            errors.add("  - " + name + ": 값이 비어 있습니다.");
        } else if (FORBIDDEN.contains(value)) {
            errors.add("  - " + name + ": 개발용 기본값 사용 불가 ('" + value + "')");
        } else if (value.length() < MIN_SECRET_LEN) {
            errors.add("  - " + name + ": 너무 짧습니다. 최소 " + MIN_SECRET_LEN + "자 이상 필요 (현재 " + value.length() + "자)");
        }
    }

    private void checkDbPassword(List<String> errors) {
        if (dbPassword == null || dbPassword.isBlank()) {
            errors.add("  - DB_PASSWORD: 값이 비어 있습니다.");
        } else if (FORBIDDEN.contains(dbPassword)) {
            errors.add("  - DB_PASSWORD: 개발용 기본값 사용 불가 ('" + dbPassword + "')");
        }
    }

    private void checkLocalhostUrl(String name, String value, List<String> warnings) {
        if (value != null && value.contains("localhost")) {
            warnings.add(name + " 에 localhost 포함: '" + value + "' — 운영 URL로 교체를 권장합니다.");
        }
    }
}
