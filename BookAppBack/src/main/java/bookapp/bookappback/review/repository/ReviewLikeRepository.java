package bookapp.bookappback.review.repository;

import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.review.entity.ReviewLike;
import bookapp.bookappback.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ReviewLikeRepository extends JpaRepository<ReviewLike, Long> {

    Optional<ReviewLike> findByUserAndReview(User user, BookReview review);

    long countByReview(BookReview review);
}
