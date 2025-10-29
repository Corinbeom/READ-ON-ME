package bookapp.bookappback.review.controller;

import bookapp.bookappback.common.dto.ApiResponse;
import bookapp.bookappback.review.dto.ReviewRequest;
import bookapp.bookappback.review.dto.ReviewResponse;
import bookapp.bookappback.review.service.BookReviewService;
import bookapp.bookappback.security.UserDetailsImpl; // UserDetailsImpl import
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api") // Changed base path to /api
@RequiredArgsConstructor
public class BookReviewController {

    private final BookReviewService bookReviewService;

    @PostMapping("/books/{bookId}/review") // Updated path
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Long>> createReview(
            @PathVariable Long bookId,
            @RequestBody ReviewRequest reviewRequest,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Long reviewId = bookReviewService.createReview(bookId, reviewRequest, userDetails.getUser().getId());

        URI location = URI.create(String.format("/api/book/%d/review", reviewId));
        ApiResponse<Long> responseBody = new ApiResponse<>(true, "리뷰가 성공적으로 등록되었습니다.", reviewId);
        return ResponseEntity.created(location).body(responseBody);
    }

    @GetMapping("/books/{bookId}/reviews") // Updated path
    public ResponseEntity<ApiResponse<Slice<ReviewResponse>>> getReviewsByBook(
            @PathVariable Long bookId,
            @AuthenticationPrincipal UserDetailsImpl userDetails,
            @RequestParam(defaultValue = "latest") String sort,
            Pageable pageable) {
        // 비로그인 사용자도 조회 가능하도록 userDetails가 null일 수 있음을 처리
        Slice<ReviewResponse> reviews = bookReviewService.getReviewsByBook(
                bookId,
                userDetails != null ? userDetails.getUser() : null,
                sort,
                pageable
        );
        ApiResponse<Slice<ReviewResponse>> responseBody = new ApiResponse<>(true, "리뷰 조회 성공", reviews);
        return ResponseEntity.ok(responseBody);
    }

    @GetMapping("/reviews/my") // New endpoint for fetching user's reviews
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<List<ReviewResponse>>> getReviewsByMyUser(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        List<ReviewResponse> reviews = bookReviewService.getReviewsByUser(userDetails.getUser().getId());
        ApiResponse<List<ReviewResponse>> responseBody = new ApiResponse<>(true, "사용자 리뷰 조회 성공", reviews);
        return ResponseEntity.ok(responseBody);
    }

    @PutMapping("/books/review/{reviewId}") // Updated path
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Void>> updateReview(
            @PathVariable Long reviewId,
            @RequestBody ReviewRequest reviewRequest,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        bookReviewService.updateReview(reviewId, reviewRequest, userDetails.getUser().getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "리뷰가 성공적으로 수정되었습니다"));
    }

    @DeleteMapping("/books/review/{reviewId}") // Updated path
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Void>> deleteReview(
            @PathVariable Long reviewId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        bookReviewService.deleteReview(reviewId, userDetails.getUser().getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "리뷰가 성공적으로 삭제되었습니다."));
    }

    @PostMapping("/books/review/{reviewId}/like") // Updated path
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Void>> toggleReviewLike(
            @PathVariable Long reviewId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        bookReviewService.toggleReviewLike(reviewId, userDetails.getUser().getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "요청이 처리되었습니다."));
    }
}