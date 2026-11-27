package bookapp.bookappback.userbookstatus.repository;

import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.entity.UserBookStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserBookStatusRepository extends JpaRepository<UserBookStatus, Long> {
    List<UserBookStatus> findByUserId(Long userId);
    List<UserBookStatus> findByUserIdAndStatus(Long userId, ReadingStatus status);
    Optional<UserBookStatus> findByUserIdAndBookId(Long userId, Long bookId);

    interface ShelfEdition {
        String getIsbn();
        ReadingStatus getStatus();
    }

    @Query("select s.book.isbn13 as isbn, s.status as status from UserBookStatus s where s.user.id = :userId")
    List<ShelfEdition> findShelfEditions(@Param("userId") Long userId);

    @Query(value = """
            WITH neighbors AS (
                SELECT other.user_id
                FROM user_book_status mine
                JOIN user_book_status other ON other.book_id = mine.book_id
                WHERE mine.user_id = :userId AND other.user_id <> :userId
                  AND mine.status IN ('READING','COMPLETED') AND other.status IN ('READING','COMPLETED')
                GROUP BY other.user_id HAVING COUNT(DISTINCT mine.book_id) >= 2
            )
            SELECT b.isbn13 FROM neighbors n
            JOIN user_book_status s ON s.user_id = n.user_id
            JOIN books b ON b.id = s.book_id
            WHERE s.status IN ('READING','COMPLETED')
              AND NOT EXISTS (SELECT 1 FROM user_book_status mine WHERE mine.user_id = :userId AND mine.book_id = s.book_id)
            GROUP BY b.isbn13 ORDER BY COUNT(DISTINCT n.user_id) DESC, b.isbn13
            """, nativeQuery = true)
    List<String> findPeerIsbns(@Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM UserBookStatus entry WHERE entry.user.id = :userId AND entry.book.id = :bookId")
    void removeLibraryEntry(@Param("userId") Long userId, @Param("bookId") Long bookId);

    @Query("""
            SELECT ubs.book.id, COUNT(ubs.id) as popularity
            FROM UserBookStatus ubs
            WHERE ubs.status IN :statuses
            GROUP BY ubs.book.id
            ORDER BY popularity DESC
            """)
    List<Object[]> findPopularBooksByStatuses(@Param("statuses") List<ReadingStatus> statuses);
}
