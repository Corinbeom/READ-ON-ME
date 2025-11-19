package bookapp.bookappback.notification.controller;

import bookapp.bookappback.common.dto.ApiResponse;
import bookapp.bookappback.notification.dto.NotificationResponse;
import bookapp.bookappback.notification.service.NotificationService;
import bookapp.bookappback.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("isAuthenticated()")
    public SseEmitter connect(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        return notificationService.subscribe(userDetails.getUser().getId());
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<List<NotificationResponse>>> getNotifications(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        List<NotificationResponse> notifications = notificationService.getNotifications(userDetails.getUser().getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "알림 조회 성공", notifications));
    }

    @PostMapping("/{notificationId}/read")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Void>> markAsRead(
            @PathVariable Long notificationId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        notificationService.markAsRead(notificationId, userDetails.getUser().getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "알림 읽음 처리 완료"));
    }

    @PostMapping("/read-all")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Void>> markAllAsRead(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        notificationService.markAllAsRead(userDetails.getUser().getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "전체 알림 읽음 처리 완료"));
    }
}
