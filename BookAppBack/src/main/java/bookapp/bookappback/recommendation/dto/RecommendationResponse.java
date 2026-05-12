package bookapp.bookappback.recommendation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class RecommendationResponse {
    private String type;       // "personalized" | "popular"
    private List<Long> bookIds;
}
