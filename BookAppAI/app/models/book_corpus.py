from sqlalchemy import Column, String, Text, Float, DateTime, func
from sqlalchemy.dialects.postgresql import BIGINT, JSONB
from pgvector.sqlalchemy import Vector
from app.database import Base

class BookCorpus(Base):
    __tablename__ = 'book_corpus'

    id = Column(BIGINT, primary_key=True, index=True)
    title = Column(String, nullable=False)
    contents = Column(Text, nullable=True)
    isbn = Column(String, unique=True, nullable=False, index=True)
    authors = Column(String, nullable=True) # Storing as comma-separated string
    publisher = Column(String, nullable=True)
    thumbnail = Column(String, nullable=True)
    keyword = Column(String, nullable=False)
    similarity_score = Column(Float, nullable=False)
    embedding = Column(Vector(768), nullable=True)
    gemini_embedding = Column(Vector(768), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    tags = Column(JSONB, default=list)
    recommendation_status = Column(String(20), nullable=False, default="LEGACY")
    source = Column(String(30), nullable=True)
    classification_version = Column(String(100), nullable=True)
    validated_at = Column(DateTime(timezone=True), nullable=True)
    kdc_code = Column(String(20), nullable=True)
    kdc_source = Column(String(30), nullable=True)
    kdc_checked_at = Column(DateTime(timezone=True), nullable=True)
