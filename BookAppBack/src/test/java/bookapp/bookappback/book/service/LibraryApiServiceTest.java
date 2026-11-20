package bookapp.bookappback.book.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class LibraryApiServiceTest {
    @Test
    void coldCacheLoadsTheSameRankingPeriodAndKeepsOnlyWebCoversByIsbn() {
        List<URI> requests = new ArrayList<>();
        var client = WebClient.builder().exchangeFunction(request -> {
            requests.add(request.url());
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                    .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .body("""
                            {"response":{"docs":[
                              {"doc":{"isbn13":"9780306406157","bookImageURL":"https://example.org/c.jpg"}},
                              {"doc":{"isbn13":"9780451524935","bookImageURL":"file:///wrong"}},
                              {"doc":{"isbn13":"9780141439518"}}
                            ]}}
                            """).build());
        });
        var service = new LibraryApiService("fixture", client, new ObjectMapper());
        var asOf = LocalDate.of(2026, 11, 16);
        var covers = Map.of("9780306406157", "https://example.org/c.jpg");

        assertEquals(covers, service.getCoverUrls(30, asOf));
        assertEquals(covers, service.getCoverUrls(30, asOf));
        assertEquals(1, requests.size());
        assertTrue(requests.get(0).getQuery().contains("age=30"));
        assertTrue(requests.get(0).getQuery().contains("endDt=2026-11-16"));
        assertTrue(requests.get(0).getQuery().contains("startDt=2026-10-17"));

        service.getCoverUrls(30, asOf.plusDays(7));
        assertEquals(2, requests.size());
        service.getPopularBooks(null);
        assertEquals(covers, service.getCoverUrls(0, LocalDate.now()));
        assertEquals(3, requests.size());
        assertFalse(requests.get(2).getQuery().contains("&age="));
    }
}
