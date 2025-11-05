import os
import re
from typing import List, Optional, Union

import httpx
import numpy as np
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import text

from app.models.book_corpus import BookCorpus
from app.schemas import SingleBookRequest

from sentence_transformers import SentenceTransformer
import torch


# --- Configuration ---
KAKAO_API_KEY = os.getenv("KAKAO_API_KEY")

if not KAKAO_API_KEY:
    raise ValueError("KAKAO_API_KEY must be set in .env file")

KAKAO_API_URL = "https://dapi.kakao.com/v3/search/book"
SIMILARITY_THRESHOLD = 0.65
AI_SEARCH_THRESHOLD = 0.65
AI_SIMILARITY_THRESHOLD = 0.55  # New threshold for general similarity queries
AI_SEARCH_LIMIT = 20
AI_SEARCH_RESULT_LIMIT = int(os.getenv("AI_SEARCH_RESULT_LIMIT", "5"))
AUTHOR_SEARCH_THRESHOLD = float(os.getenv("AUTHOR_SEARCH_THRESHOLD", "0.5"))
SIMILARITY_FILTER_ENABLED = os.getenv("SIMILARITY_FILTER_ENABLED", "true").lower() == "true"
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "jhgan/ko-sroberta-multitask")

# Terms that almost always indicate 학습/문제집 계열 도서.
EXCLUSION_STRICT_TERMS = [
    "수능",
    "모의고사",
    "기출",
    "시험대비",
    "정답지",
    "정답 해설",
    "족보",
    "워크북",
    "교재",
    "문제집",
    "단원평가",
    "자이스토리",
    "내신",
]

EXCLUSION_COMBO_LEADS = [
    "중학",
    "중학교",
    "초등",
    "초등학교",
    "고등",
    "고등학교",
    "중등",
    "국어",
    "수학",
    "사회",
    "과학",
]

EXCLUSION_COMBO_TRAILERS = [
    "문제집",
    "독해",
    "교과서",
    "자습서",
    "기출",
    "모의고사",
    "수능",
    "내신",
    "평가",
    "학년",
]

# Optional human crafted prompts for 더 풍부한 키워드 표현.
KEYWORD_PROMPTS = {
    "sf": "이 책은 공상 과학 소설(SF) 장르에 속하며 미래 기술과 상상력을 다룹니다.",
    "fantasy": "이 책은 판타지 세계관을 배경으로 한 소설입니다. 마법과 모험이 가득합니다.",
    "romance": "이 책은 사랑과 관계를 중심으로 한 로맨스 소설입니다.",
    "thriller": "이 책은 긴장감 넘치는 전개가 특징인 스릴러 장르 소설입니다.",
}
DEFAULT_PROMPT_TEMPLATE = (
    "이 책은 '{keyword}' 주제와 깊이 관련된 도서입니다. 독자에게 {keyword}에 대한 통찰과 경험을 제공합니다."
)
AUTHOR_PATTERN = re.compile(r"([\w\s·가-힣]+?)\s*(?:작가)?\s*의\s*(?:책|작품|소설)")
AUTHOR_KEYWORDS = ["작가", "저자", "필명"]


# --- Hugging Face Model Loading ---
# Check if GPU is available and use it, otherwise use CPU
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")
print(f"Loading embedding model: {EMBEDDING_MODEL_NAME}")
embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME, device=device)


# --- Helpers ---

def _normalize_text(text: Optional[str]) -> str:
    return (text or "").strip()


def format_authors(authors: Optional[Union[List[str], str]]) -> str:
    if isinstance(authors, list):
        return ", ".join(a for a in authors if a)
    return _normalize_text(authors)


def build_keyword_prompt(keyword: str) -> str:
    normalized = _normalize_text(keyword)
    if not normalized:
        return "이 책은 다양한 주제를 다루는 도서입니다."
    prompt = KEYWORD_PROMPTS.get(normalized.lower())
    if prompt:
        return prompt
    return DEFAULT_PROMPT_TEMPLATE.format(keyword=normalized)


