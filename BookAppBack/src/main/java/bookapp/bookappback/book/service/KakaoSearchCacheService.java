package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.common.exception.BookExceptions;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import reactor.core.scheduler.Schedulers;
import reactor.util.retry.Retry;

import java.time.Duration;

/**
 * Kakao API 호출 결과를 Redis에 캐싱하는 전용 서비스.
 *
 * BookService에서 직접 @Cacheable을 사용하면 두 가지 문제가 발생한다:
 * 1. private 메서드에는 Spring AOP 프록시가 적용되지 않아 캐시가 동작하지 않음.
 * 2. 같은 클래스 내 self-invocation도 프록시를 우회하므로 동일한 문제가 발생함.
 * 이 클래스를 별도 Bean으로 분리함으로써 두 문제를 모두 해결한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KakaoSearchCacheService {

    private final KakaoBookService kakaoBookService;

    @Cacheable(
        value = "bookSearchCache",
        key = "'q:' + #query + ':p:' + #page + ':s:' + #size + ':so:' + #sort + ':t:' + #target"
    )
    public KakaoBookSearchResponse searchBooks(String query, int page, int size, String sort, String target) {
        try {
            return kakaoBookService.searchBooks(query, page, size, sort, target)
                    .retryWhen(Retry.fixedDelay(1, Duration.ofMillis(300)))
                    .subscribeOn(Schedulers.boundedElastic())
                    .block();
        } catch (Exception e) {
            log.error("Kakao API 검색 실패 [query={}]: {}", query, e.getMessage());
            throw new BookExceptions.ExternalApiException("카카오 API 호출 실패: " + e.getMessage());
        }
    }

    @Cacheable(value = "bookSearchCache", key = "'isbn:' + #isbn")
    public KakaoBookSearchResponse searchBookByIsbn(String isbn) {
        try {
            return kakaoBookService.searchBookByIsbn(isbn)
                    .subscribeOn(Schedulers.boundedElastic())
                    .block();
        } catch (Exception e) {
            log.error("Kakao API ISBN 검색 실패 [isbn={}]: {}", isbn, e.getMessage());
            throw new BookExceptions.ExternalApiException("카카오 API (ISBN) 호출 실패: " + e.getMessage());
        }
    }
}
