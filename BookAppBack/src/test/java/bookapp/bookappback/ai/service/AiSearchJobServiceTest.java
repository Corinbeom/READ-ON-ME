package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.controller.AiSearchController;
import bookapp.bookappback.ai.dto.AiSearchRequestDto;
import bookapp.bookappback.ai.dto.AiSearchOutcome;
import bookapp.bookappback.ai.repository.AiSearchJobRepository;
import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.user.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import org.springframework.http.MediaType;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiSearchJobServiceTest {
    @Autowired AiSearchJobService service;
    @Autowired AiSearchJobRepository repository;
    @Autowired AiSearchCapacity capacity;
    @MockBean GalpiAvailability availability;
    @MockBean AiSearchService searchService;
    @MockBean org.springframework.data.redis.core.StringRedisTemplate rateLimitRedis;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired AiSearchController controller;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void reset() {
        var operations = (org.springframework.data.redis.core.ValueOperations<String, String>) org.mockito.Mockito.mock(org.springframework.data.redis.core.ValueOperations.class);
        when(availability.state()).thenReturn(GalpiAvailability.State.AVAILABLE);
        when(availability.checkSubmission(org.mockito.ArgumentMatchers.any())).thenReturn(GalpiAvailability.State.AVAILABLE);
        when(availability.release()).thenReturn("reviewed-test-release");
        when(rateLimitRedis.opsForValue()).thenReturn(operations);
        when(operations.increment(anyString())).thenReturn(1L);
        repository.deleteAll();
        ReflectionTestUtils.setField(service, "dispatchEnabled", false);
    }

    @Test
    void anonymousAiEndpointsAreDenied() throws Exception {
        for (String path : new String[]{"/api/ai/search", "/api/ai/jobs"}) {
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"책 추천\"}"))
                    .andExpect(status().isForbidden());
        }
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
    void timingIsAcceptedOnceForTheOwnerOfATerminalJob() throws Exception {
        var job = service.submit(1L, "추천", "timing");
        var path = "/api/ai/jobs/" + job.id() + "/client-timing";
        String sample = "{\"submit_ms\":100,\"fetch_start_ms\":250,\"fetch_end_ms\":300,\"display_ms\":320}";
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path)
                .with(user(principal(1L))).contentType(MediaType.APPLICATION_JSON).content(sample);
        mvc.perform(request).andExpect(status().isNoContent());
        var row = repository.findById(job.id()).orElseThrow();
        assertNull(row.getClientDisplayMs());
        row.setStatus("SUCCEEDED");
        repository.saveAndFlush(row);
        mvc.perform(request.with(user(principal(2L)))).andExpect(status().isNoContent());
        assertNull(repository.findById(job.id()).orElseThrow().getClientDisplayMs());
        mvc.perform(request.with(user(principal(1L))).content(sample.replace("320", "99")))
                .andExpect(status().isBadRequest());
        mvc.perform(request.content(sample)).andExpect(status().isNoContent());
        mvc.perform(request.content(sample.replace("320", "400"))).andExpect(status().isNoContent());
        row = repository.findById(job.id()).orElseThrow();
        assertEquals(320, row.getClientDisplayMs());
        assertNull(row.getClientSignalMs());
    }

    @Test
    void dispatchNeverExceedsTwoAndPersistsResults() throws Exception {
        var active = new AtomicInteger();
        var maximum = new AtomicInteger();
        when(searchService.searchWithOutcome(anyString(), anyString())).thenAnswer(invocation -> Mono.defer(() -> {
            int count = active.incrementAndGet();
            maximum.accumulateAndGet(count, Math::max);
            return Mono.delay(Duration.ofMillis(150))
                    .map(tick -> {
                        active.decrementAndGet();
                        return new AiSearchOutcome(List.of("book"), "MODEL", "NONE", "NONE");
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
        assertTrue(service.recent(1L).stream().allMatch(job -> "MODEL".equals(job.resultOutcome())));
        ReflectionTestUtils.setField(service, "dispatchEnabled", false);
    }

    @Test
    void failureAndRestartAreVisibleToOwner() throws Exception {
        when(searchService.searchWithOutcome(anyString(), anyString())).thenReturn(Mono.error(new TimeoutException("slow")));
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
    void temporaryReadinessFailurePreservesQueuedJobAcrossRestartAndWithholdsResultsUntilVerified() throws Exception {
        var submitted = service.submit(1L, "추천", "reconnect");
        when(availability.state()).thenReturn(GalpiAvailability.State.UNCONFIRMED);
        service.recover();
        var row = repository.findById(submitted.id()).orElseThrow();
        assertEquals("QUEUED", row.getStatus());
        assertEquals("AI_STATUS_UNAVAILABLE", assertThrows(AppException.class,
                () -> service.get(1L, submitted.id())).getCode());
        mvc.perform(get("/api/ai/jobs/" + submitted.id()).with(user(principal(1L))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("AI_STATUS_UNAVAILABLE"));
        when(availability.state()).thenReturn(GalpiAvailability.State.AVAILABLE);
        when(searchService.searchWithOutcome(anyString(), anyString()))
                .thenReturn(Mono.just(new AiSearchOutcome(List.of("book"), "MODEL", "NONE", "NONE")));
        ReflectionTestUtils.setField(service, "dispatchEnabled", true);
        service.dispatch();
        awaitSucceeded(1);
        when(availability.state()).thenReturn(GalpiAvailability.State.UNCONFIRMED);
        assertEquals("AI_STATUS_UNAVAILABLE", assertThrows(AppException.class,
                () -> service.recent(1L)).getCode());
        when(availability.state()).thenReturn(GalpiAvailability.State.AVAILABLE);
        assertEquals("SUCCEEDED", service.get(1L, submitted.id()).status());
        when(availability.state()).thenReturn(GalpiAvailability.State.MAINTENANCE);
        assertNull(service.get(1L, submitted.id()).results());
    }

    @Test
    void emptyUpstreamFailureRemainsDistinctFromNoMatch() throws Exception {
        when(searchService.searchWithOutcome(anyString(), anyString())).thenReturn(
                Mono.just(new AiSearchOutcome(List.of(), "DEGRADED_EMPTY", "HTTP_503", "NONE")));
        var submitted = service.submit(1L, "비슷한 소설", "degraded-key");
        ReflectionTestUtils.setField(service, "dispatchEnabled", true);
        service.dispatch();
        awaitSucceeded(1);

        var completed = service.get(1L, submitted.id());
        assertEquals("SUCCEEDED", completed.status());
        assertEquals(0, completed.results().size());
        assertEquals("DEGRADED_EMPTY", completed.resultOutcome());
        assertEquals("HTTP_503", completed.resultReason());
        assertEquals("NONE", completed.resultBasis());

        var response = mvc.perform(get("/api/ai/jobs/" + submitted.id()).with(user(principal(1L))))
                .andExpect(status().isOk()).andReturn().getResponse();
        var data = mapper.readTree(response.getContentAsString()).path("data");
        assertTrue(data.has("result_outcome"), data.toString());
        assertEquals("DEGRADED_EMPTY", data.path("result_outcome").asText());
        assertEquals("HTTP_503", data.path("result_reason").asText());
        assertTrue(data.path("completed_at").isTextual());
        ReflectionTestUtils.setField(service, "dispatchEnabled", false);
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

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    @ExtendWith(OutputCaptureExtension.class)
    void terminalJobSignalsReachOnlyTheOwnerStreams(boolean successful, CapturedOutput output) throws Exception {
        var ownerStream = openNotificationStream(1L);
        var otherOwnerStream = openNotificationStream(1L);
        var strangerStream = openNotificationStream(2L);
        try {
            assertTrue(ownerStream.getResponse().getContentAsString().contains("\"aiSearchCompletion\":true"));
            var job = service.submit(1L, "추천을 완료할 책", "completion-signal");
            when(searchService.searchWithOutcome(anyString(), anyString())).thenReturn(successful
                    ? Mono.just(new AiSearchOutcome(List.of("book"), "MODEL", "NONE", "NONE"))
                    : Mono.error(new TimeoutException("slow")));
            ReflectionTestUtils.setField(service, "dispatchEnabled", true);
            service.dispatch();
            org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).until(() ->
                    otherOwnerStream.getResponse().getContentAsString().contains("data:" + job.id())
                            && ownerStream.getResponse().getContentAsString().contains("data:" + job.id()));

            assertTrue(output.getOut().lines().anyMatch(line -> line.contains("reviewed_finish request_id=" + job.id())
                    && line.matches(".*handoff_ms=[0-9]+ serialize_ms=[0-9]+ store_ms=[0-9]+ committed=true")));
            var done = service.get(1L, job.id());
            assertEquals(successful ? "SUCCEEDED" : "FAILED", done.status());
            assertNotNull(done.completedAt());
            for (var stream : List.of(ownerStream, otherOwnerStream)) {
                var events = stream.getResponse().getContentAsString();
                assertTrue(events.contains("event:ai-search-finished"));
                assertTrue(events.contains("data:" + job.id()));
            }
            assertFalse(strangerStream.getResponse().getContentAsString().contains(job.id().toString()));
        } finally {
            ReflectionTestUtils.setField(service, "dispatchEnabled", false);
            for (var stream : List.of(ownerStream, otherOwnerStream, strangerStream)) {
                stream.getRequest().getAsyncContext().complete();
            }
        }
    }

    private MvcResult openNotificationStream(Long userId) throws Exception {
        return mvc.perform(get("/api/notifications/stream").accept(MediaType.TEXT_EVENT_STREAM).with(user(principal(userId))))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted())
                .andReturn();
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
        when(searchService.searchWithOutcome(anyString(), anyString()))
                .thenReturn(Mono.just(new AiSearchOutcome(List.of("book"), "MODEL", "NONE", "NONE")));
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
