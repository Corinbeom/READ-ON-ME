package bookapp.bookappback.recommendation.controller;

import bookapp.bookappback.recommendation.dto.HomeRecommendations;
import bookapp.bookappback.recommendation.dto.RecommendationResponse;
import bookapp.bookappback.recommendation.service.HomeRecommendationService;
import bookapp.bookappback.recommendation.service.RecommendationService;
import bookapp.bookappback.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/recommendations")
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationService recommendationService;

    private final HomeRecommendationService home;

    @GetMapping("/home")
    public ResponseEntity<HomeRecommendations> home(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(home.forUser(userDetails.getUser().getId()));
    }

    @GetMapping
    public ResponseEntity<RecommendationResponse> getRecommendations(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        RecommendationResponse response = recommendationService.getRecommendations(userDetails.getUser().getId());
        return ResponseEntity.ok(response);
    }
}
