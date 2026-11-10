from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.database import Base


class BookTaggingJob(Base):
    __tablename__ = "book_tagging_jobs"

    isbn = Column(String, ForeignKey("book_corpus.isbn", ondelete="CASCADE"), primary_key=True)
    status = Column(String(20), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime(timezone=True), nullable=False)
    model_version = Column(String(100), nullable=False)
    last_error_code = Column(String(40))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
