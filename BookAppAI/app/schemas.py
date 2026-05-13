from pydantic import BaseModel
from typing import Optional, List

class KeywordRequest(BaseModel):
    keywords: List[str]

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
