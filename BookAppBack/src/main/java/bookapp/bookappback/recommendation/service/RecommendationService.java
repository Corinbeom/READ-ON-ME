package bookapp.bookappback.recommendation.service;

import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import bookapp.bookappback.userbookstatus.service.UserBookStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RecommendationService {

    private final UserBookStatusService userBookStatusService;
    private final UserRepository userRepository;

    private static final int TOP_K_NEIGHBORS = 5;
    private static final int NUM_RECOMMENDATIONS = 10;

    public List<Long> getRecommendations(String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new UserExceptions.EmailNotFoundException(userEmail));
        Long targetUserId = user.getId();

        Map<Long, List<Long>> allLibraries = userBookStatusService.getAllUserLibraries();

        if (!allLibraries.containsKey(targetUserId)) {
            return List.of();
        }

        Set<Long> targetBooks = new HashSet<>(allLibraries.get(targetUserId));

        // 자카드 유사도 계산 → 상위 K명 이웃 선택
        List<Long> neighborIds = allLibraries.entrySet().stream()
                .filter(e -> !e.getKey().equals(targetUserId))
                .map(e -> Map.entry(e.getKey(), jaccardSimilarity(targetBooks, new HashSet<>(e.getValue()))))
                .filter(e -> e.getValue() > 0)
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .limit(TOP_K_NEIGHBORS)
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        if (neighborIds.isEmpty()) {
            return List.of();
        }

        // 이웃이 읽은 책 빈도 집계 (대상 유저가 안 읽은 것만)
        Map<Long, Long> bookFrequency = new LinkedHashMap<>();
        for (Long neighborId : neighborIds) {
            for (Long bookId : allLibraries.get(neighborId)) {
                if (!targetBooks.contains(bookId)) {
                    bookFrequency.merge(bookId, 1L, Long::sum);
                }
            }
        }

        return bookFrequency.entrySet().stream()
                .sorted(Map.Entry.<Long, Long>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .limit(NUM_RECOMMENDATIONS)
                .collect(Collectors.toList());
    }

    private double jaccardSimilarity(Set<Long> set1, Set<Long> set2) {
        Set<Long> intersection = new HashSet<>(set1);
        intersection.retainAll(set2);
        Set<Long> union = new HashSet<>(set1);
        union.addAll(set2);
        return union.isEmpty() ? 0.0 : (double) intersection.size() / union.size();
    }
}
