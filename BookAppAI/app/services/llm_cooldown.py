import time


COOLDOWN_SECONDS = 60
TRANSIENT_COOLDOWN_SECONDS = 30
TRANSIENT_FAILURE_THRESHOLD = 2
_blocked_until = 0.0
_transient_failures = 0


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
