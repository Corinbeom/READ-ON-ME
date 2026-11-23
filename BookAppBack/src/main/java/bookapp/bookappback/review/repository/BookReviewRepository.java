package bookapp.bookappback.review.repository;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.user.entity.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;

import java.util.List;
import java.util.Optional;

@Repository
public interface BookReviewRepository extends JpaRepository<BookReview, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from BookReview r where r.id = :id")
    Optional<BookReview> findByIdForUpdate(@Param("id") Long id);

    Slice<BookReview> findByBook(Book book, Pageable pageable);

    @Query("SELECT br FROM BookReview br JOIN FETCH br.book WHERE br.user = :user")
    List<BookReview> findByUserWithBook(@Param("user") User user);

    boolean existsByUserAndBook(User user, Book book);

    // DB 레벨 원자적 증가 — Race Condition 방지
    @Modifying
    @Query("UPDATE BookReview r SET r.likeCount = r.likeCount + 1 WHERE r.id = :reviewId")
    void incrementLikeCount(@Param("reviewId") Long reviewId);

    // DB 레벨 원자적 감소 (0 미만으로 내려가지 않도록 보호) — nativeQuery로 GREATEST 사용
    @Modifying
    @Query(value = "UPDATE book_review SET like_count = GREATEST(like_count - 1, 0) WHERE id = :reviewId", nativeQuery = true)
    void decrementLikeCount(@Param("reviewId") Long reviewId);
}
