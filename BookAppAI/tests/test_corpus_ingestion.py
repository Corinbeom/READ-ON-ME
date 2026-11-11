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
async def test_pilot_batch_stops_after_five_new_books(monkeypatch):
    job = SimpleNamespace(
        id="pilot", payload={"keywords": ["pilot"], "max_pages_per_term": 1, "max_new_books": 5},
        progress={"term_index": 0, "page": 1, "fetched": 0, "queued": 0, "duplicates": 0, "invalid_isbn": 0},
        status="RUNNING", attempts=1, error_code=None, next_attempt_at=None, updated_at=None,
    )

    class BatchSession(FakeSession):
        async def execute(self, statement):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    monkeypatch.setattr(corpus_ingestion.database, "async_session", lambda: BatchSession(job))

    async def fetch(term, page):
        assert (term, page) == ("pilot", 1)
        return [{"isbn": "9780000000002"} for _ in range(20)], False

    queued = []

    async def enqueue(db, book, **kwargs):
        queued.append(book)
        return "QUEUED", None

    monkeypatch.setattr(corpus_ingestion, "_fetch_kakao_page", fetch)
    monkeypatch.setattr(corpus_ingestion, "enqueue_book", enqueue)
    await corpus_ingestion._process_batch("pilot")
    assert len(queued) == 5
    assert job.status == "DONE"
    assert job.progress["fetched"] == 20
    assert job.progress["queued"] == 5
    assert job.progress["skipped_limit"] == 15
    assert job.progress["limit_reached"] is True


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
@pytest.mark.parametrize("initial_status, expected_status", [
    ("PENDING", "PENDING"), ("RETRY", "RETRY"), ("HOLD", "QUEUED"),
])
async def test_duplicate_book_uses_richer_source_description(initial_status, expected_status):
    old_book = {
        "isbn": "9780000000002", "title": "작은 책", "authors": "작가",
        "contents": "짧은 소개", "publisher": "기존 출판사",
    }
    job = SimpleNamespace(
        id="book-job", status=initial_status, reject_reason="SHORT_DESCRIPTION",
        payload={"book": old_book, "discovery_keywords": ["에세이"]},
        attempts=2, error_code="TEMPORARY", next_attempt_at=None,
    )

    class EnqueueSession:
        def __init__(self):
            self.calls = 0

        async def execute(self, statement):
            self.calls += 1
            value = job if self.calls == 3 else None
            return SimpleNamespace(scalar_one_or_none=lambda: value, scalar_one=lambda: value)

        async def commit(self):
            pass

    richer_description = "작가의 일상과 관계를 담은 산문집입니다. " * 6
    status, returned = await corpus_ingestion.enqueue_book(
        EnqueueSession(),
        {"isbn": old_book["isbn"], "title": "작은 책", "authors": "작가",
         "contents": richer_description, "publisher": ""},
        source="KAKAO_BATCH", run_id="batch-1", discovery_keyword="산문",
    )
    assert status == expected_status
    assert returned is job
    assert job.payload["book"]["contents"] == richer_description
    assert job.payload["book"]["publisher"] == "기존 출판사"
    assert job.payload["discovery_keywords"] == ["에세이", "산문"]
    if initial_status == "HOLD":
        assert job.status == "PENDING"
        assert job.attempts == 0
        assert job.reject_reason is None
    else:
        assert job.status == initial_status


@pytest.mark.asyncio
async def test_short_description_is_enriched_before_classification(monkeypatch):
    book = {
        "isbn": "9780000000002", "title": "과학의 세계", "authors": "작가",
        "contents": "", "publisher": "출판사",
    }
    description = "과학 지식을 일상의 실험과 연결하는 책입니다. 초등학생을 위한 설명을 담았습니다."
    job = SimpleNamespace(
        id="hold-job", isbn=book["isbn"], source="KAKAO_BATCH",
        payload={"book": book, "discovery_keywords": ["과학"]},
    )

    class EnrichmentSession(FakeSession):
        async def get(self, model, job_id, **kwargs):
            return job

    monkeypatch.setattr(corpus_ingestion.database, "async_session", lambda: EnrichmentSession(job))

    async def fetch(isbn):
        assert isbn == book["isbn"]
        return description

    async def no_similar(*args):
        return None

    async def vector(*args):
        return [0.1]

    async def classify(title, contents, authors):
        assert contents == description
        return {
            "book_type": "NONFICTION", "evidence_quote": "과학 지식을 일상의 실험과 연결하는 책입니다.",
            "primary_keyword": "과학", "tags": ["과학"],
        }

    outcomes = []

    async def finish(*args, **kwargs):
        outcomes.append(args)

    monkeypatch.setattr(corpus_ingestion, "fetch_naru_description", fetch)
    monkeypatch.setattr(book_ai_service, "find_similar_corpus_edition", no_similar)
    monkeypatch.setattr(book_ai_service, "get_embedding", vector)
    monkeypatch.setattr(book_ai_service, "cosine_similarity", lambda *args: 0.7)
    monkeypatch.setattr(corpus_ingestion, "_keyword_vector", vector)
    monkeypatch.setattr(corpus_ingestion.corpus_tagger, "classify_book", classify)
    monkeypatch.setattr(corpus_ingestion, "_finish_book", finish)
    await corpus_ingestion._process_book("hold-job")
    assert job.payload["book"]["contents"] == description
    assert job.payload["contents_source"] == "DATA4LIBRARY"
    assert outcomes == [("hold-job", "ACTIVE", None)]


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
