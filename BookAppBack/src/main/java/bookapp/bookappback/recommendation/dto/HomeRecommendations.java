package bookapp.bookappback.recommendation.dto;

import bookapp.bookappback.ai.dto.ReadingKeywordPickDto;
import java.util.List;

public record HomeRecommendations(Basis basis, List<ReadingKeywordPickDto> books) {
    public enum Basis { EMPTY, INTEREST, DISCOVERY, READERS, INTEREST_AND_READERS }

    public static HomeRecommendations empty() {
        return new HomeRecommendations(Basis.EMPTY, List.of());
    }
}
