package bookapp.bookappback.notification.service;

import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.notification.repository.NotificationRepository;
import bookapp.bookappback.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.context.WebServerGracefulShutdownLifecycle;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class NotificationStreamLifecycleTest {

    @Test
    void shutdownClosesAllBrowserStreamsBeforeTomcatDrainsAndRejectsReconnects() {
        var service = new NotificationService(mock(NotificationRepository.class), mock(UserRepository.class));
        assertTrue(service.getPhase() > WebServerGracefulShutdownLifecycle.SMART_LIFECYCLE_PHASE);
        service.start();
        var desktop = service.subscribe(1L);
        var sameReader = service.subscribe(1L);
        var mobile = service.subscribe(2L);

        service.stop();

        assertFalse(service.isRunning());
        assertThrows(IllegalStateException.class, () -> desktop.send("late"));
        assertThrows(IllegalStateException.class, () -> sameReader.send("late"));
        assertThrows(IllegalStateException.class, () -> mobile.send("late"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, assertThrows(AppException.class, () -> service.subscribe(1L)).getStatus());
        service.start();
        assertDoesNotThrow(() -> service.subscribe(1L));
    }
}
