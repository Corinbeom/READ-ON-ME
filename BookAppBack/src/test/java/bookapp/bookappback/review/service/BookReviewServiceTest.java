package bookapp.bookappback.review.service;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.common.exception.ReviewExceptions;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.review.dto.ReviewRequest;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.review.repository.BookReviewRepository;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookReviewServiceTest {

    @Mock private BookReviewRepository bookReviewRepository;
    @Mock private UserRepository userRepository;
    @Mock private BookRepository bookRepository;

    @InjectMocks
    private BookReviewService bookReviewService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    // ✅ 리뷰 작성 성공
    @Test
    @DisplayName("리뷰 작성 성공")
    void createReview_success() {
        User user = new User("test@example.com", "encoded", "nickname", null);
        user.setId(1L);
        Book book = new Book();
        book.setId(1L);

        ReviewRequest req = new ReviewRequest();
        req.setComment("좋은 책이에요");
        req.setRating(5);

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));

        assertDoesNotThrow(() -> bookReviewService.createReview(1L, req, 1L));
        verify(bookReviewRepository, times(1)).save(any(BookReview.class));
    }

    // ⚠️ 유저 없음
    @Test
    @DisplayName("리뷰 작성 실패 - 유저 없음")
    void createReview_userNotFound() {
        when(userRepository.findById(1L)).thenReturn(Optional.empty());
        ReviewRequest req = new ReviewRequest();
        req.setComment("내용");
        req.setRating(5);

        assertThrows(UserExceptions.UserNotFoundException.class, () ->
                bookReviewService.createReview(1L, req, 1L));
    }

    // ⚠️ 책 없음
    @Test
    @DisplayName("리뷰 작성 실패 - 책 없음")
    void createReview_bookNotFound() {
        User user = new User("test@example.com", "encoded", "nickname", null);
        user.setId(1L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(bookRepository.findById(1L)).thenReturn(Optional.empty());

        ReviewRequest req = new ReviewRequest();
        req.setComment("내용");
        req.setRating(5);

        assertThrows(BookExceptions.BookNotFoundException.class, () ->
                bookReviewService.createReview(1L, req, 1L));
    }

    // ⚠️ 리뷰 없음
    @Test
    @DisplayName("리뷰 수정 실패 - 존재하지 않는 리뷰")
    void updateReview_notFound() {
        when(bookReviewRepository.findById(10L)).thenReturn(Optional.empty());
        ReviewRequest req = new ReviewRequest();
        req.setComment("수정 내용");
        req.setRating(4);

        assertThrows(ReviewExceptions.ReviewNotFoundException.class, () ->
                bookReviewService.updateReview(10L, req, 1L));
    }

    // ⚠️ 리뷰 권한 없음
    @Test
    @DisplayName("리뷰 수정 실패 - 권한 없음")
    void updateReview_accessDenied() {
        User user1 = new User("user1@example.com", "encoded", "nick1", null);
        user1.setId(1L);
        User user2 = new User("user2@example.com", "encoded", "nick2", null);
        user2.setId(2L);

        BookReview review = new BookReview();
        review.setId(100L);
        review.setUser(user1);

        ReviewRequest req = new ReviewRequest();
        req.setComment("내용");
        req.setRating(3);

        when(bookReviewRepository.findById(100L)).thenReturn(Optional.of(review));

        assertThrows(ReviewExceptions.ReviewAccessDeniedException.class, () ->
                bookReviewService.updateReview(100L, req, 2L));
    }

    @Test
    @DisplayName("리뷰 삭제 성공")
    void deleteReview_success() {
        User user = new User("user@example.com", "encoded", "nickname", null);
        user.setId(1L);

        BookReview review = new BookReview();
        review.setId(10L);
        review.setUser(user);

        when(bookReviewRepository.findById(10L)).thenReturn(Optional.of(review));

        assertDoesNotThrow(() -> bookReviewService.deleteReview(10L, 1L));
        verify(bookReviewRepository, times(1)).delete(review);
    }

    @Test
    @DisplayName("리뷰 삭제 실패 - 권한 없음")
    void deleteReview_accessDenied() {
        User owner = new User("owner@example.com", "encoded", "owner", null);
        owner.setId(1L);
        User otherUser = new User("other@example.com", "encoded", "other", null);
        otherUser.setId(2L);

        BookReview review = new BookReview();
        review.setId(10L);
        review.setUser(owner);

        when(bookReviewRepository.findById(10L)).thenReturn(Optional.of(review));

        assertThrows(ReviewExceptions.ReviewAccessDeniedException.class, () ->
                bookReviewService.deleteReview(10L, 2L));
    }

}
