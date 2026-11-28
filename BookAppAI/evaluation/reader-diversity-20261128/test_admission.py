"""The bulk classifier cannot borrow another edition's evidence or expose catalog identifiers."""

import importlib.util
import json
from pathlib import Path

import pytest


def load_module(name):
    spec = importlib.util.spec_from_file_location(
        name, Path(__file__).with_name(name + ".py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


batch = load_module("index_batch")


@pytest.mark.asyncio
async def test_classifier_checks_evidence_against_each_edition(monkeypatch):
    shared_credit = "자료의 출처이며 추천을 뒷받침하는 문장이 아닙니다."
    first = "화분의 물 주기와 흙을 선택하는 방법을 설명한다."
    second = "밤하늘에서 계절의 별자리를 찾아보는 관측 안내서다."
    books = {
        "9788936433598": (
            {
                "title": "화분",
                "authors": "김가",
                "contents": first + "\n\n출처:" + shared_credit,
            },
            "1,2,3",
        ),
        "9788956604992": (
            {
                "title": "별자리",
                "authors": "이나",
                "contents": second + "\n\n출처:" + shared_credit,
            },
            "4,5,6",
        ),
    }

    async def respond(client, method, payload):
        transmission = json.dumps(payload, ensure_ascii=False)
        assert not any(isbn in transmission for isbn in books)
        assert shared_credit not in transmission
        rows = [
            {
                "ref": ref,
                "book_type": "PRACTICAL",
                "primary_keyword": "원예",
                "tags": ["화분"],
                "evidence_quote": first,
            }
            for ref in ("B2", "B1")
        ]
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": json.dumps({"books": rows}, ensure_ascii=False)}
                        ]
                    }
                }
            ]
        }

    monkeypatch.setattr(batch, "request", respond)
    accepted, held = await batch.classify(None, books)
    assert list(accepted) == ["9788936433598"]
    assert held == {"9788956604992": "UNVERIFIED_EVIDENCE"}


@pytest.mark.asyncio
async def test_duplicate_response_cannot_assign_an_artifact(monkeypatch):
    passage = "동네에서 흔히 볼 수 있는 새의 생김새를 기록했다."
    books = {
        "book": ({"title": "탐조", "authors": "김가", "contents": passage}, "1,2,3")
    }
    row = {
        "ref": "B1",
        "book_type": "NONFICTION",
        "primary_keyword": "조류",
        "tags": ["탐조"],
        "evidence_quote": passage,
    }

    async def respond(*args):
        return {
            "candidates": [
                {"content": {"parts": [{"text": json.dumps({"books": [row, row]})}]}}
            ]
        }

    monkeypatch.setattr(batch, "request", respond)
    accepted, held = await batch.classify(None, books)
    assert not accepted
    assert held == {"book": "MISSING_OR_DUPLICATE_RESULT"}


def test_rejects_truncated_and_invalid_isbns():
    holdings = load_module("holdings")
    assert holdings.valid_isbn("9788936433598")
    assert not holdings.valid_isbn("9788936433599")
    assert not holdings.valid_isbn("9791180000000")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "readable",
    [
        {},
        {"book": ({"title": "바뀐 책"}, "1,2,3")},
        {"book": ({"title": "검토한 책"}, "4,5,6")},
    ],
)
async def test_changed_or_ineligible_field_cannot_enter_a_model_request(
    monkeypatch, readable
):
    class Session:
        async def execute(self, *args):
            return None

    async def allowed(db, ids, uses):
        assert uses == batch.EMBEDDING_USES
        return readable

    monkeypatch.setattr(batch, "read_input_batch", allowed)
    with pytest.raises(ValueError, match="permissions have changed"):
        await batch.locked_fields(
            Session(), ["book"], {"book": ({"title": "검토한 책"}, "1,2,3")}
        )


@pytest.mark.asyncio
async def test_daily_quota_stops_without_retrying(monkeypatch):
    import httpx

    async def forbidden_sleep(*args):
        pytest.fail("Daily quota must stop the run")

    async def reply(request):
        return httpx.Response(
            429,
            json={
                "error": {
                    "status": "RESOURCE_EXHAUSTED",
                    "details": [
                        {"violations": [{"quotaId": "EmbedContentRequestsPerDay"}]}
                    ],
                }
            },
        )

    monkeypatch.setattr(batch.asyncio, "sleep", forbidden_sleep)
    async with httpx.AsyncClient(transport=httpx.MockTransport(reply)) as client:
        with pytest.raises(RuntimeError, match="Daily quota"):
            await batch.request(client, "model:embedContent", {})


@pytest.mark.asyncio
async def test_temporary_provider_outage_recovers_without_switching_models(monkeypatch):
    import httpx

    seen = []
    waits = []

    async def reply(request):
        seen.append(request.url.path)
        if len(seen) == 1:
            return httpx.Response(503, content=b"Service temporarily unavailable")
        return httpx.Response(200, json={"recovered": True})

    async def delay(seconds):
        waits.append(seconds)

    monkeypatch.setattr(batch.asyncio, "sleep", delay)
    async with httpx.AsyncClient(transport=httpx.MockTransport(reply)) as client:
        assert await batch.request(client, "model:generateContent", {}) == {
            "recovered": True
        }
    assert len(seen) == 2 and seen[0] == seen[1]
    assert waits and min(waits) > 0
