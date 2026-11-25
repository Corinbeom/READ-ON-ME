package bookapp.bookappback.ai.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static bookapp.bookappback.ai.service.GalpiAvailability.State.*;
import static org.junit.jupiter.api.Assertions.*;

class GalpiReleaseProbeTest {
    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void tracesSuccessfulBodyAndPreservesUpstreamErrors(CapturedOutput output) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var code = new java.util.concurrent.atomic.AtomicInteger(200);
        server.createContext("/api/ai/search", exchange -> {
            int status = code.get();
            byte[] body = "[{\"title\":\"private fixture\"}]".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.getResponseHeaders().set("X-Search-Outcome", "MODEL");
            exchange.sendResponseHeaders(status, body.length);
            try (var stream = exchange.getResponseBody()) { stream.write(body); }
        });
        server.start();
        try {
            var client = new AiSearchService(WebClient.builder(), "http://127.0.0.1:" + server.getAddress().getPort(), "");
            var id = java.util.UUID.randomUUID().toString();
            var result = client.searchWithOutcome("private query", id).block();
            assertNotNull(result);
            assertEquals("MODEL", result.status());
            assertEquals(1, result.books().size());
            assertTrue(output.getOut().contains("reviewed_http_headers request_id=" + id + " status=200"));
            assertTrue(output.getOut().contains("reviewed_http_body request_id=" + id + " decode_ms="));
            assertFalse(output.getOut().lines().filter(line -> line.contains("reviewed_http")).anyMatch(line -> line.contains("private")));
            code.set(503);
            assertThrows(WebClientResponseException.ServiceUnavailable.class,
                    () -> client.searchWithOutcome("private query", id).block());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void onlyAnExplicitMaintenanceOrDifferentReleaseConfirmsClosure() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        String[] bodies = {"{\"release\":\"v1\"}", "{\"release\":\"v2\"}", "{\"code\":\"AI_SEARCH_MAINTENANCE\"}",
                "{\"code\":\"UPSTREAM_UNAVAILABLE\"}", "Bad Gateway", "{}"};
        int[] statuses = {200, 200, 503, 503, 502, 200};
        var expected = new GalpiAvailability.State[]{AVAILABLE, MAINTENANCE, MAINTENANCE, UNCONFIRMED, UNCONFIRMED, UNCONFIRMED};
        for (int i = 0; i < statuses.length; i++) {
            int status = statuses[i];
            byte[] body = bodies[i].getBytes(StandardCharsets.UTF_8);
            server.createContext("/" + i + "/api/ai/reviewed-release", exchange -> {
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, body.length);
                try (var stream = exchange.getResponseBody()) { stream.write(body); }
            });
        }
        server.start();
        try {
            for (int i = 0; i < statuses.length; i++) {
                var client = new AiSearchService(WebClient.builder(), "http://127.0.0.1:" + server.getAddress().getPort() + "/" + i, "");
                assertEquals(expected[i], client.releaseState("v1"));
            }
        } finally {
            server.stop(0);
        }
    }
}
