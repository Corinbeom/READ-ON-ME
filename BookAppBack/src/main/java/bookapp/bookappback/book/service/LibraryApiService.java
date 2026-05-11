package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.LibraryBookDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Slf4j
@Service
public class LibraryApiService {

    private static final String LIBRARY_API_BASE_URL = "http://data4library.kr";
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final String apiKey;
    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    public LibraryApiService(
            @Value("${library.api.key}") String apiKey,
            WebClient.Builder webClientBuilder,
            ObjectMapper objectMapper
    ) {
        this.apiKey = apiKey;
        this.webClient = webClientBuilder.baseUrl(LIBRARY_API_BASE_URL).build();
        this.objectMapper = objectMapper;
    }

    /**
     * birthYear → age 10단위 변환 (10~60 클램프)
     * e.g. birthYear=2003 → 2026-2003=23 → 20대
     */
    public int calcAgeGroup(int birthYear) {
        int actualAge = LocalDate.now().getYear() - birthYear;
        int ageGroup = (actualAge / 10) * 10;
        return Math.max(10, Math.min(60, ageGroup));
    }

    /**
     * 인기 대출 도서 조회.
     * @param ageGroup 10/20/30/40/50/60 중 하나, null이면 전체 연령
     */
    public List<LibraryBookDto> getPopularBooks(Integer ageGroup) {
        String endDt = LocalDate.now().format(DATE_FMT);
        String startDt = LocalDate.now().minusDays(30).format(DATE_FMT);

        String uri = buildUri(startDt, endDt, ageGroup);
        log.info("도서관 정보나루 API 호출: {}", uri.replaceAll("authKey=[^&]+", "authKey=****"));

        try {
            String responseBody = webClient.get()
                    .uri(uri)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            log.debug("도서관 정보나루 응답 (앞 500자): {}", responseBody != null ? responseBody.substring(0, Math.min(500, responseBody.length())) : "null");
            return parseBooks(responseBody);
        } catch (Exception e) {
            log.error("도서관 정보나루 API 호출 실패 [age={}]: {} - {}", ageGroup, e.getClass().getSimpleName(), e.getMessage());
            return Collections.emptyList();
        }
    }

    private String buildUri(String startDt, String endDt, Integer ageGroup) {
        StringBuilder sb = new StringBuilder("/api/loanItemSrch")
                .append("?authKey=").append(apiKey)
                .append("&startDt=").append(startDt)
                .append("&endDt=").append(endDt)
                .append("&pageNo=1")
                .append("&pageSize=10")
                .append("&format=json");

        if (ageGroup != null) {
            sb.append("&age=").append(ageGroup);
        }
        return sb.toString();
    }

    private List<LibraryBookDto> parseBooks(String json) throws JsonProcessingException {
        JsonNode root = objectMapper.readTree(json);
        JsonNode docs = root.path("response").path("docs");

        if (docs.isMissingNode() || docs.isNull()) {
            log.warn("도서관 정보나루 응답에 docs 필드 없음. 전체 응답: {}", json);
            return Collections.emptyList();
        }

        List<LibraryBookDto> books = new ArrayList<>();

        // docs가 배열인 경우: [{"doc": {...}}, ...]
        if (docs.isArray()) {
            for (JsonNode docWrapper : docs) {
                JsonNode doc = docWrapper.path("doc");
                JsonNode item = doc.isMissingNode() ? docWrapper : doc;
                books.add(objectMapper.treeToValue(item, LibraryBookDto.class));
            }
            return books;
        }

        // docs가 객체인 경우: {"doc": [{...}, ...]}
        JsonNode docNode = docs.path("doc");
        if (docNode.isArray()) {
            for (JsonNode item : docNode) {
                books.add(objectMapper.treeToValue(item, LibraryBookDto.class));
            }
            return books;
        }

        log.warn("도서관 정보나루 응답 구조 예상과 다름. docs: {}", docs);
        return Collections.emptyList();
    }
}
