package bookapp.bookappback.ai.controller;

import bookapp.bookappback.ai.service.AiSearchService;
import bookapp.bookappback.ai.service.AiSearchJobService;
import bookapp.bookappback.ai.service.AiSearchCapacity;
import bookapp.bookappback.ai.service.AiSearchCapacityException;
import bookapp.bookappback.ai.dto.AiSearchRequestDto;
import bookapp.bookappback.ai.dto.AiSearchJobResponse;
import bookapp.bookappback.common.dto.ApiResponse;
import bookapp.bookappback.security.UserDetailsImpl;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiSearchController {

    private final AiSearchService aiSearchService;
    private final AiSearchJobService jobService;
    private final AiSearchCapacity capacity;

    @PostMapping("/search")
    public Mono<ResponseEntity<List<?>>> search(@RequestBody @Valid AiSearchRequestDto requestDto) {
        return Mono.defer(() -> {
            if (jobService.hasQueuedJobs() || !capacity.tryAcquire()) return Mono.error(new AiSearchCapacityException());
            return aiSearchService.search(requestDto.getQuery())
                    .map(results -> ResponseEntity.<List<?>>ok(results))
                    .doFinally(signal -> capacity.release());
        });
    }

    @PostMapping("/jobs")
    public ResponseEntity<ApiResponse<AiSearchJobResponse>> submit(
            @AuthenticationPrincipal UserDetailsImpl principal,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody @Valid AiSearchRequestDto requestDto) {
        var job = jobService.submit(principal.getUser().getId(), requestDto.getQuery().trim(), idempotencyKey);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new ApiResponse<>(true, "검색 작업을 접수했습니다", job));
    }

    @GetMapping("/jobs/recent")
    public ApiResponse<List<AiSearchJobResponse>> recent(@AuthenticationPrincipal UserDetailsImpl principal) {
        return new ApiResponse<>(true, "최근 검색 작업", jobService.recent(principal.getUser().getId()));
    }

    @GetMapping("/jobs/{id}")
    public ApiResponse<AiSearchJobResponse> get(@AuthenticationPrincipal UserDetailsImpl principal, @PathVariable UUID id) {
        return new ApiResponse<>(true, "검색 작업 상태", jobService.get(principal.getUser().getId(), id));
    }
}
