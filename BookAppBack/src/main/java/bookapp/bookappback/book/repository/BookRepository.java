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

    @org.springframework.data.jpa.repository.Modifying
    @Query(value = """
            INSERT INTO books (isbn13, created_at, embedded, average_rating)
            VALUES (:isbn, CURRENT_TIMESTAMP, false, 0) ON CONFLICT DO NOTHING
            """, nativeQuery = true)
    int insertIdentity(@Param("isbn") String isbn);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM Book b WHERE b.isbn13 = :isbn")
    Optional<Book> lockByIsbn(@Param("isbn") String isbn);

    // ISBN13 조회
    Optional<Book> findByIsbn13(String isbn13);

    List<Book> findByGroupTitle(String groupTitle);

    // ISBN10 조회
    List<Book> findByIsbn10(String isbn10);

    // 제목에 포함된 단어로 검색
    List<Book> findByTitleContaining(String title);

    // 저자 이름 포함 검색
    List<Book> findByAuthorsContaining(String author);

    // 최근 등록된 N권 조회 (인기 도서 폴백용)
    @Query(value = "SELECT * FROM books ORDER BY created_at DESC LIMIT :limit", nativeQuery = true)
    List<Book> findTopNByOrderByCreatedAtDesc(@Param("limit") int limit);
}
