package bookapp.bookappback.review.service;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.common.exception.ReviewExceptions;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.notification.service.NotificationService;
import bookapp.bookappback.review.dto.ReviewRequest;
import bookapp.bookappback.review.dto.ReviewResponse;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.review.entity.ReviewLike;
import bookapp.bookappback.review.repository.BookReviewRepository;
import bookapp.bookappback.review.repository.ReviewLikeRepository;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class BookReviewService {

    private final BookReviewRepository bookReviewRepository;
    private final UserRepository userRepository;
    private final BookRepository bookRepository;
    private final ReviewLikeRepository reviewLikeRepository;
    private final NotificationService notificationService;

    // ✅ 리뷰 작성
    public Long createReview(Long bookId, ReviewRequest reviewRequest, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookExceptions.BookNotFoundException(String.valueOf(bookId)));

        // 1인 1리뷰 정책 확인
        if (bookReviewRepository.existsByUserAndBook(user, book)) {
            throw new ReviewExceptions.ReviewAlreadyExistsException(book.getIsbn13());
        }

        // 간단한 유효성 검사
        if (reviewRequest.getComment() == null || reviewRequest.getComment().isBlank()) {
            throw new ReviewExceptions.InvalidReviewContentException();
        }

        BookReview bookReview = new BookReview();
        bookReview.setUser(user);
        bookReview.setBook(book);
        bookReview.setComment(reviewRequest.getComment());
        bookReview.setRating(reviewRequest.getRating());
        bookReview.setCreatedAt(LocalDateTime.now());

        bookReviewRepository.save(bookReview);
        return bookReview.getId();
    }

    // ✅ 책별 리뷰 조회
    public Slice<ReviewResponse> getReviewsByBook(Long bookId, User currentUser, String sort, Pageable pageable) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookExceptions.BookNotFoundException(String.valueOf(bookId)));

        Sort sortOrder;
        if ("likes".equalsIgnoreCase(sort)) {
            sortOrder = Sort.by(Sort.Direction.DESC, "likeCount");
        } else {
            sortOrder = Sort.by(Sort.Direction.DESC, "createdAt");
        }

        pageable = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sortOrder);
        Slice<BookReview> reviews = bookReviewRepository.findByBook(book, pageable);

        return reviews.map(review -> {
            boolean isLiked = currentUser != null && review.getLikes().stream()
                    .anyMatch(like -> like.getUser().getId().equals(currentUser.getId()));
            return new ReviewResponse(review, review.getLikeCount(), isLiked);
        });
    }

    // ✅ 사용자별 리뷰 조회 (새로 추가)
    public List<ReviewResponse> getReviewsByUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        List<BookReview> reviews = bookReviewRepository.findByUserWithBook(user); // Changed to use findByUserWithBook

        return reviews.stream()
                .map(review -> new ReviewResponse(review, review.getLikeCount(), false)) // isLikedByCurrentUser is false as we are just listing reviews
                .collect(Collectors.toList());
    }


    // ✅ 리뷰 수정
    public void updateReview(Long reviewId, ReviewRequest reviewRequest, Long userId) {
        BookReview review = bookReviewRepository.findById(reviewId)
                .orElseThrow(() -> new ReviewExceptions.ReviewNotFoundException(reviewId));

        if (!review.getUser().getId().equals(userId)) {
            throw new ReviewExceptions.ReviewAccessDeniedException();
        }

        if (reviewRequest.getComment() == null || reviewRequest.getComment().isBlank()) {
            throw new ReviewExceptions.InvalidReviewContentException();
        }

        review.setComment(reviewRequest.getComment());
        review.setRating(reviewRequest.getRating());
        bookReviewRepository.save(review);
    }

    // ✅ 리뷰 삭제
    public void deleteReview(Long reviewId, Long userId) {
        BookReview review = bookReviewRepository.findById(reviewId)
                .orElseThrow(() -> new ReviewExceptions.ReviewNotFoundException(reviewId));

        if (!review.getUser().getId().equals(userId)) {
            throw new ReviewExceptions.ReviewAccessDeniedException();
        }

        bookReviewRepository.delete(review);
    }

    // ✅ 리뷰 좋아요 토글
    public void toggleReviewLike(Long reviewId, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));
        BookReview review = bookReviewRepository.findById(reviewId)
                .orElseThrow(() -> new ReviewExceptions.ReviewNotFoundException(reviewId));

        Optional<ReviewLike> existingLike = reviewLikeRepository.findByUserAndReview(user, review);

        if (existingLike.isPresent()) {
            review.getLikes().remove(existingLike.get());
            reviewLikeRepository.delete(existingLike.get());
            review.setLikeCount(review.getLikeCount() - 1); // 좋아요 카운트 감소
        } else {
            ReviewLike newLike = new ReviewLike(user, review);
            review.getLikes().add(newLike);
            review.setLikeCount(review.getLikeCount() + 1); // 좋아요 카운트 증가
            notificationService.notifyReviewLiked(review, user);
        }
    }
}
