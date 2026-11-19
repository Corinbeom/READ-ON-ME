package bookapp.bookappback.user.controller;

import bookapp.bookappback.common.dto.ApiResponse;
import bookapp.bookappback.security.dto.TokenResponse;
import bookapp.bookappback.user.service.KakaoLoginService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/kakao")
@RequiredArgsConstructor
public class KakaoLoginController {
    private static final String FLOW_VALUE = "[0-9a-f]{64}";
    private final KakaoLoginService loginService;

    @PostMapping("/start")
    public ResponseEntity<KakaoLoginService.StartResult> start(@Valid @RequestBody StartRequest request) {
        var flow = loginService.start(request.challenge());
        if (flow == null) return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(flow);
    }

    @PostMapping("/exchange")
    public ResponseEntity<ApiResponse<TokenResponse>> exchange(@Valid @RequestBody ExchangeRequest request) {
        var token = loginService.exchange(request.code(), request.state(), request.verifier());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new ApiResponse<>(true, "로그인 성공", token));
    }

    public record StartRequest(@NotBlank @Pattern(regexp = FLOW_VALUE) String challenge) {}
    public record ExchangeRequest(@NotBlank @Size(max = 2048) String code,
                                  @NotBlank @Pattern(regexp = FLOW_VALUE) String state,
                                  @NotBlank @Pattern(regexp = FLOW_VALUE) String verifier) {}
}
