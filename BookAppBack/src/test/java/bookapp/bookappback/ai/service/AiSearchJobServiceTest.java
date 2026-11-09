package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.controller.AiSearchController;
import bookapp.bookappback.ai.dto.AiSearchRequestDto;
import bookapp.bookappback.ai.repository.AiSearchJobRepository;
import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.user.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import reactor.core.publisher.Mono;
import reactor.core.Disposable;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import org.springframework.http.MediaType;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiSearchJobServiceTest {
    @Autowired AiSearchJobService service;
    @Autowired AiSearchJobRepository repository;
    @MockBean AiSearchService searchService;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired AiSearchController controller;

    @BeforeEach
    void reset() {
        repository.deleteAll();
        ReflectionTestUtils.setField(service, "dispatchEnabled", false);
    }

    @Test
    void idempotencyCapacityAndOwnership() throws Exception {
        var first = service.submit(1L, "책 추천", "same-key");
        assertEquals(first.id(), service.submit(1L, "책 추천", "same-key").id());
        assertEquals("QUEUED", service.get(1L, first.id()).status());
        assertThrows(AppException.class, () -> service.get(2L, first.id()));
        assertThrows(AppException.class, () -> service.submit(1L, "다른 검색어", "same-key"));

        for (int i = 1; i < 10; i++) service.submit(1L, "책 " + i, "key-" + i);
        assertThrows(AiSearchCapacityException.class, () -> service.submit(1L, "초과", "overflow"));
        assertEquals(10, service.recent(1L).size());
        mvc.perform(post("/api/ai/jobs").with(user(principal(1L)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "overflow-http")
                        .content("{\"query\":\"초과\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().string("Retry-After", "5"));
    }

    @Test
    void dispatchNeverExceedsTwoAndPersistsResults() throws Exception {
        var active = new AtomicInteger();
        var maximum = new AtomicInteger();
        when(searchService.search(anyString())).thenAnswer(invocation -> Mono.defer(() -> {
            int count = active.incrementAndGet();
            maximum.accumulateAndGet(count, Math::max);
            return Mono.delay(Duration.ofMillis(150))
                    .map(tick -> {
                        active.decrementAndGet();
                        return List.of("book");
                    });
        }));

        for (int i = 0; i < 3; i++) service.submit(1L, "책 " + i, UUID.randomUUID().toString());
        ReflectionTestUtils.setField(service, "dispatchEnabled", true);
        service.dispatch();
        assertEquals(2, repository.countByStatusAndExpiresAtAfter("RUNNING", java.time.LocalDateTime.now()));
        assertEquals(1, repository.countByStatusAndExpiresAtAfter("QUEUED", java.time.LocalDateTime.now()));

        awaitSucceeded(2);
        service.dispatch();
        awaitSucceeded(3);
        assertEquals(2, maximum.get());
        assertTrue(service.recent(1L).stream().allMatch(job -> job.results().isArray()));
        ReflectionTestUtils.setField(service, "dispatchEnabled", false);
    }

    @Test
    void failureAndRestartAreVisibleToOwner() throws Exception {
        when(searchService.search(anyString())).thenReturn(Mono.error(new TimeoutException("slow")));
        var failed = service.submit(1L, "느린 책", "timeout-key");
        ReflectionTestUtils.setField(service, "dispatchEnabled", true);
        service.dispatch();
        long deadline = System.currentTimeMillis() + 5000;
        while (!"FAILED".equals(service.get(1L, failed.id()).status()) && System.currentTimeMillis() < deadline)
            Thread.sleep(20);
        assertEquals("TIMEOUT", service.get(1L, failed.id()).errorCode());
        ReflectionTestUtils.setField(service, "dispatchEnabled", false);

        var interrupted = service.submit(1L, "다른 책", "interrupted-key");
        var row = repository.findById(interrupted.id()).orElseThrow();
        row.setStatus("RUNNING");
        repository.saveAndFlush(row);
        service.recover();
        assertEquals("INTERRUPTED", service.get(1L, interrupted.id()).errorCode());
    }

    @Test
    void authenticatedApiHidesOtherUsersJobs() throws Exception {
        var owner = principal(1L);
        var stranger = principal(2L);
        var response = mvc.perform(post("/api/ai/jobs")
                        .with(user(owner)).contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "http-key")
                        .content("{\"query\":\"조용한 소설\"}"))
                .andExpect(status().isAccepted()).andReturn().getResponse();
        var id = mapper.readTree(response.getContentAsString()).path("data").path("id").asText();
        mvc.perform(get("/api/ai/jobs/" + id).with(user(owner)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/ai/jobs/" + id).with(user(stranger)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/ai/jobs/recent").with(user(owner)))
                .andExpect(status().isOk());
    }

    @Test
    void legacySearchUsesSamePermitsAsQueuedJobs() throws Exception {
        when(searchService.search(anyString())).thenReturn(Mono.never());
        Disposable first = controller.search(new AiSearchRequestDto("첫째")).subscribe();
        Disposable second = controller.search(new AiSearchRequestDto("둘째")).subscribe();
        try {
            service.submit(1L, "대기 검색", "shared-limit-key");
            ReflectionTestUtils.setField(service, "dispatchEnabled", true);
            service.dispatch();
            assertEquals(1, repository.countByStatusAndExpiresAtAfter("QUEUED", java.time.LocalDateTime.now()));
        } finally {
            first.dispose();
            second.dispose();
        }
        when(searchService.search(anyString())).thenReturn(Mono.just(List.of("book")));
        service.dispatch();
        awaitSucceeded(1);
        ReflectionTestUtils.setField(service, "dispatchEnabled", false);
    }

    @Test
    void expiredResultsDisappearAndAreDeleted() {
        var created = service.submit(1L, "지난 검색", "expired-key");
        var row = repository.findById(created.id()).orElseThrow();
        row.setExpiresAt(java.time.LocalDateTime.now().minusSeconds(1));
        repository.saveAndFlush(row);
        assertTrue(service.recent(1L).isEmpty());
        assertThrows(AppException.class, () -> service.get(1L, created.id()));
        service.cleanup();
        assertFalse(repository.existsById(created.id()));
    }

    private UserDetailsImpl principal(Long id) {
        var user = new User();
        user.setId(id);
        user.setEmail("user" + id + "@example.com");
        user.setPassword("unused");
        return new UserDetailsImpl(user);
    }

    private void awaitSucceeded(long count) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (repository.countByStatusAndExpiresAtAfter("SUCCEEDED", java.time.LocalDateTime.now()) < count
                && System.currentTimeMillis() < deadline) Thread.sleep(20);
        assertEquals(count, repository.countByStatusAndExpiresAtAfter("SUCCEEDED", java.time.LocalDateTime.now()));
    }
}
