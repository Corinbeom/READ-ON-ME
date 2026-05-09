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
 * embedded=false인 책을 주기적으로 재시도하는 스케줄러.
 * AI 서비스 다운 등으로 임베딩에 실패한 책을 복구한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmbeddingRetryScheduler {

    private final BookRepository bookRepository;
    private final BookService bookService;

    // 10분마다 실행
    @Scheduled(fixedDelay = 600_000)
    public void retryFailedEmbeddings() {
        List<Book> pending = bookRepository.findAllByEmbeddedFalse();
        if (pending.isEmpty()) return;

        log.info("임베딩 재시도 대상: {}권", pending.size());
        for (Book book : pending) {
            bookService.triggerSingleBookEmbedding(book);
        }
    }
}
