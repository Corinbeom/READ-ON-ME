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
