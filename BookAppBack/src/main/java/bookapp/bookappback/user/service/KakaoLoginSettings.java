package bookapp.bookappback.user.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@ConfigurationProperties("app.kakao-login")
public record KakaoLoginSettings(String javascriptKey, String restApiKey, String clientSecret, String redirectUri) {
    public boolean enabled() {
        return StringUtils.hasText(javascriptKey) && StringUtils.hasText(restApiKey)
                && StringUtils.hasText(clientSecret) && StringUtils.hasText(redirectUri);
    }
}
