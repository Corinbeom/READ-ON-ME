package bookapp.bookappback.user.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class KakaoLoginClientTest {
    @Test
    void exchangesCodeWithTheServerCredentialsAndReadsKakaoIdentity() {
        var builder = RestClient.builder();
        var mock = MockRestServiceServer.bindTo(builder).build();
        var client = new KakaoLoginClient(builder.build());
        var settings = new KakaoLoginSettings("js", "rest", "secret", "https://example.test/auth/kakao/callback");
        var form = new LinkedMultiValueMap<String, String>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", "rest");
        form.add("client_secret", "secret");
        form.add("redirect_uri", settings.redirectUri());
        form.add("code", "example-code");
        mock.expect(requestTo("https://kauth.kakao.com/oauth/token"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().formData(form))
                .andRespond(withSuccess("{\"access_token\":\"provider-token\",\"expires_in\":600}", MediaType.APPLICATION_JSON));
        mock.expect(requestTo(startsWith("https://kapi.kakao.com/v2/user/me?property_keys=")))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer provider-token"))
                .andExpect(request -> assertEquals("property_keys=[\"kakao_account.profile\"]", request.getURI().getQuery()))
                .andRespond(withSuccess("""
                        {"id":9007199254740993,"kakao_account":{"profile":{"nickname":"독자"}}}
                        """, MediaType.APPLICATION_JSON));

        var account = client.exchange("example-code", settings);
        assertEquals(9007199254740993L, account.id());
        assertEquals("독자", account.nickname());
        mock.verify();
    }
}
