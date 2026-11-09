package bookapp.bookappback.ai.service;

import org.springframework.stereotype.Component;
import java.util.concurrent.Semaphore;

@Component
public class AiSearchCapacity {
    private final Semaphore permits = new Semaphore(2, true);

    public boolean tryAcquire() { return permits.tryAcquire(); }
    public void release() { permits.release(); }
}
