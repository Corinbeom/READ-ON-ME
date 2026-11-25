package bookapp.bookappback.ai.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiSearchClientTiming(
        @NotNull @Min(0) Integer submitMs,
        @Min(0) Integer signalMs,
        @NotNull @Min(0) Integer fetchStartMs,
        @NotNull @Min(0) Integer fetchEndMs,
        @NotNull @Min(0) @Max(86400000) Integer displayMs) {
    @AssertTrue
    public boolean isOrdered() {
        if (submitMs == null || fetchStartMs == null || fetchEndMs == null || displayMs == null) return false;
        return submitMs <= fetchStartMs && fetchStartMs <= fetchEndMs && fetchEndMs <= displayMs
                && (signalMs == null || signalMs <= displayMs);
    }
}
