package bookapp.bookappback.ai.repository;

import bookapp.bookappback.ai.entity.AiSearchJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface AiSearchJobRepository extends JpaRepository<AiSearchJob, UUID> {
    Optional<AiSearchJob> findByUserIdAndIdempotencyKey(Long userId, String idempotencyKey);
    Optional<AiSearchJob> findByIdAndUserIdAndExpiresAtAfter(UUID id, Long userId, LocalDateTime now);
    List<AiSearchJob> findTop20ByUserIdAndExpiresAtAfterOrderByCreatedAtDesc(Long userId, LocalDateTime now);
    List<AiSearchJob> findByUserIdAndStatusInAndExpiresAtAfter(Long userId, Collection<String> statuses, LocalDateTime now);
    long countByStatusAndExpiresAtAfter(String status, LocalDateTime now);

    @Query(value = "SELECT * FROM ai_search_jobs WHERE status = 'QUEUED' AND expires_at > :now ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<AiSearchJob> lockNextQueued(@Param("now") LocalDateTime now);

    @Modifying
    @Query("UPDATE AiSearchJob j SET j.status = 'FAILED', j.errorCode = 'INTERRUPTED', j.completedAt = :now WHERE j.status = 'RUNNING'")
    int failInterrupted(@Param("now") LocalDateTime now);

    @Modifying
    @Query("DELETE FROM AiSearchJob j WHERE j.expiresAt <= :now")
    int deleteExpired(@Param("now") LocalDateTime now);
}
