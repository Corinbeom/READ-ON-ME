package bookapp.bookappback.ai.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ai_search_jobs", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "idempotency_key"}))
@Getter
@Setter
@NoArgsConstructor
public class AiSearchJob {
    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "idempotency_key", nullable = false, length = 100)
    private String idempotencyKey;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String query;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "result_json", columnDefinition = "TEXT")
    private String resultJson;

    @Column(name = "error_code", length = 40)
    private String errorCode;

    @Column(name = "result_outcome", length = 24)
    private String resultOutcome;

    @Column(name = "result_reason", length = 40)
    private String resultReason;

    @Column(name = "result_basis", length = 40)
    private String resultBasis;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
}
