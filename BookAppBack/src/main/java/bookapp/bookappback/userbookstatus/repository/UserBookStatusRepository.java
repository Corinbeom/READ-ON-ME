package bookapp.bookappback.userbookstatus.repository;

import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.entity.UserBookStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserBookStatusRepository extends JpaRepository<UserBookStatus, Long> {
    List<UserBookStatus> findByUserId(Long userId);
    List<UserBookStatus> findByUserIdAndStatus(Long userId, ReadingStatus status);
    Optional<UserBookStatus> findByUserIdAndBookId(Long userId, Long bookId);
}
