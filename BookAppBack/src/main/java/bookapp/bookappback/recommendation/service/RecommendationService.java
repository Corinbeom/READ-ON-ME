package bookapp.bookappback.recommendation.service;

import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.recommendation.dto.RecommendationResponse;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import bookapp.bookappback.userbookstatus.service.UserBookStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RecommendationService {

    private final UserBookStatusService userBookStatusService;
    private final UserRepository userRepository;
    private final BookRepository bookRepository;

    private static final int TOP_K_NEIGHBORS = 5;
    private static final int NUM_RECOMMENDATIONS = 10;
    private static final double AGE_BONUS = 1.3;

    public RecommendationResponse getRecommendations(String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new UserExceptions.EmailNotFoundException(userEmail));
        Long targetUserId = user.getId();

        Map<Long, Map<Long, Double>> allLibraries = userBookStatusService.getAllUserLibrariesWeighted();

        // Cold start: 유저의 책이 없으면 인기 도서 반환
        Map<Long, Double> targetWeights = allLibraries.get(targetUserId);
        if (targetWeights == null || targetWeights.isEmpty()) {
            List<Long> popular = getMostPopularBookIds(allLibraries, Collections.emptySet(), NUM_RECOMMENDATIONS);
            return new RecommendationResponse("popular", popular);
        }

        int targetAgeGroup = user.getBirthYear() != null ? calcAgeGroup(user.getBirthYear()) : -1;

        // Weighted Jaccard + 나이대 보너스로 상위 K명 이웃 선택
        List<Long> neighborIds = allLibraries.entrySet().stream()
                .filter(e -> !e.getKey().equals(targetUserId))
                .map(e -> {
                    double sim = weightedJaccard(targetWeights, e.getValue());
                    // 나이대 보너스
                    if (targetAgeGroup >= 0) {
                        User neighbor = userRepository.findById(e.getKey()).orElse(null);
                        if (neighbor != null && neighbor.getBirthYear() != null
                                && calcAgeGroup(neighbor.getBirthYear()) == targetAgeGroup) {
                            sim *= AGE_BONUS;
                        }
                    }
                    return Map.entry(e.getKey(), sim);
                })
                .filter(e -> e.getValue() > 0)
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .limit(TOP_K_NEIGHBORS)
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        // 이웃이 읽은 책 빈도 집계 (대상 유저가 보유하지 않은 것만)
        Map<Long, Double> bookScore = new LinkedHashMap<>();
        for (Long neighborId : neighborIds) {
            for (Map.Entry<Long, Double> entry : allLibraries.get(neighborId).entrySet()) {
                Long bookId = entry.getKey();
                if (!targetWeights.containsKey(bookId)) {
                    bookScore.merge(bookId, entry.getValue(), Double::sum);
                }
            }
        }

        List<Long> recommendations = bookScore.entrySet().stream()
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .limit(NUM_RECOMMENDATIONS)
                .collect(Collectors.toList());

        // 결과가 부족하면 인기 도서로 보충
        if (recommendations.size() < NUM_RECOMMENDATIONS) {
            Set<Long> excludeIds = new HashSet<>(targetWeights.keySet());
            excludeIds.addAll(recommendations);
            int needed = NUM_RECOMMENDATIONS - recommendations.size();
            List<Long> filler = getMostPopularBookIds(allLibraries, excludeIds, needed);
            recommendations = new ArrayList<>(recommendations);
            recommendations.addAll(filler);
        }

        return new RecommendationResponse("personalized", recommendations);
    }

    private double weightedJaccard(Map<Long, Double> wA, Map<Long, Double> wB) {
        Set<Long> allBooks = new HashSet<>(wA.keySet());
        allBooks.addAll(wB.keySet());
        double numerator = 0.0;
        double denominator = 0.0;
        for (Long bookId : allBooks) {
            double a = wA.getOrDefault(bookId, 0.0);
            double b = wB.getOrDefault(bookId, 0.0);
            numerator += Math.min(a, b);
            denominator += Math.max(a, b);
        }
        return denominator == 0.0 ? 0.0 : numerator / denominator;
    }

    private int calcAgeGroup(int birthYear) {
        int age = LocalDate.now().getYear() - birthYear;
        return Math.max(10, Math.min(60, (age / 10) * 10));
    }

    private List<Long> getMostPopularBookIds(Map<Long, Map<Long, Double>> libraries, Set<Long> excludeIds, int limit) {
        if (libraries.isEmpty()) {
            return bookRepository.findTopNByOrderByCreatedAtDesc(limit)
                    .stream().map(b -> b.getId()).collect(Collectors.toList());
        }

        Map<Long, Double> freq = new HashMap<>();
        for (Map<Long, Double> userBooks : libraries.values()) {
            for (Map.Entry<Long, Double> entry : userBooks.entrySet()) {
                if (!excludeIds.contains(entry.getKey())) {
                    freq.merge(entry.getKey(), entry.getValue(), Double::sum);
                }
            }
        }

        List<Long> result = freq.entrySet().stream()
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .limit(limit)
                .collect(Collectors.toList());

        if (result.isEmpty()) {
            return bookRepository.findTopNByOrderByCreatedAtDesc(limit)
                    .stream().map(b -> b.getId()).collect(Collectors.toList());
        }
        return result;
    }
}
