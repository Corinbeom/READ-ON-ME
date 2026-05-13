package bookapp.bookappback.recommendation.service;

import bookapp.bookappback.ai.service.AiRecommendationService;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.recommendation.dto.RecommendationResponse;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import bookapp.bookappback.userbookstatus.dto.UserBookIsbnDto;
import bookapp.bookappback.userbookstatus.service.UserBookStatusService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Hybrid 추천 = CF (Weighted Jaccard) + Content-based (pgvector)
 * 두 결과를 Reciprocal Rank Fusion(RRF)으로 결합한다.
 *
 *   RRF_score(book) = 1/(k + cf_rank) + 1/(k + content_rank)   (k=60)
 *
 * FastAPI 호출 실패 시 CF-only로 자동 폴백.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RecommendationService {

    private final UserBookStatusService userBookStatusService;
    private final AiRecommendationService aiRecommendationService;
    private final UserRepository userRepository;
    private final BookRepository bookRepository;

    private static final int TOP_K_NEIGHBORS = 5;
    private static final int NUM_RECOMMENDATIONS = 10;
    private static final double AGE_BONUS = 1.3;
    private static final int RRF_K = 60;

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

        // ── CF: Weighted Jaccard + 나이대 보너스 ──────────────────────────────
        int targetAgeGroup = user.getBirthYear() != null ? calcAgeGroup(user.getBirthYear()) : -1;

        List<Long> neighborIds = allLibraries.entrySet().stream()
                .filter(e -> !e.getKey().equals(targetUserId))
                .map(e -> {
                    double sim = weightedJaccard(targetWeights, e.getValue());
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

        Map<Long, Double> cfScoreMap = new LinkedHashMap<>();
        for (Long neighborId : neighborIds) {
            for (Map.Entry<Long, Double> entry : allLibraries.get(neighborId).entrySet()) {
                Long bookId = entry.getKey();
                if (!targetWeights.containsKey(bookId)) {
                    cfScoreMap.merge(bookId, entry.getValue(), Double::sum);
                }
            }
        }

        // CF 결과: 점수 내림차순 정렬 → 순위 배열
        List<Long> cfRanked = cfScoreMap.entrySet().stream()
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        // ── Content-based: FastAPI pgvector 검색 ─────────────────────────────
        List<UserBookIsbnDto> userBooksWithIsbn =
                userBookStatusService.getUserBooksWithIsbn(targetUserId);

        List<Long> contentRanked = getContentBasedBookIds(userBooksWithIsbn, targetWeights.keySet());

        // ── Hybrid: Reciprocal Rank Fusion ────────────────────────────────────
        List<Long> hybrid = reciprocalRankFusion(cfRanked, contentRanked, NUM_RECOMMENDATIONS);

        // 부족하면 인기 도서로 보충
        if (hybrid.size() < NUM_RECOMMENDATIONS) {
            Set<Long> excludeIds = new HashSet<>(targetWeights.keySet());
            excludeIds.addAll(hybrid);
            int needed = NUM_RECOMMENDATIONS - hybrid.size();
            List<Long> filler = getMostPopularBookIds(allLibraries, excludeIds, needed);
            hybrid = new ArrayList<>(hybrid);
            hybrid.addAll(filler);
        }

        log.info("[Hybrid] userId={} cf={} content={} hybrid={}",
                targetUserId, cfRanked.size(), contentRanked.size(), hybrid.size());

        return new RecommendationResponse("personalized", hybrid);
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    /**
     * FastAPI Content-based 추천 호출 → ISBN → bookId 변환.
     * 실패 또는 빈 결과이면 빈 리스트 반환.
     */
    private List<Long> getContentBasedBookIds(
            List<UserBookIsbnDto> userBooksWithIsbn,
            Set<Long> targetBookIds) {

        if (userBooksWithIsbn.isEmpty()) return Collections.emptyList();

        List<String> isbns = aiRecommendationService
                .getContentRecommendations(userBooksWithIsbn, NUM_RECOMMENDATIONS * 2);

        if (isbns.isEmpty()) return Collections.emptyList();

        return isbns.stream()
                .map(isbn -> bookRepository.findByIsbn13(isbn).map(b -> b.getId()).orElse(null))
                .filter(id -> id != null && !targetBookIds.contains(id))
                .collect(Collectors.toList());
    }

    /**
     * Reciprocal Rank Fusion.
     * score(book) = 1/(RRF_K + cf_rank) + 1/(RRF_K + content_rank)
     * 두 목록 중 하나에만 있으면 해당 항만 합산.
     */
    private List<Long> reciprocalRankFusion(
            List<Long> cfRanked, List<Long> contentRanked, int limit) {

        Map<Long, Double> scores = new HashMap<>();

        for (int i = 0; i < cfRanked.size(); i++) {
            scores.merge(cfRanked.get(i), 1.0 / (RRF_K + i + 1), Double::sum);
        }
        for (int i = 0; i < contentRanked.size(); i++) {
            scores.merge(contentRanked.get(i), 1.0 / (RRF_K + i + 1), Double::sum);
        }

        return scores.entrySet().stream()
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .limit(limit)
                .collect(Collectors.toList());
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

    private List<Long> getMostPopularBookIds(
            Map<Long, Map<Long, Double>> libraries, Set<Long> excludeIds, int limit) {

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
