package bookapp.bookappback.recommendation.controller;

import bookapp.bookappback.recommendation.service.RecommendationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/recommendations")
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationService recommendationService;

    @GetMapping
    public ResponseEntity<List<Long>> getRecommendations(
            @AuthenticationPrincipal UserDetails userDetails) {
        List<Long> recommendations = recommendationService.getRecommendations(userDetails.getUsername());
        return ResponseEntity.ok(recommendations);
    }
}
