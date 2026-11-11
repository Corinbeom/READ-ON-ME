package bookapp.bookappback.book.scheduler;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.book.service.BookService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 아직 AI의 영속 작업 큐에 접수되지 않은 책을 소량씩 재전송한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmbeddingRetryScheduler {

    private final BookRepository bookRepository;
    private final BookService bookService;
    private long lastVisitedBookId = 0;

    // 10분마다 실행
    @Scheduled(fixedDelay = 600_000)
    public void retryFailedEmbeddings() {
        List<Book> pending = bookRepository.findTop10ByEmbeddedFalseAndIdGreaterThanOrderByIdAsc(lastVisitedBookId);
        if (pending.isEmpty() && lastVisitedBookId != 0) {
            lastVisitedBookId = 0;
            pending = bookRepository.findTop10ByEmbeddedFalseOrderByIdAsc();
        }
        if (pending.isEmpty()) return;

        log.info("AI 코퍼스 작업 재접수 대상: {}권", pending.size());
        for (Book book : pending) {
            bookService.submitCorpusIngestion(book);
            lastVisitedBookId = book.getId();
        }
    }
}
