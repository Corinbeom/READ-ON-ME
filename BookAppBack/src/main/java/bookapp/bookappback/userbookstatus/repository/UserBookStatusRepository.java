package bookapp.bookappback.userbookstatus.repository;

import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.entity.UserBookStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserBookStatusRepository extends JpaRepository<UserBookStatus, Long> {
    List<UserBookStatus> findByUserId(Long userId);
    List<UserBookStatus> findByUserIdAndStatus(Long userId, ReadingStatus status);
    Optional<UserBookStatus> findByUserIdAndBookId(Long userId, Long bookId);

    @Query("""
            SELECT ubs.book.id, COUNT(ubs.id) as popularity
            FROM UserBookStatus ubs
            WHERE ubs.status IN :statuses
            GROUP BY ubs.book.id
            ORDER BY popularity DESC
            """)
    List<Object[]> findPopularBooksByStatuses(@Param("statuses") List<ReadingStatus> statuses);
}
