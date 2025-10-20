package bookapp.bookappback.review.service;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.book.service.KakaoBookService;
import bookapp.bookappback.review.dto.ReviewRequest;
import bookapp.bookappback.review.dto.ReviewResponse;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.review.repository.BookReviewRepository;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class BookReviewService {

    private final BookReviewRepository bookReviewRepository;
    private final UserRepository userRepository;
    private final BookRepository bookRepository;

    public Long createReview(Long bookId, ReviewRequest reviewRequest, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("해당 유저를 찾을 수 없습니다."));
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new IllegalArgumentException("해당 책을 찾을 수 없습니다."));

        BookReview bookReview = new BookReview();
        bookReview.setUser(user);
        bookReview.setComment(reviewRequest.getComment());
        bookReview.setRating(reviewRequest.getRating());

        bookReview.setBook(book);

        bookReviewRepository.save(bookReview);

        return bookReview.getId();
    }

    public List<ReviewResponse> getReviewsByBook(Long bookId) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new IllegalArgumentException("해당 책을 찾을 수 없습니다"));

        return bookReviewRepository.findByBook(book).stream()
                .map(ReviewResponse::new)
                .toList();
    }

    public void updateReview(Long reviewId, ReviewRequest reviewRequest, Long userId) {
        BookReview review = bookReviewRepository.findById(reviewId)
                .orElseThrow(() -> new IllegalArgumentException("해당 리뷰를 찾을 수 없습니다"));

        if (!review.getUser().getId().equals(userId)) {
            throw new SecurityException("리뷰 수정 권한이 없습니다.");
        }

        review.setComment(reviewRequest.getComment());
        review.setRating(reviewRequest.getRating());
    }

    public void deleteReview(Long reviewId, Long userId) {
        BookReview review = bookReviewRepository.findById(reviewId)
                .orElseThrow(() -> new IllegalArgumentException("해당 리뷰를 찾을 수 없습니다"));

        if (!review.getUser().getId().equals(userId)) {
            throw new SecurityException("리뷰 삭제 권한이 없습니다");
        }

        bookReviewRepository.delete(review);
    }
}
