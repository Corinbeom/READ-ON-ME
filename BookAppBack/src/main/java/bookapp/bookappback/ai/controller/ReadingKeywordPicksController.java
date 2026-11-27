package bookapp.bookappback.ai.controller;

import bookapp.bookappback.ai.dto.DailyBookChoice;
import bookapp.bookappback.ai.dto.ReadingKeywordPickDto;
import bookapp.bookappback.ai.service.ReadingKeywordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;

@RestController
@RequiredArgsConstructor
@Slf4j
public class ReadingKeywordPicksController {

    private final ReadingKeywordService readingKeywordService;

    @GetMapping("/api/books/reading-keyword-picks")
    public Mono<ResponseEntity<List<ReadingKeywordPickDto>>> getPicks(
            @RequestParam MultiValueMap<String, String> query
    ) {
        List<String> keywords = query.getOrDefault("tag", List.of()).stream().map(String::strip).toList();
        if (keywords.isEmpty() || keywords.size() > 3 || keywords.stream().anyMatch(this::invalidKeyword)) {
            throw new IllegalArgumentException("공개 키워드를 1~3개 선택해주세요.");
        }
        return readingKeywordService.getPublicPicks(keywords)
                .switchIfEmpty(Mono.error(new IllegalStateException("Empty corpus response")))
                .map(picks -> ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(2)).cachePublic())
                        .body(picks))
                .onErrorResume(error -> {
                    log.warn("공개 키워드 도서 조회 실패: {}", error.getClass().getSimpleName());
                    return Mono.just(ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
                });
    }

    @GetMapping("/api/books/daily-choices")
    public Mono<ResponseEntity<List<DailyBookChoice>>> getDailyChoices() {
        return readingKeywordService.getDailyChoices()
                .switchIfEmpty(Mono.error(new IllegalStateException("Empty corpus response")))
                .map(books -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(books))
                .onErrorResume(error -> {
                    log.warn("오늘의 갈피 도서 조회 실패: {}", error.getClass().getSimpleName());
                    return Mono.just(ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
                });
    }

    private boolean invalidKeyword(String keyword) {
        return keyword.isEmpty() || keyword.length() > 100 || "user_added".equalsIgnoreCase(keyword)
                || keyword.chars().anyMatch(Character::isISOControl);
    }
}
