package bookapp.bookappback.book.service;

import bookapp.bookappback.book.dto.LibraryBookDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class LibraryApiService {

    private static final String LIBRARY_API_BASE_URL = "https://data4library.kr";
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private record RankingCovers(LocalDate asOf, Map<String, String> urls, Instant expiresAt) {}
    private final Map<Integer, RankingCovers> coversByAge = new ConcurrentHashMap<>();

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
        LocalDate today = LocalDate.now();
        var books = fetchRanking(ageGroup, today);
        if (!books.isEmpty()) {
            coversByAge.put(ageGroup == null ? 0 : ageGroup, coversFrom(today, books));
        }
        return books;
    }

    public Map<String, String> getCoverUrls(int ageGroup, LocalDate asOf) {
        // A restart loses only the in-memory covers. Read the same ranking period to refill them.
        return coversByAge.compute(ageGroup, (group, cached) -> {
            if (cached != null && cached.asOf().equals(asOf) && Instant.now().isBefore(cached.expiresAt())) {
                return cached;
            }
            return coversFrom(asOf, fetchRanking(group == 0 ? null : group, asOf));
        }).urls();
    }

    private RankingCovers coversFrom(LocalDate asOf, List<LibraryBookDto> books) {
        Map<String, String> urls = new HashMap<>();
        for (LibraryBookDto book : books) {
            String url = book.getBookImageUrl();
            if (book.getIsbn13() != null && url != null && (url.startsWith("https://") || url.startsWith("http://"))) {
                urls.put(book.getIsbn13(), url);
            }
        }
        Duration ttl = books.isEmpty() ? Duration.ofMinutes(1) : Duration.ofDays(7);
        return new RankingCovers(asOf, Map.copyOf(urls), Instant.now().plus(ttl));
    }

    private List<LibraryBookDto> fetchRanking(Integer ageGroup, LocalDate asOf) {
        String endDt = asOf.format(DATE_FMT);
        String startDt = asOf.minusDays(30).format(DATE_FMT);

        String uri = buildUri(startDt, endDt, ageGroup);
        log.info("도서관 정보나루 API 호출: {}", uri.replaceAll("authKey=[^&]+", "authKey=****"));

        try {
            String responseBody = webClient.get()
                    .uri(uri)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(Duration.ofSeconds(5));

            return parseBooks(responseBody);
        } catch (Exception e) {
            log.warn("도서관 정보나루 API 호출 실패 [age={}]: {}", ageGroup, e.getClass().getSimpleName());
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
            log.warn("도서관 정보나루 응답에 docs 필드 없음");
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

        log.warn("도서관 정보나루 응답 구조 예상과 다름");
        return Collections.emptyList();
    }
}
