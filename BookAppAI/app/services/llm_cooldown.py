import time


COOLDOWN_SECONDS = 60
TRANSIENT_COOLDOWN_SECONDS = 30
TRANSIENT_FAILURE_THRESHOLD = 2
_blocked_until = 0.0
_transient_failures = 0


class ProviderCooldown:
    """Keep an independent failure window for an optional LLM provider."""

    def __init__(self) -> None:
        self.blocked_until = 0.0
        self.transient_failures = 0

    def available(self) -> bool:
        return time.monotonic() >= self.blocked_until

    def rate_limited(self, retry_after: float | None = None) -> None:
        delay = max(COOLDOWN_SECONDS, min(retry_after or 0, 300))
        self.blocked_until = max(self.blocked_until, time.monotonic() + delay)

    def transient_failure(self) -> None:
        self.transient_failures += 1
        if self.transient_failures >= TRANSIENT_FAILURE_THRESHOLD:
            self.blocked_until = max(self.blocked_until, time.monotonic() + TRANSIENT_COOLDOWN_SECONDS)
            self.transient_failures = 0

    def succeeded(self) -> None:
        self.transient_failures = 0

    def disable(self) -> None:
        """Stop retrying a configuration error until the process is restarted."""
        self.blocked_until = float("inf")


def available() -> bool:
    return time.monotonic() >= _blocked_until


def rate_limited() -> None:
    global _blocked_until
    _blocked_until = max(_blocked_until, time.monotonic() + COOLDOWN_SECONDS)


def transient_failure() -> None:
    global _blocked_until, _transient_failures
    _transient_failures += 1
    if _transient_failures >= TRANSIENT_FAILURE_THRESHOLD:
        _blocked_until = max(_blocked_until, time.monotonic() + TRANSIENT_COOLDOWN_SECONDS)
        _transient_failures = 0


def succeeded() -> None:
    global _transient_failures
    _transient_failures = 0
