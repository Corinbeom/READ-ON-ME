"""Legacy corpus inputs have no field-level permission evidence."""

from sqlalchemy import update, func

from app.models.book_tagging_job import BookTaggingJob
from app.models.corpus_ingestion_job import CorpusIngestionJob

HOLD_REASON = "SOURCE_PERMISSION_UNVERIFIED"


class CorpusPermissionError(RuntimeError):
    pass


def require_verified_corpus() -> None:
    raise CorpusPermissionError(HOLD_REASON)


async def hold_pending_jobs(db) -> None:
    pending = ("PENDING", "RETRY", "RUNNING")
    await db.execute(update(CorpusIngestionJob).where(CorpusIngestionJob.status.in_(pending)).values(
        status="POLICY_HOLD", error_code=HOLD_REASON, updated_at=func.now(),
    ))
    await db.execute(update(BookTaggingJob).where(BookTaggingJob.status.in_(pending)).values(
        status="POLICY_HOLD", last_error_code=HOLD_REASON, updated_at=func.now(),
    ))


# The policy registry is operator-maintained. Legacy source labels and job payloads never grant uses.
MODEL_FIELDS = ("title", "authors", "contents")
MODEL_USES = frozenset({"store", "display", "publish_derivative", "external_ai", "commercial"})
EMBEDDING_USES = MODEL_USES | {"store_embedding"}


def permits(provider, active, allowed, required):
    if not provider or not provider.strip() or not active or not required or not required.issubset(allowed or ()):
        return False
    return provider.strip().upper() not in {"KAKAO", "UNKNOWN", "UNVERIFIED"} or not required.intersection(
        {"external_ai", "store_embedding", "publish_derivative"}
    )
