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
