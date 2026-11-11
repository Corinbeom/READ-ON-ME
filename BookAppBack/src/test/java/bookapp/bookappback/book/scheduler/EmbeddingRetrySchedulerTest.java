package bookapp.bookappback.book.scheduler;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.book.service.BookService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.Mockito.*;

class EmbeddingRetrySchedulerTest {

    @Test
    void advancesPastFailedBooksAndWrapsToTheBeginning() {
        BookRepository repository = mock(BookRepository.class);
        BookService service = mock(BookService.class);
        Book first = new Book();
        first.setId(1L);
        Book later = new Book();
        later.setId(11L);
        when(repository.findTop10ByEmbeddedFalseAndIdGreaterThanOrderByIdAsc(0L))
                .thenReturn(List.of(first));
        when(repository.findTop10ByEmbeddedFalseAndIdGreaterThanOrderByIdAsc(1L))
                .thenReturn(List.of(later));
        when(repository.findTop10ByEmbeddedFalseAndIdGreaterThanOrderByIdAsc(11L))
                .thenReturn(List.of());
        when(repository.findTop10ByEmbeddedFalseOrderByIdAsc()).thenReturn(List.of(first));

        EmbeddingRetryScheduler scheduler = new EmbeddingRetryScheduler(repository, service);
        scheduler.retryFailedEmbeddings();
        scheduler.retryFailedEmbeddings();
        scheduler.retryFailedEmbeddings();

        verify(service, times(2)).submitCorpusIngestion(first);
        verify(service).submitCorpusIngestion(later);
    }
}
