package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.dto.AiSearchJobResponse;
import bookapp.bookappback.ai.entity.AiSearchJob;
import bookapp.bookappback.ai.repository.AiSearchJobRepository;
import bookapp.bookappback.common.exception.AppException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import reactor.core.scheduler.Schedulers;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Comparator;
import java.util.HashMap;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiSearchJobService {
    private final AiSearchJobRepository repository;
    private final AiSearchService searchService;
    private final AiSearchCapacity capacity;
    private final TransactionTemplate transactions;
    private final ObjectMapper objectMapper;
    private final ReentrantLock admissionLock = new ReentrantLock();
    private volatile boolean ready;
    @Value("${ai.jobs.dispatch-enabled:true}")
    private boolean dispatchEnabled;

    public AiSearchJobResponse submit(Long userId, String query, String key) {
        if (key == null || key.isBlank()) key = UUID.randomUUID().toString();
        if (key.length() > 100) throw new IllegalArgumentException("Idempotency-Key는 100자 이하로 입력해주세요");
        String finalKey = key;
        admissionLock.lock();
        try {
            return transactions.execute(status -> {
                var existing = repository.findByUserIdAndIdempotencyKey(userId, finalKey);
                if (existing.isPresent()) {
                    if (!existing.get().getQuery().equals(query)) {
                        throw new AppException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "같은 요청 키에 다른 검색어를 사용할 수 없습니다");
                    }
                    return toResponse(existing.get());
                }
                if (repository.countByStatusAndExpiresAtAfter("QUEUED", LocalDateTime.now()) >= 10) {
                    throw new AiSearchCapacityException();
                }
                var job = new AiSearchJob();
                var now = LocalDateTime.now();
                job.setId(UUID.randomUUID());
                job.setUserId(userId);
                job.setIdempotencyKey(finalKey);
                job.setQuery(query);
                job.setStatus("QUEUED");
                job.setCreatedAt(now);
                job.setExpiresAt(now.plusHours(24));
                return toResponse(repository.save(job));
            });
        } finally {
            admissionLock.unlock();
        }
    }

    public AiSearchJobResponse get(Long userId, UUID id) {
        return repository.findByIdAndUserIdAndExpiresAtAfter(id, userId, LocalDateTime.now())
                .map(this::toResponse)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "AI_JOB_NOT_FOUND", "검색 작업을 찾을 수 없습니다"));
    }

    public List<AiSearchJobResponse> recent(Long userId) {
        var now = LocalDateTime.now();
        var byId = new HashMap<UUID, AiSearchJob>();
        repository.findTop20ByUserIdAndExpiresAtAfterOrderByCreatedAtDesc(userId, now)
                .forEach(job -> byId.put(job.getId(), job));
        repository.findByUserIdAndStatusInAndExpiresAtAfter(userId, List.of("QUEUED", "RUNNING"), now)
                .forEach(job -> byId.put(job.getId(), job));
        return byId.values().stream().sorted(Comparator.comparing(AiSearchJob::getCreatedAt).reversed())
                .map(this::toResponse).toList();
    }

    public boolean hasQueuedJobs() {
        return repository.countByStatusAndExpiresAtAfter("QUEUED", LocalDateTime.now()) > 0;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recover() {
        transactions.executeWithoutResult(tx -> repository.failInterrupted(LocalDateTime.now()));
        ready = true;
    }

    @Scheduled(fixedDelay = 1000)
    public void dispatch() {
        if (!ready || !dispatchEnabled) return;
        while (capacity.tryAcquire()) {
            AiSearchJob job;
            try {
                job = transactions.execute(tx -> {
                    var next = repository.lockNextQueued(LocalDateTime.now());
                    if (next.isEmpty()) return null;
                    var selected = next.get();
                    selected.setStatus("RUNNING");
                    selected.setStartedAt(LocalDateTime.now());
                    return repository.save(selected);
                });
            } catch (Exception ex) {
                capacity.release();
                log.error("AI 검색 작업을 가져오지 못했습니다", ex);
                return;
            }
            if (job == null) {
                capacity.release();
                return;
            }
            UUID jobId = job.getId();
            try {
                searchService.search(job.getQuery(), jobId.toString())
                        .publishOn(Schedulers.boundedElastic())
                        .subscribe(
                                results -> finish(jobId, results, null),
                                error -> finish(jobId, null, error)
                        );
            } catch (Exception ex) {
                finish(jobId, null, ex);
            }
        }
    }

    private void finish(UUID id, List<?> results, Throwable error) {
        try {
            transactions.executeWithoutResult(tx -> {
                var job = repository.findById(id).orElseThrow();
                if (error == null) {
                    try {
                        job.setResultJson(objectMapper.writeValueAsString(results));
                        job.setStatus("SUCCEEDED");
                    } catch (Exception ex) {
                        job.setStatus("FAILED");
                        job.setErrorCode("RESULT_ERROR");
                    }
                } else {
                    job.setStatus("FAILED");
                    job.setErrorCode(error instanceof java.util.concurrent.TimeoutException ? "TIMEOUT" : "UPSTREAM_ERROR");
                }
                job.setCompletedAt(LocalDateTime.now());
                repository.save(job);
            });
            if (error != null) log.warn("AI 검색 작업 실패 [{}]: {}", id, error.toString());
        } catch (Exception ex) {
            log.error("AI 검색 결과 저장 실패 [{}]", id, ex);
        } finally {
            capacity.release();
        }
    }

    @Scheduled(fixedDelay = 3600000)
    public void cleanup() {
        if (ready) transactions.executeWithoutResult(tx -> repository.deleteExpired(LocalDateTime.now()));
    }

    private AiSearchJobResponse toResponse(AiSearchJob job) {
        JsonNode results = null;
        if (job.getResultJson() != null) {
            try { results = objectMapper.readTree(job.getResultJson()); }
            catch (Exception ex) { log.error("AI 검색 결과 파싱 실패 [{}]", job.getId(), ex); }
        }
        return new AiSearchJobResponse(job.getId(), job.getQuery(), job.getStatus(), results,
                job.getErrorCode(), job.getCreatedAt(), job.getStartedAt(), job.getCompletedAt(), job.getExpiresAt());
    }
}
