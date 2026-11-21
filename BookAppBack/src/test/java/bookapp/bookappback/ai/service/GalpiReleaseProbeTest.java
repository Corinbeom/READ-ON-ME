package bookapp.bookappback.ai.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static bookapp.bookappback.ai.service.GalpiAvailability.State.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

class GalpiReleaseProbeTest {
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
