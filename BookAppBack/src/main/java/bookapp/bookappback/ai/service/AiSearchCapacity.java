package bookapp.bookappback.ai.service;

import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import java.util.concurrent.Semaphore;

@Component
public class AiSearchCapacity {
    private final Semaphore permits;

    public AiSearchCapacity(@Value("${ai.search.max-concurrent:2}") int maxConcurrent) {
        if (maxConcurrent < 1) throw new IllegalArgumentException("AI search concurrency must be positive");
        permits = new Semaphore(maxConcurrent, true);
    }

    public boolean tryAcquire() { return permits.tryAcquire(); }
    public void release() { permits.release(); }
}
