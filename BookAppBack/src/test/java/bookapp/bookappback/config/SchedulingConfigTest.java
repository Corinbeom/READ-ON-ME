package bookapp.bookappback.config;

import bookapp.bookappback.ai.repository.AiSearchJobRepository;
import bookapp.bookappback.ai.service.AiSearchCapacity;
import bookapp.bookappback.ai.service.AiSearchJobService;
import bookapp.bookappback.ai.service.AiSearchService;
import bookapp.bookappback.ai.service.GalpiAvailability;
import bookapp.bookappback.book.repository.PopularNaruBookRepository;
import bookapp.bookappback.book.scheduler.PopularNaruBookScheduler;
import bookapp.bookappback.book.service.LibraryApiService;
import bookapp.bookappback.notification.service.NotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.task.ThreadPoolTaskSchedulerBuilder;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

class SchedulingConfigTest {
    @TestConfiguration(proxyBeanMethods = false)
    @EnableScheduling
    static class EnableTimers {}

    @Test
    void recommendationDispatcherChecksItsQueueWhileCoverProviderIsBlocked() throws Exception {
        var coverStarted = new CountDownLatch(1);
        var releaseCover = new CountDownLatch(1);
        var queueChecked = new CountDownLatch(1);
        var books = mock(PopularNaruBookRepository.class);
        var snapshot = mock(PopularNaruBookRepository.RankingSnapshot.class);
        when(snapshot.getAgeGroup()).thenReturn(20);
        when(snapshot.getFetchedAt()).thenReturn(LocalDateTime.now());
        when(books.count()).thenReturn(1L);
        when(books.findActiveSnapshots()).thenReturn(List.of(snapshot));
        var library = mock(LibraryApiService.class);
        doAnswer(call -> {
            coverStarted.countDown();
            releaseCover.await(15, TimeUnit.SECONDS);
            return null;
        }).when(library).refreshCoversIfNeeded(eq(20), any());
        var jobs = mock(AiSearchJobRepository.class);
        when(jobs.countByStatusAndExpiresAtAfter(eq("QUEUED"), any())).thenAnswer(call -> {
            if (coverStarted.getCount() == 0 && releaseCover.getCount() == 1) queueChecked.countDown();
            return 0L;
        });
        try (var context = new AnnotationConfigApplicationContext()) {
            context.register(EnableTimers.class, SchedulingConfig.class);
            context.registerBean(ThreadPoolTaskSchedulerBuilder.class, () -> new ThreadPoolTaskSchedulerBuilder());
            context.registerBean(PopularNaruBookScheduler.class, () -> new PopularNaruBookScheduler(books, library));
            context.registerBean(AiSearchJobService.class, () -> new AiSearchJobService(
                    mock(GalpiAvailability.class), jobs, mock(AiSearchService.class), mock(AiSearchCapacity.class),
                    mock(TransactionTemplate.class), new ObjectMapper(), mock(NotificationService.class)));
            context.refresh();
            context.getBean(AiSearchJobService.class).recover();
            try {
                assertTrue(coverStarted.await(5, TimeUnit.SECONDS));
                assertTrue(queueChecked.await(5, TimeUnit.SECONDS));
            } finally {
                releaseCover.countDown();
            }
        }
    }
}
