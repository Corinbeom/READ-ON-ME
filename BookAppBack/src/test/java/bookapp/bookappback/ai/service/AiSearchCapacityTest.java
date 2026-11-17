package bookapp.bookappback.ai.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AiSearchCapacityTest {
    @Test
    void singleWorkerDeploymentNeverGrantsASecondPermit() {
        var capacity = new AiSearchCapacity(1);
        assertTrue(capacity.tryAcquire());
        assertFalse(capacity.tryAcquire());
        capacity.release();
        assertTrue(capacity.tryAcquire());
        assertFalse(capacity.tryAcquire());
    }

    @Test
    void zeroWorkersIsRejectedAtStartup() {
        assertThrows(IllegalArgumentException.class, () -> new AiSearchCapacity(0));
    }
}
