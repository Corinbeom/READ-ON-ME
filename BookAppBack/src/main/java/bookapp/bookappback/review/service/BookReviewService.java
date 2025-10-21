package bookapp.bookappback.review.service;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.common.exception.ReviewExceptions;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.review.dto.ReviewRequest;
import bookapp.bookappback.review.dto.ReviewResponse;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.review.repository.BookReviewRepository;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class BookReviewService {

    private final BookReviewRepository bookReviewRepository;
    private final UserRepository userRepository;
    private final BookRepository bookRepository;

    // ✅ 리뷰 작성
    public Long createReview(Long bookId, ReviewRequest reviewRequest, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookExceptions.BookNotFoundException(String.valueOf(bookId)));

        // 간단한 유효성 검사
        if (reviewRequest.getComment() == null || reviewRequest.getComment().isBlank()) {
            throw new ReviewExceptions.InvalidReviewContentException();
        }

        BookReview bookReview = new BookReview();
        bookReview.setUser(user);
        bookReview.setBook(book);
        bookReview.setComment(reviewRequest.getComment());
        bookReview.setRating(reviewRequest.getRating());

        bookReviewRepository.save(bookReview);
        return bookReview.getId();
    }

    // ✅ 책별 리뷰 조회
    public List<ReviewResponse> getReviewsByBook(Long bookId) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookExceptions.BookNotFoundException(String.valueOf(bookId)));

        List<BookReview> reviews = bookReviewRepository.findByBook(book);

        return reviews.stream()
                .map(ReviewResponse::new)
                .toList();
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
}
