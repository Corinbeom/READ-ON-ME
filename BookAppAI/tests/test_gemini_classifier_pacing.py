from types import SimpleNamespace

import pytest

from app.services import gemini_tagger


@pytest.mark.asyncio
async def test_classifier_calls_wait_for_minimum_interval(monkeypatch):
    clock = SimpleNamespace(now=102.0)
    waits = []

    async def fake_sleep(seconds):
        waits.append(seconds)
        clock.now += seconds

    monkeypatch.setattr(gemini_tagger, "time", SimpleNamespace(monotonic=lambda: clock.now))
    monkeypatch.setattr(gemini_tagger, "asyncio", SimpleNamespace(sleep=fake_sleep))
    monkeypatch.setattr(gemini_tagger, "GEMINI_CLASSIFIER_MIN_INTERVAL_SECONDS", 6.0)
    monkeypatch.setattr(gemini_tagger, "_last_classification_started", 100.0)

    await gemini_tagger._wait_for_classifier_interval()
    assert waits == [4.0]
    assert gemini_tagger._last_classification_started == 106.0
