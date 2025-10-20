package bookapp.bookappback.review.repository;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.review.entity.BookReview;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BookReviewRepository extends JpaRepository<BookReview, Long > {
    List<BookReview> findByBook(Book book);
}
