package bookapp.bookappback.ai.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.UUID;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiSearchJobResponse(
        UUID id, String query, String status, JsonNode results, String errorCode,
        String resultOutcome, String resultReason, String resultBasis,
        @JsonFormat(shape = JsonFormat.Shape.STRING) LocalDateTime createdAt,
        @JsonFormat(shape = JsonFormat.Shape.STRING) LocalDateTime startedAt,
        @JsonFormat(shape = JsonFormat.Shape.STRING) LocalDateTime completedAt,
        @JsonFormat(shape = JsonFormat.Shape.STRING) LocalDateTime expiresAt
) {}
