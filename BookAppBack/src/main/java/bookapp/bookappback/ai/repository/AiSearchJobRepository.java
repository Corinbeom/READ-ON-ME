package bookapp.bookappback.ai.repository;

import bookapp.bookappback.ai.entity.AiSearchJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import bookapp.bookappback.ai.dto.AiSearchClientTiming;
import org.springframework.transaction.annotation.Transactional;

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

    @Transactional
    @Modifying
    @Query("""
            UPDATE AiSearchJob j SET j.clientSubmitMs = :#{#timing.submitMs}, j.clientSignalMs = :#{#timing.signalMs},
                j.clientFetchStartMs = :#{#timing.fetchStartMs}, j.clientFetchEndMs = :#{#timing.fetchEndMs},
                j.clientDisplayMs = :#{#timing.displayMs}
            WHERE j.id = :id AND j.userId = :owner AND j.expiresAt > :now
              AND j.status IN ('SUCCEEDED', 'FAILED') AND j.clientDisplayMs IS NULL
            """)
    void recordClientTiming(@Param("id") UUID id, @Param("owner") Long owner, @Param("now") LocalDateTime now,
                            @Param("timing") AiSearchClientTiming timing);

    String DEPLOYMENT_CLAIM_GUARD = """
            SELECT 1 FROM information_schema.triggers
            WHERE event_object_schema = current_schema AND event_object_table = 'ai_search_jobs'
              AND trigger_name = 'readonme_hold_galpi_claim'
            """;

    @Query(value = "SELECT EXISTS (" + DEPLOYMENT_CLAIM_GUARD + ")", nativeQuery = true)
    boolean deploymentHoldsClaims();

    @Query(value = """
            SELECT j.* FROM ai_search_jobs j
            WHERE j.status = 'QUEUED' AND j.expires_at > :now AND NOT EXISTS (
            """ + DEPLOYMENT_CLAIM_GUARD + """
            )
            ORDER BY j.created_at, j.id LIMIT 1 FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    Optional<AiSearchJob> lockNextQueued(@Param("now") LocalDateTime now);

    @Modifying
    @Query("UPDATE AiSearchJob j SET j.status = 'FAILED', j.errorCode = 'INTERRUPTED', j.completedAt = :now WHERE j.status = 'RUNNING'")
    int failInterrupted(@Param("now") LocalDateTime now);

    @Modifying
    @Query("UPDATE AiSearchJob j SET j.status = 'FAILED', j.errorCode = :code, j.completedAt = :now WHERE j.status IN ('QUEUED', 'RUNNING')")
    int failForMaintenance(@Param("code") String code, @Param("now") LocalDateTime now);

    @Modifying
    @Query("DELETE FROM AiSearchJob j WHERE j.expiresAt <= :now AND j.corpusRelease = :release")
    int deleteExpired(@Param("release") String release, @Param("now") LocalDateTime now);
}
