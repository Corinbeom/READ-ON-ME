package bookapp.bookappback.book.repository;

import bookapp.bookappback.book.entity.Book;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

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

    // 물리 컬럼 embedded는 기존 스키마와의 호환을 위해 유지한다. true는 AI 작업 접수 완료를 뜻한다.
    List<Book> findTop10ByEmbeddedFalseOrderByIdAsc();
    List<Book> findTop10ByEmbeddedFalseAndIdGreaterThanOrderByIdAsc(Long id);

    // 최근 등록된 N권 조회 (인기 도서 폴백용)
    @Query(value = "SELECT * FROM books ORDER BY created_at DESC LIMIT :limit", nativeQuery = true)
    List<Book> findTopNByOrderByCreatedAtDesc(@Param("limit") int limit);

    // 영속 AI 작업 접수 상태 업데이트 — Reactor 스레드에서 안전하게 직접 UPDATE
    @Modifying
    @Transactional
    @Query("UPDATE Book b SET b.embedded = true WHERE b.isbn13 = :isbn13")
    void markCorpusJobSubmitted(@Param("isbn13") String isbn13);
}