def contains_exclusion_terms(*chunks: str) -> bool:
    target_text = " ".join(_normalize_text(chunk).lower() for chunk in chunks if chunk is not None)
    if any(term in target_text for term in EXCLUSION_STRICT_TERMS):
        return True
    if any(lead in target_text for lead in EXCLUSION_COMBO_LEADS) and any(
        trailer in target_text for trailer in EXCLUSION_COMBO_TRAILERS
    ):
        return True
    return False


def should_skip_book(keyword: str, book: dict) -> bool:
    """
    Heuristic gate to ignore 명백한 학습/문제집 도서 등.
    """
    title = book.get("title", "")
    contents = book.get("contents", "")
    authors = format_authors(book.get("authors"))

    if contains_exclusion_terms(title, contents):
        return True

    # Kakao API에서 가끔 제목만 있고 다른 정보가 비어있는 자료는 노이즈인 경우가 많다.
    if not _normalize_text(contents) and not authors:
        return True

    return False


def build_book_text(title: str, contents: str, authors: Optional[Union[List[str], str]]) -> str:
    author_text = format_authors(authors)
    base = f"이 책은 {author_text} 작가가 쓴 책입니다." if author_text else "이 책은 다양한 작가의 관점을 담고 있습니다."
    return (
        f"{base} 제목: {title}. "
        f"내용: {contents or '이 책에 대한 상세 설명은 제공되지 않았습니다.'}"
    )


# --- Service Functions ---


async def get_embedding(text: str):
    """Generates embedding for a given text using Hugging Face SentenceTransformer."""
    try:
        # SentenceTransformer's encode method returns numpy array by default
        embedding = embedding_model.encode(text, convert_to_numpy=True)
        return embedding.tolist()  # Convert to list for pgvector compatibility
    except Exception as e:
        print(f"Error getting embedding for text: '{text}' - {e}")
        return None


async def search_kakao_books(keyword: str, page: int):
    """Searches for books using Kakao API."""
    headers = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}
    params = {"query": keyword, "page": page, "size": 10}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(KAKAO_API_URL, headers=headers, params=params)
            response.raise_for_status()
            return response.json()["documents"]
        except httpx.RequestError as e:
            print(f"Error fetching from Kakao API: {e}")
            return []


def cosine_similarity(vec1, vec2):
    """Calculates cosine similarity between two vectors."""
    if not isinstance(vec1, np.ndarray):
        vec1 = np.array(vec1)
    if not isinstance(vec2, np.ndarray):
        vec2 = np.array(vec2)
    dot_product = np.dot(vec1, vec2)
    norm_vec1 = np.linalg.norm(vec1)
    norm_vec2 = np.linalg.norm(vec2)
    if norm_vec1 == 0 or norm_vec2 == 0:
        return 0.0
    return dot_product / (norm_vec1 * norm_vec2)


async def check_if_isbn_exists(db: AsyncSession, isbn: str):
    """Checks if a book with the given ISBN already exists in the database."""
    result = await db.execute(select(BookCorpus).filter(BookCorpus.isbn == isbn))
    return result.scalars().first() is not None


# --- Main Orchestrators & Search ---


async def process_keywords(keywords: list[str], db: AsyncSession):
    """The main function to orchestrate the data building process."""
    total_saved_count = 0
    total_similarity = 0
    processed_books_count = 0
    for keyword in keywords:
        print(f"Processing keyword: {keyword} (filter={'ON' if SIMILARITY_FILTER_ENABLED else 'OFF'})")
        keyword_prompt = build_keyword_prompt(keyword)
        keyword_embedding = await get_embedding(keyword_prompt)
        if not keyword_embedding:
            print(f"Could not generate embedding for keyword prompt '{keyword_prompt}'. Skipping keyword.")
            continue
        for page in range(1, 6):
            books = await search_kakao_books(keyword, page)
            if not books:
                break
            for book in books:
                isbn = book.get("isbn")
                if isbn and len(isbn.split()) > 1:
                    isbn = isbn.split()[1]
                else:
                    continue

                if should_skip_book(keyword, book):
                    print(f"Skipping '{book.get('title')}' due to heuristic exclusion rules.")
                    continue

                if await check_if_isbn_exists(db, isbn):
                    continue

                book_text = build_book_text(
                    book.get("title", ""),
                    book.get("contents", ""),
                    book.get("authors"),
                )
                book_embedding = await get_embedding(book_text)
                if not book_embedding:
                    continue

                similarity = cosine_similarity(keyword_embedding, book_embedding)
                processed_books_count += 1
                total_similarity += similarity

                passes_similarity = True
                if SIMILARITY_FILTER_ENABLED and similarity < SIMILARITY_THRESHOLD:
                    passes_similarity = False

                if passes_similarity:
                    new_book = BookCorpus(
                        title=book.get("title"),
                        contents=book.get("contents"),
                        isbn=isbn,
                        authors=format_authors(book.get("authors")),
                        publisher=book.get("publisher"),
                        thumbnail=book.get("thumbnail"),
                        keyword=keyword,
                        similarity_score=similarity,
                        embedding=book_embedding,
                    )
                    db.add(new_book)
                    total_saved_count += 1
                    print(
                        f"Saved book: {book.get('title')} (Similarity: {similarity:.4f}) "
                        f"[filter={'ON' if SIMILARITY_FILTER_ENABLED else 'OFF'}]"
                    )
                else:
                    print(f"Discarded book: {book.get('title')} (Similarity below threshold: {similarity:.4f})")
    await db.commit()
    average_similarity = (total_similarity / processed_books_count) if processed_books_count > 0 else 0
    return {
        "processed_keywords": len(keywords),
        "total_books_saved": total_saved_count,
        "average_similarity": average_similarity,
    }


