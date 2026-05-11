package bookapp.bookappback.book.scheduler;

import bookapp.bookappback.book.dto.LibraryBookDto;
import bookapp.bookappback.book.entity.PopularNaruBook;
import bookapp.bookappback.book.repository.PopularNaruBookRepository;
import bookapp.bookappback.book.service.LibraryApiService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class PopularNaruBookScheduler {

    private static final int[] AGE_GROUPS = {0, 10, 20, 30, 40, 50, 60};

    private final PopularNaruBookRepository popularNaruBookRepository;
    private final LibraryApiService libraryApiService;

    @PostConstruct
    public void initIfEmpty() {
        if (popularNaruBookRepository.count() == 0) {
            log.info("===== [PopularNaruBookScheduler] DB 비어있음 → 즉시 전체 나이대 데이터 수집 시작 =====");
            fetchAndStoreAll();
        } else {
            log.info("[PopularNaruBookScheduler] DB에 기존 나루 인기 도서 존재. 초기 로드 스킵.");
        }
    }

    /** 매주 월요일 새벽 3시 갱신 */
    @Scheduled(cron = "0 0 3 * * MON")
    public void weeklyRefresh() {
        log.info("===== [PopularNaruBookScheduler] 주간 배치 갱신 시작 =====");
        fetchAndStoreAll();
    }

    private void fetchAndStoreAll() {
        for (int ageGroup : AGE_GROUPS) {
            try {
                Integer apiAge = ageGroup == 0 ? null : ageGroup;
                List<LibraryBookDto> books = libraryApiService.getPopularBooks(apiAge);

                if (books.isEmpty()) {
                    log.warn("[PopularNaruBookScheduler] ageGroup={} 결과 없음. 기존 데이터 유지.", ageGroup);
                    continue;
                }

                popularNaruBookRepository.deleteByAgeGroup(ageGroup);

                List<PopularNaruBook> entities = new ArrayList<>();
                for (int i = 0; i < books.size(); i++) {
                    LibraryBookDto dto = books.get(i);
                    entities.add(PopularNaruBook.builder()
                            .ageGroup(ageGroup)
                            .ranking(i + 1)
                            .bookName(dto.getBookName())
                            .authors(dto.getAuthors())
                            .publisher(dto.getPublisher())
                            .publicationYear(dto.getPublicationYear())
                            .isbn13(dto.getIsbn13())
                            .classNm(dto.getClassNm())
                            .bookImageUrl(dto.getBookImageUrl())
                            .loanCount(dto.getLoanCount())
                            .fetchedAt(LocalDateTime.now())
                            .build());
                }
                popularNaruBookRepository.saveAll(entities);
                log.info("[PopularNaruBookScheduler] ageGroup={} → {}건 저장 완료", ageGroup, entities.size());

            } catch (Exception e) {
                log.error("[PopularNaruBookScheduler] ageGroup={} 처리 중 오류: {}", ageGroup, e.getMessage());
            }
        }
        log.info("===== [PopularNaruBookScheduler] 전체 나이대 데이터 수집 완료 =====");
    }
}
