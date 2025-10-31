from sqlalchemy import Column, String, Text, Float, DateTime, func
from sqlalchemy.dialects.postgresql import BIGINT
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
    embedding = Column(Vector(768), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
