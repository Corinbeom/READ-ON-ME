package bookapp.bookappback.user.service;

import bookapp.bookappback.common.exception.AppException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;

@Component
@Slf4j
public class KakaoLoginClient {
    private final RestClient client;

    @Autowired
    public KakaoLoginClient(RestClient.Builder builder) {
        this(builder.requestFactory(requestFactory()).build());
    }

    KakaoLoginClient(RestClient client) {
        this.client = client;
    }

    private static JdkClientHttpRequestFactory requestFactory() {
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(5));
        return factory;
    }

    public KakaoUser exchange(String code, KakaoLoginSettings settings) {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", settings.restApiKey());
        form.add("client_secret", settings.clientSecret());
        form.add("redirect_uri", settings.redirectUri());
        form.add("code", code);

        try {
            Token token = client.post().uri("https://kauth.kakao.com/oauth/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form).retrieve().body(Token.class);
            if (token == null || !StringUtils.hasText(token.accessToken())) throw unavailable();

            KakaoUser user = client.get().uri("https://kapi.kakao.com/v1/user/access_token_info")
                    .headers(headers -> headers.setBearerAuth(token.accessToken()))
                    .retrieve().body(KakaoUser.class);
            if (user == null || user.id() == null || user.id() <= 0) throw unavailable();
            return user;
        } catch (RestClientResponseException e) {
            log.warn("Kakao login provider returned HTTP {}", e.getStatusCode().value());
            throw unavailable();
        } catch (RestClientException e) {
            log.warn("Kakao login provider request failed: {}", e.getClass().getSimpleName());
            throw unavailable();
        }
    }

    private static AppException unavailable() {
        return new AppException(HttpStatus.BAD_GATEWAY, "KAKAO_PROVIDER_ERROR", "카카오 로그인을 완료할 수 없어요. 다시 시도해주세요.");
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Token(@JsonProperty("access_token") String accessToken) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KakaoUser(Long id) {}
}
