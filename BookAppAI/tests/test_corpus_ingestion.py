from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex

from app.models.corpus_ingestion_job import CorpusIngestionJob
from app.services import book_ai_service, corpus_ingestion


class FakeSession:
    def __init__(self, job):
        self.job = job

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, model, job_id):
        return self.job

    async def execute(self, statement):
        return SimpleNamespace(scalar_one_or_none=lambda: None)

    async def commit(self):
        pass


def test_batch_book_uniqueness_is_scoped_to_run():
    indexes = {index.name: str(CreateIndex(index).compile(dialect=postgresql.dialect()))
               for index in CorpusIngestionJob.__table__.indexes}
    assert '(isbn, run_id)' in indexes['uq_corpus_batch_book_run']
    assert "source = 'KAKAO_BATCH'" in indexes['uq_corpus_batch_book_run']
    assert '(isbn)' in indexes['uq_corpus_user_book_isbn']
    assert "source = 'USER_LIBRARY'" in indexes['uq_corpus_user_book_isbn']


@pytest.mark.asyncio
async def test_rejected_batch_book_requeues_for_new_keyword_without_losing_richer_metadata():
    old_book = {
        "isbn": "9780000000002", "title": "별과 밤의 이야기", "authors": "작가",
        "contents": "밤하늘을 배경으로 여러 인물이 여행하며 서로의 이야기를 듣는 장편 소설입니다.",
    }
    job = SimpleNamespace(
        id="book-job", status="REJECTED", reject_reason="LOW_TOPIC_SIMILARITY",
        payload={"book": old_book, "discovery_keywords": ["문학"]},
        attempts=1, error_code=None, next_attempt_at=None,
    )

    class EnqueueSession:
        def __init__(self):
            self.calls = 0
            self.selection = None

        async def execute(self, statement):
            self.calls += 1
            if self.calls == 3:
                self.selection = statement
            value = job if self.calls == 3 else None
            return SimpleNamespace(scalar_one_or_none=lambda: value, scalar_one=lambda: value)

        async def commit(self):
            pass

    session = EnqueueSession()
    status, returned = await corpus_ingestion.enqueue_book(
        session, {**old_book, "contents": "짧은 소개"}, source="KAKAO_BATCH",
        run_id="batch-1", discovery_keyword="여행",
    )
    assert status == "QUEUED"
    assert returned is job
    assert job.payload == {"book": old_book, "discovery_keywords": ["문학", "여행"]}
    assert job.status == "PENDING"
    assert job.attempts == 0
    selection = session.selection.compile(dialect=postgresql.dialect())
    assert selection.params["run_id_1"] == "batch-1"


@pytest.mark.asyncio
async def test_rejected_book_never_uses_embedding_or_gemini(monkeypatch):
    job = SimpleNamespace(
        id="one", isbn="9780000000002", source="USER_LIBRARY",
        payload={"book": {"isbn": "9780000000002", "title": "수능문학 문제집", "authors": "작가", "contents": "시험대비 문제와 정답 해설이 가득한 수능 교재입니다."}},
    )
    monkeypatch.setattr(corpus_ingestion.database, "async_session", lambda: FakeSession(job))

    async def forbidden(*args, **kwargs):
        raise AssertionError("expensive work ran before the quality gate")

    outcomes = []

    async def finish(*args, **kwargs):
        outcomes.append(args)

    monkeypatch.setattr(book_ai_service, "get_embedding", forbidden)
    monkeypatch.setattr(corpus_ingestion.corpus_tagger, "classify_book", forbidden)
    monkeypatch.setattr(corpus_ingestion, "_finish_book", finish)
    await corpus_ingestion._process_book("one")
    assert outcomes == [("one", "REJECTED", "EDUCATIONAL_MATERIAL")]


@pytest.mark.asyncio
async def test_low_similarity_book_skips_gemini(monkeypatch):
    book = {
        "isbn": "9780000000002", "title": "별과 밤의 이야기", "authors": "작가",
        "contents": "별이 가득한 밤을 배경으로 한 인물이 먼 길을 떠나는 소설입니다.",
    }
    job = SimpleNamespace(id="two", isbn=book["isbn"], source="KAKAO_BATCH", payload={"book": book, "discovery_keywords": ["문학"]})
    monkeypatch.setattr(corpus_ingestion.database, "async_session", lambda: FakeSession(job))

    async def no_similar(*args):
        return None

    async def vector(*args):
        return [0.1]

    async def forbidden(*args):
        raise AssertionError("Gemini should not run for low similarity")

    outcomes = []

    async def finish(*args, **kwargs):
        outcomes.append(args)

    monkeypatch.setattr(book_ai_service, "find_similar_corpus_edition", no_similar)
    monkeypatch.setattr(book_ai_service, "get_embedding", vector)
    monkeypatch.setattr(book_ai_service, "cosine_similarity", lambda *args: 0.1)
    monkeypatch.setattr(corpus_ingestion, "_keyword_vector", vector)
    monkeypatch.setattr(corpus_ingestion.corpus_tagger, "classify_book", forbidden)
    monkeypatch.setattr(corpus_ingestion, "_finish_book", finish)
    await corpus_ingestion._process_book("two")
    assert outcomes == [("two", "REJECTED", "LOW_TOPIC_SIMILARITY")]


@pytest.mark.asyncio
async def test_rate_limited_ingestion_keeps_retrying_with_backoff(monkeypatch):
    job = SimpleNamespace(id="retry", status="RUNNING", attempts=1, next_attempt_at=None, error_code=None, updated_at=None)
    monkeypatch.setattr(corpus_ingestion.database, "async_session", lambda: FakeSession(job))

    await corpus_ingestion._record_failure("retry", corpus_ingestion.IngestionFailure("KAKAO_RATE_LIMIT"))
    assert job.status == "RETRY"
    assert job.error_code == "KAKAO_RATE_LIMIT"
    assert job.next_attempt_at is not None

    job.status = "RUNNING"
    job.attempts = 3
    await corpus_ingestion._record_failure("retry", corpus_ingestion.IngestionFailure("KAKAO_RATE_LIMIT"))
    assert job.status == "RETRY"


@pytest.mark.asyncio
async def test_other_transient_failure_stops_after_three_attempts(monkeypatch):
    job = SimpleNamespace(id="upstream", status="RUNNING", attempts=3, next_attempt_at=None, error_code=None, updated_at=None)
    monkeypatch.setattr(corpus_ingestion.database, "async_session", lambda: FakeSession(job))

    await corpus_ingestion._record_failure("upstream", corpus_ingestion.IngestionFailure("UPSTREAM_ERROR"))
    assert job.status == "FAILED"


@pytest.mark.asyncio
async def test_auth_failure_is_not_retried(monkeypatch):
    job = SimpleNamespace(id="auth", status="RUNNING", attempts=1, next_attempt_at=None, error_code=None, updated_at=None)
    monkeypatch.setattr(corpus_ingestion.database, "async_session", lambda: FakeSession(job))

    await corpus_ingestion._record_failure("auth", corpus_ingestion.IngestionFailure("KAKAO_AUTH_ERROR", retryable=False))
    assert job.status == "FAILED"
    assert job.error_code == "KAKAO_AUTH_ERROR"
