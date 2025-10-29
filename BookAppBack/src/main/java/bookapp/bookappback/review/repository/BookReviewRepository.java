package bookapp.bookappback.review.repository;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.user.entity.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BookReviewRepository extends JpaRepository<BookReview, Long > {
    Slice<BookReview> findByBook(Book book, Pageable pageable);

    @Query("SELECT br FROM BookReview br JOIN FETCH br.book WHERE br.user = :user")
    List<BookReview> findByUserWithBook(@Param("user") User user); // New method to eagerly fetch book

    boolean existsByUserAndBook(User user, Book book);
}
