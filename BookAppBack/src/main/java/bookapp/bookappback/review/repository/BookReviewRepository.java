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

@Repository
public interface BookReviewRepository extends JpaRepository<BookReview, Long > {
    Slice<BookReview> findByBook(Book book, Pageable pageable);

    boolean existsByUserAndBook(User user, Book book);
}
