package bookapp.bookappback.review.controller;

import bookapp.bookappback.common.dto.ApiResponse;
import bookapp.bookappback.review.dto.ReviewRequest;
import bookapp.bookappback.review.dto.ReviewResponse;
import bookapp.bookappback.review.service.BookReviewService;
import bookapp.bookappback.security.UserDetailsImpl; // UserDetailsImpl import
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/books")
@RequiredArgsConstructor
public class BookReviewController {

    private final BookReviewService bookReviewService;

    @PostMapping("/{bookId}/review")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Long>> createReview(
            @PathVariable Long bookId,
            @RequestBody ReviewRequest reviewRequest,
            @AuthenticationPrincipal UserDetailsImpl userDetails) { // User -> UserDetailsImpl

        // userDetails에서 User 객체를 꺼내서 ID를 사용합니다.
        Long reviewId = bookReviewService.createReview(bookId, reviewRequest, userDetails.getUser().getId());

        URI location = URI.create(String.format("/api/book/%d/review", reviewId));
        ApiResponse<Long> responseBody = new ApiResponse<>(true, "리뷰가 성공적으로 등록되었습니다.", reviewId);
        return ResponseEntity.created(location).body(responseBody);
    }

    @GetMapping("/{bookId}/reviews")
    public ResponseEntity<ApiResponse<List<ReviewResponse>>> getReviewByBook(
            @PathVariable Long bookId) {
        List<ReviewResponse> reviews = bookReviewService.getReviewsByBook(bookId);
        ApiResponse<List<ReviewResponse>> responseBody = new ApiResponse<>(true, "리뷰 조회 성공", reviews);
        return ResponseEntity.ok(responseBody);
    }

    @PutMapping("/review/{reviewId}") // 경로 수정: /api/book/review/{reviewId}
    public ResponseEntity<ApiResponse<Void>> updateReview(
            @PathVariable Long reviewId,
            @RequestBody ReviewRequest reviewRequest,
            @AuthenticationPrincipal UserDetailsImpl userDetails) { // User -> UserDetailsImpl

        bookReviewService.updateReview(reviewId, reviewRequest, userDetails.getUser().getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "리뷰가 성공적으로 수정되었습니다"));
    }

    @DeleteMapping("/review/{reviewId}") // 경로 수정: /api/book/review/{reviewId}
    public ResponseEntity<ApiResponse<Void>> deleteReview(
            @PathVariable Long reviewId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) { // User -> UserDetailsImpl

        bookReviewService.deleteReview(reviewId, userDetails.getUser().getId());
        return ResponseEntity.ok(new ApiResponse<>(true, "리뷰가 성공적으로 삭제되었습니다."));
    }
}