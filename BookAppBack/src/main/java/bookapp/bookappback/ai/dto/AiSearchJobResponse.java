package bookapp.bookappback.ai.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.UUID;

public record AiSearchJobResponse(
        UUID id, String query, String status, JsonNode results, String errorCode,
        LocalDateTime createdAt, LocalDateTime startedAt, LocalDateTime completedAt,
        LocalDateTime expiresAt
) {}
