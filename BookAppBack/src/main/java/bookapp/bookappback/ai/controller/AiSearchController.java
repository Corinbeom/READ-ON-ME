package bookapp.bookappback.ai.controller;

import bookapp.bookappback.ai.service.AiSearchService;
import bookapp.bookappback.ai.dto.AiSearchRequestDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiSearchController {

    private final AiSearchService aiSearchService;

    @PostMapping("/search")
    public ResponseEntity<List<?>> search(@RequestBody @Valid AiSearchRequestDto requestDto) {
        List<?> results = aiSearchService.search(requestDto);
        return ResponseEntity.ok(results);
    }
}
