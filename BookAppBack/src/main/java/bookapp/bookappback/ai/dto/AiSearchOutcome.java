package bookapp.bookappback.ai.dto;

import java.util.List;

public record AiSearchOutcome(List<?> books, String status, String reasonCode, String basis) {}