async def embed_single_book(book_data: SingleBookRequest, db: AsyncSession):
    """Embeds a single book and saves it to the corpus if it doesn't exist."""
    print(f"Processing single book with ISBN: {book_data.isbn}")
    if await check_if_isbn_exists(db, book_data.isbn):
        print(f"Book with ISBN {book_data.isbn} already exists in corpus. Skipping.")
        return

    book_text = build_book_text(book_data.title, book_data.contents or "", book_data.authors)
    book_embedding = await get_embedding(book_text)
    if not book_embedding:
        print(f"Could not generate embedding for book: {book_data.title}. Skipping.")
        return
    new_corpus_entry = BookCorpus(
        title=book_data.title,
        contents=book_data.contents,
        isbn=book_data.isbn,
        authors=format_authors(book_data.authors),
        publisher=book_data.publisher,
        thumbnail=book_data.thumbnail,
        keyword="user_added",
        similarity_score=0.0,
        embedding=book_embedding,
    )
    db.add(new_corpus_entry)
    await db.commit()
    print(f"Successfully saved single book to corpus: {book_data.title}")


async def search_by_natural_language(query: str, db: AsyncSession):
    """Performs vector similarity search on the book_corpus table."""
    print(f"Performing AI search for query: {query}")

    # --- 1️⃣ 의도 분류 ---
    similar_keywords = ["같은", "비슷한"]
    mood_keywords = ["분위기", "느낌", "감성", "무드"]

    author_name = None
    author_match = AUTHOR_PATTERN.search(query)
    if author_match:
        author_name = author_match.group(1).strip()

    if author_name or any(k in query for k in AUTHOR_KEYWORDS):
        intent = "author"
    elif any(k in query for k in similar_keywords):
        intent = "similar"
    elif any(k in query for k in mood_keywords):
        intent = "mood"
    else:
        intent = "general"

    # --- 2️⃣ 프롬프트 리라이트 ---
    if intent == "author":
        subject = author_name if author_name else query.strip()
        subject = subject.strip(".,")
        query_text_for_embedding = (
            f"{subject} 작가가 쓴 대표적인 소설과 문학 작품을 추천해줘. "
            f"시험 대비 교재나 학습서는 제외하고 문학 작품을 알려줘."
        )
        current_threshold = AUTHOR_SEARCH_THRESHOLD

    elif intent == "similar":
        cleaned_query = (
            query.replace("같은 책", "")
            .replace("비슷한 책", "")
            .replace("추천해줘", "")
            .replace("찾아줘", "")
            .strip()
        )
        query_text_for_embedding = f"'{cleaned_query}'와 비슷한 주제와 분위기의 책을 찾아줘."
        current_threshold = AI_SIMILARITY_THRESHOLD

    elif intent == "mood":
        cleaned_query = (
            query.replace("추천해줘", "")
            .replace("찾아줘", "")
            .replace("책을", "")
            .replace("책", "")
            .strip()
        )
        query_text_for_embedding = f"'{cleaned_query}'와 같은 감정과 분위기의 책을 추천해줘."
        current_threshold = AI_SIMILARITY_THRESHOLD

    else:  # general
        query_text_for_embedding = (
            f"{query.strip()}와 관련된 책을 찾아줘. 시험 대비 교재는 제외하고 문학 작품을 우선 추천해줘."
        )
        current_threshold = AI_SIMILARITY_THRESHOLD

    print(f"[Intent: {intent}] Rewritten query: {query_text_for_embedding}")

    # --- 3️⃣ 쿼리 임베딩 생성 ---
    query_embedding = await get_embedding(query_text_for_embedding)
    if not query_embedding:
        raise HTTPException(status_code=500, detail="Could not generate embedding for the search query.")

    # --- 4️⃣ 벡터 유사도 검색 ---
    stmt = text(
        """
        SELECT id, title, contents, isbn, authors, publisher, thumbnail,
               1 - (embedding <=> :query_embedding) AS similarity
        FROM book_corpus
        WHERE 1 - (embedding <=> :query_embedding) > :threshold
        ORDER BY similarity DESC
        LIMIT :limit
    """
    )
    result = await db.execute(
        stmt,
        {
            "query_embedding": str(list(query_embedding)),
            "threshold": current_threshold,
            "limit": AI_SEARCH_LIMIT,
        },
    )

    # --- 5️⃣ 결과 반환 ---
    raw_results = [dict(row) for row in result.mappings()]

    filtered = []
    filtered_out_count = 0
    for row in raw_results:
        title = row.get("title", "")
        contents = row.get("contents", "")
        authors = row.get("authors", "")
        if contains_exclusion_terms(title, contents, authors):
            filtered_out_count += 1
            continue
        filtered.append(row)

    if author_name:
        exact_matches = []
        fuzzy_matches = []
        normalized_author = author_name.replace(" ", "")
        for row in filtered:
            authors = (row.get("authors") or "").replace(" ", "")
            if normalized_author and normalized_author in authors:
                exact_matches.append(row)
            else:
                fuzzy_matches.append(row)
        filtered = exact_matches + fuzzy_matches

    if filtered_out_count:
        print(
            f"[NOISE FILTER] Removed {filtered_out_count} items likely to be exam/prep materials "
            f"for query '{query}'."
        )
    if author_name:
        print(
            f"[AUTHOR RERANK] Prioritized {len(exact_matches)} exact author matches for '{author_name}'."
        )

    search_results = filtered[:AI_SEARCH_RESULT_LIMIT]

    if author_name and len(search_results) < AI_SEARCH_RESULT_LIMIT:
        remaining = AI_SEARCH_RESULT_LIMIT - len(search_results)
        fallback_stmt = text(
            """
            SELECT id, title, contents, isbn, authors, publisher, thumbnail,
                   0.0 AS similarity
            FROM book_corpus
            WHERE REPLACE(authors, ' ', '') ILIKE :author_pattern
            ORDER BY created_at DESC
            LIMIT :limit
        """
        )
        fallback_rows = await db.execute(
            fallback_stmt,
            {
                "author_pattern": f"%{author_name.replace(' ', '')}%",
                "limit": remaining,
            },
        )
        seen_isbns = {row.get("isbn") for row in search_results if row.get("isbn")}
        fallback_results = []
        for row in fallback_rows.mappings():
            row_dict = dict(row)
            isbn = row_dict.get("isbn")
            if isbn and isbn in seen_isbns:
                continue
            seen_isbns.add(isbn)
            fallback_results.append(row_dict)
        if fallback_results:
            print(
                f"[AUTHOR FALLBACK] Added {len(fallback_results)} direct author matches "
                f"to complement semantic search for '{author_name}'."
            )
            search_results.extend(fallback_results)
            search_results = search_results[:AI_SEARCH_RESULT_LIMIT]

    print(
        f"[{intent.upper()}] Returning {len(search_results)} results for query: '{query}' "
        f"(limited to top {AI_SEARCH_RESULT_LIMIT})"
    )
    for i, r in enumerate(search_results[:3], 1):
        print(f"{i}. {r.get('title')} (sim: {r.get('similarity'):.3f})")

    return search_results
