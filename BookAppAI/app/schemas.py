from pydantic import BaseModel, Field
from typing import Optional, List

class KeywordRequest(BaseModel):
    keywords: List[str]
    max_pages_per_term: int = Field(default=5, ge=1, le=5)
    max_new_books: Optional[int] = Field(default=None, ge=1, le=20)

class SingleBookRequest(BaseModel):
    title: str
    contents: Optional[str] = ""
    isbn: str
    authors: Optional[List[str]] = []
    publisher: Optional[str] = ""
    thumbnail: Optional[str] = ""

class AiSearchRequest(BaseModel):
    query: str

class UserBookEntry(BaseModel):
    isbn: str
    status: str  # "COMPLETED" | "READING" | "TO_READ"

class ContentRecommendRequest(BaseModel):
    user_books: List[UserBookEntry]
    limit: int = 10

class ReadingTagsRequest(BaseModel):
    isbns: List[str]
    limit: int = 7
