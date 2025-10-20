package bookapp.bookappback.user.controller;

import bookapp.bookappback.common.dto.ApiResponse;
import bookapp.bookappback.security.dto.ChangePasswordRequest;
import bookapp.bookappback.security.dto.SignInRequest;
import bookapp.bookappback.security.dto.SignUpRequest;
import bookapp.bookappback.security.dto.TokenResponse;
import bookapp.bookappback.user.dto.UpdateProfileRequest;
import bookapp.bookappback.user.dto.UserResponse;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
@Tag(name = "User", description = "사용자 관리 API")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @PostMapping("/signup")
    @Operation(summary = "회원가입", description = "새로운 사용자를 등록합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "회원가입 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "잘못된 요청")
    })
    public ResponseEntity<ApiResponse<UserResponse>> signUp(@Valid @RequestBody SignUpRequest request) {
        UserResponse userResponse = userService.signUp(request);
        return ResponseEntity.ok(new ApiResponse<>(true, "회원가입 성공", userResponse));
    }

    @PostMapping("/signin")
    @Operation(summary = "로그인", description = "사용자 인증을 수행하고 JWT 토큰을 발급합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그인 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "로그인 실패")
    })
    public ResponseEntity<ApiResponse<TokenResponse>> signIn(@Valid @RequestBody SignInRequest request) {
        TokenResponse tokenResponse = userService.signIn(request);
        return ResponseEntity.ok(new ApiResponse<>(true, "로그인 성공", tokenResponse));
    }

    @GetMapping("/profile")
    @Operation(summary = "프로필 조회", description = "현재 로그인한 사용자의 프로필 정보를 조회합니다.")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<ApiResponse<UserResponse>> getProfile(@AuthenticationPrincipal User user) {
        UserResponse userResponse = userService.getUserProfile(user.getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "프로필 조회 성공", userResponse));
    }

    @PutMapping("/profile")
    @Operation(summary = "프로필 수정", description = "현재 로그인한 사용자의 프로필 정보를 수정합니다.")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<ApiResponse<Void>> updateProfile(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        userService.updateUserProfile(user.getId(), request);
        return ResponseEntity.ok(new ApiResponse<>(true, "프로필이 성공적으로 수정되었습니다."));
    }

    @PutMapping("/password")
    @Operation(summary = "비밀번호 변경", description = "현재 로그인한 사용자의 비밀번호를 변경합니다.")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        userService.changePassword(user.getId(), request);
        return ResponseEntity.ok(new ApiResponse<>(true, "비밀번호가 성공적으로 변경되었습니다."));
    }
}