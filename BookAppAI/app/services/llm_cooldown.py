import time


COOLDOWN_SECONDS = 60
_blocked_until = 0.0


def available() -> bool:
    return time.monotonic() >= _blocked_until


def rate_limited() -> None:
    global _blocked_until
    _blocked_until = max(_blocked_until, time.monotonic() + COOLDOWN_SECONDS)
