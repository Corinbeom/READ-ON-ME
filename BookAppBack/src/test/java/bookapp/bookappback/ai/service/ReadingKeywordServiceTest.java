package bookapp.bookappback.ai.service;

import bookapp.bookappback.userbookstatus.dto.UserBookIsbnDto;
import bookapp.bookappback.userbookstatus.service.UserBookStatusService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReadingKeywordServiceTest {
    @Test
    void libraryLookupIncludesReadingAndCompletedDuringGalpiMaintenance() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var request = new AtomicReference<String>();
        server.createContext("/api/user/reading-tags", exchange -> {
            request.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = "{\"analyzed\":2,\"keywords\":[]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var stream = exchange.getResponseBody()) { stream.write(body); }
        });
        server.start();
        try {
            var shelf = mock(UserBookStatusService.class);
            when(shelf.getUserBooksWithIsbn(1L)).thenReturn(List.of(
                    new UserBookIsbnDto("a", "READING"), new UserBookIsbnDto("b", "COMPLETED"),
                    new UserBookIsbnDto("c", "TO_READ")));
            var service = new ReadingKeywordService(new GalpiAvailability(null, ""), WebClient.builder(),
                    "http://127.0.0.1:" + server.getAddress().getPort(), shelf, "test");
            assertEquals(2, service.getReadingKeywords(1L).get("analyzed"));
            var mapper = new ObjectMapper();
            assertEquals(mapper.valueToTree(List.of("a", "b")), mapper.readTree(request.get()).get("isbns"));
        } finally {
            server.stop(0);
        }
    }
}
