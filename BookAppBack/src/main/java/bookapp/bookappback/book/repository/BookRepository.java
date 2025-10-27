package bookapp.bookappback.book.repository;

import bookapp.bookappback.book.entity.Book;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BookRepository extends JpaRepository<Book, Long> {

    // ISBN13 조회
    Optional<Book> findByIsbn13(String isbn13);

    List<Book> findByGroupTitle(String groupTitle);

    // ISBN10 조회
    List<Book> findByIsbn10(String isbn10);

    // 제목에 포함된 단어로 검색
    List<Book> findByTitleContaining(String title);

    // 저자 이름 포함 검색
    List<Book> findByAuthorsContaining(String author);
}