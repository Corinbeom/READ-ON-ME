from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class CorpusIngestionJob(Base):
    __tablename__ = "corpus_ingestion_jobs"

    id = Column(String(36), primary_key=True)
    job_type = Column(String(10), nullable=False)  # BATCH | BOOK
    source = Column(String(20), nullable=False)  # KAKAO_BATCH | USER_LIBRARY | CURATED_SEED
    isbn = Column(String(20), nullable=True)
    run_id = Column(String(36), ForeignKey("corpus_ingestion_jobs.id"), nullable=True)
    status = Column(String(20), nullable=False, default="PENDING")
    payload = Column(JSONB, nullable=False, default=dict)
    progress = Column(JSONB, nullable=False, default=dict)
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    error_code = Column(String(40), nullable=True)
    reject_reason = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_corpus_jobs_due", "status", "next_attempt_at"),
        Index("uq_corpus_batch_book_run", "isbn", "run_id", unique=True,
              postgresql_where=(job_type == "BOOK") & (source == "KAKAO_BATCH")),
        Index("uq_corpus_user_book_isbn", "isbn", unique=True,
              postgresql_where=(job_type == "BOOK") & (source == "USER_LIBRARY")),
        Index("uq_corpus_curated_book_isbn", "isbn", unique=True,
              postgresql_where=(job_type == "BOOK") & (source == "CURATED_SEED")),
    )
