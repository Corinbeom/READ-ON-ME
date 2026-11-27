package bookapp.bookappback.recommendation.service;

import bookapp.bookappback.ai.service.ReadingKeywordService;
import bookapp.bookappback.recommendation.dto.HomeRecommendations;
import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.repository.UserBookStatusRepository;
import bookapp.bookappback.userbookstatus.repository.UserBookStatusRepository.ShelfEdition;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class HomeRecommendationService {
    private final UserBookStatusRepository shelves;
    private final ReadingKeywordService keywords;

    public HomeRecommendations forUser(Long userId) {
        var shelf = shelves.findShelfEditions(userId);
        var reading = shelf.stream()
                .filter(book -> book.getStatus() == ReadingStatus.READING || book.getStatus() == ReadingStatus.COMPLETED)
                .map(ShelfEdition::getIsbn).distinct().toList();
        if (reading.isEmpty()) return HomeRecommendations.empty();

        var owned = shelf.stream().map(ShelfEdition::getIsbn).distinct().toList();
        var peers = reading.size() >= 2 ? shelves.findPeerIsbns(userId) : List.<String>of();
        return keywords.getHomePicks(reading, owned, peers);
    }
}
