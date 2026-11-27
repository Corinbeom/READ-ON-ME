package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.repository.AiSearchJobRepository;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GalpiAvailabilityTest {
    @Test
    void candidateRejectionRemainsRetryableUntilDeploymentIsResolved() {
        var client = mock(AiSearchService.class);
        var jobs = mock(AiSearchJobRepository.class);
        var availability = new GalpiAvailability(client, "active", jobs);
        when(client.releaseState("active")).thenReturn(GalpiAvailability.State.MAINTENANCE);
        when(jobs.deploymentHoldsClaims()).thenReturn(true, false);

        assertEquals(GalpiAvailability.State.UNCONFIRMED, availability.state());
        assertEquals(GalpiAvailability.State.MAINTENANCE, availability.state());
    }
}
