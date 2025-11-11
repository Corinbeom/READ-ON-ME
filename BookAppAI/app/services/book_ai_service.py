import os
from typing import List, Optional, Union

import httpx
import numpy as np
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import text

from app.models.book_corpus import BookCorpus
from app.schemas import SingleBookRequest
from app.services.book_classifier import BookClassifier
from app.services.gemini_tagger import GeminiTagger
from app.services.intent_classifier import IntentAnalyzer, IntentMetadata
from app.services.keyword_expander import KeywordExpander
from app.services.prompt_templates import PromptTemplateBuilder

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
AI_SEARCH_LIMIT = int(os.getenv("AI_SEARCH_LIMIT", "40"))
AI_SEARCH_RESULT_LIMIT = int(os.getenv("AI_SEARCH_RESULT_LIMIT", "5"))
AUTHOR_SEARCH_THRESHOLD = float(os.getenv("AUTHOR_SEARCH_THRESHOLD", "0.5"))
SIMILARITY_FILTER_ENABLED = os.getenv("SIMILARITY_FILTER_ENABLED", "true").lower() == "true"
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "jhgan/ko-sroberta-multitask")
HYBRID_KEYWORD_LIMIT = int(os.getenv("HYBRID_KEYWORD_LIMIT", "15"))
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", "gemini-2.0-flash-lite")
GEMINI_DETAILED_MODEL = os.getenv("GEMINI_DETAILED_MODEL", "gemini-2.5-flash")
RETAG_TRIGGER_SIZE = int(os.getenv("RETAG_TRIGGER_SIZE", "1"))

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


# --- Hugging Face Model Loading ---
# Check if GPU is available and use it, otherwise use CPU
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")
print(f"Loading embedding model: {EMBEDDING_MODEL_NAME}")
embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME, device=device)

intent_analyzer = IntentAnalyzer()
keyword_expander = KeywordExpander()
prompt_builder = PromptTemplateBuilder()
gemini_tagger_fast = GeminiTagger(model_name=GEMINI_FAST_MODEL)
gemini_tagger_detailed = GeminiTagger(model_name=GEMINI_DETAILED_MODEL)
book_classifier_fast = BookClassifier(intent_analyzer=intent_analyzer, llm_tagger=gemini_tagger_fast)
book_classifier_detailed = BookClassifier(
    intent_analyzer=intent_analyzer,
    llm_tagger=gemini_tagger_detailed,
)

FAILED_TAGGING_REGISTRY: set[str] = set()
RETAG_IN_PROGRESS = False


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


def _resolve_similarity_threshold(intent: IntentMetadata) -> float:
    if intent.query_type == "author":
        return AUTHOR_SEARCH_THRESHOLD
    if intent.query_type in {"similar", "mood"}:
        return AI_SIMILARITY_THRESHOLD
    return AI_SEARCH_THRESHOLD


def _limit_keywords(keywords: List[str]) -> List[str]:
    if not keywords:
        return []
    return keywords[:HYBRID_KEYWORD_LIMIT]


def _merge_tags(primary_label: Optional[str], classification_tags: List[str], fallback: Optional[str] = None) -> tuple[str, List[str]]:
    keyword_value = primary_label or fallback or "user_added"
    tags = list(classification_tags) if classification_tags else []
    if keyword_value and keyword_value not in tags:
        tags.insert(0, keyword_value)
    if fallback and fallback not in tags:
        tags.append(fallback)
    return keyword_value, tags


def record_tagging_fallback(identifier: Optional[str], source: str) -> None:
    if not identifier:
        return
    if identifier in FAILED_TAGGING_REGISTRY:
        return
    FAILED_TAGGING_REGISTRY.add(identifier)
    print(f"[TAGGING FALLBACK] {identifier} tagged via {source}. Added to retry registry.")
    if len(FAILED_TAGGING_REGISTRY) >= RETAG_TRIGGER_SIZE:
        print(f"[TAGGING RETRY] Trigger size reached ({len(FAILED_TAGGING_REGISTRY)}). Kicking off re-tag.")
        try:
            import anyio

            anyio.from_thread.run(retry_failed_taggings)
        except RuntimeError:
            # Already in async context; schedule directly.
            import asyncio

            asyncio.create_task(retry_failed_taggings())
        except Exception as exc:
            print(f"[TAGGING RETRY] Failed to launch re-tag job: {exc}")


async def retry_failed_taggings():
    """Attempt to reprocess books that fell back to rule-based tagging."""
    global RETAG_IN_PROGRESS
    if RETAG_IN_PROGRESS or not FAILED_TAGGING_REGISTRY:
        return

    RETAG_IN_PROGRESS = True
    retry_targets = list(FAILED_TAGGING_REGISTRY)
    FAILED_TAGGING_REGISTRY.clear()
    print(f"[TAGGING RETRY] Retagging {len(retry_targets)} books with detailed model.")

    from app.database import async_session
    from sqlalchemy import select

    async with async_session() as session:
        for isbn in retry_targets:
            try:
                result = await session.execute(select(BookCorpus).where(BookCorpus.isbn == isbn))
                book = result.scalars().first()
                if not book:
                    continue
                classification = await book_classifier_detailed.classify(
                    book.title or "",
                    book.contents or "",
                    book.authors or "",
                )
                keyword_value, tags = _merge_tags(classification.primary_keyword, classification.tags)
                book.keyword = keyword_value
                book.tags = tags
                session.add(book)
                print(f"[TAGGING RETRY] Updated {isbn} -> {keyword_value}")
            except Exception as exc:
                print(f"[TAGGING RETRY] Failed to retag ISBN {isbn}: {exc}")
        await session.commit()

    RETAG_IN_PROGRESS = False


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
                classification = await book_classifier_fast.classify(
                    book.get("title", ""),
                    book.get("contents", ""),
                    format_authors(book.get("authors")),
                )
                if not classification.used_llm:
                    record_tagging_fallback(isbn, "fast_tagger_fallback")
                resolved_keyword, tags = _merge_tags(
                    classification.primary_keyword,
                    classification.tags,
                    fallback=keyword,
                )

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
                        keyword=resolved_keyword,
                        similarity_score=similarity,
                        embedding=book_embedding,
                        tags=tags,
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
    classification = await book_classifier_detailed.classify(
        book_data.title,
        book_data.contents or "",
        format_authors(book_data.authors),
    )
    if not classification.used_llm:
        record_tagging_fallback(book_data.isbn, "detailed_tagger_fallback")
    keyword_value, tags = _merge_tags(classification.primary_keyword, classification.tags)
    new_corpus_entry = BookCorpus(
        title=book_data.title,
        contents=book_data.contents,
        isbn=book_data.isbn,
        authors=format_authors(book_data.authors),
        publisher=book_data.publisher,
        thumbnail=book_data.thumbnail,
        keyword=keyword_value,
        similarity_score=0.0,
        embedding=book_embedding,
        tags=tags,
    )
    db.add(new_corpus_entry)
    await db.commit()
    print(f"Successfully saved single book to corpus: {book_data.title}")


async def search_by_natural_language(query: str, db: AsyncSession):
    """Performs vector + hybrid keyword search with intent-aware prompts."""
    print(f"Performing AI search for query: {query}")

    intent = await intent_analyzer.analyze(query)
    expanded_keywords = await keyword_expander.expand(intent)
    hybrid_keywords = _limit_keywords(expanded_keywords)
    prompt_text = prompt_builder.build(intent, query)
    current_threshold = _resolve_similarity_threshold(intent)

    print(f"[Intent] {intent}")
    print(f"[Prompt] {prompt_text}")
    if hybrid_keywords:
        print(f"[Hybrid keywords] {hybrid_keywords}")

    query_embedding = await get_embedding(prompt_text)
    if not query_embedding:
        raise HTTPException(status_code=500, detail="Could not generate embedding for the search query.")

    keyword_clause = " OR keyword = ANY(:keyword_list)" if hybrid_keywords else ""
    base_query = f"""
        SELECT id, title, contents, isbn, authors, publisher, thumbnail,
               1 - (embedding <=> :query_embedding) AS similarity
        FROM book_corpus
        WHERE (1 - (embedding <=> :query_embedding) > :threshold)
        {keyword_clause}
        ORDER BY similarity DESC
        LIMIT :limit
    """
    params = {
        "query_embedding": str(list(query_embedding)),
        "threshold": current_threshold,
        "limit": AI_SEARCH_LIMIT,
    }
    if hybrid_keywords:
        params["keyword_list"] = hybrid_keywords
    stmt = text(base_query)
    result = await db.execute(stmt, params)

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

    if intent.focus_author:
        exact_matches = []
        fuzzy_matches = []
        normalized_author = intent.focus_author.replace(" ", "")
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
    if intent.focus_author:
        print(
            f"[AUTHOR RERANK] Prioritized {len(exact_matches)} exact author matches for '{intent.focus_author}'."
        )

    search_results = filtered[:AI_SEARCH_RESULT_LIMIT]

    if intent.focus_author and len(search_results) < AI_SEARCH_RESULT_LIMIT:
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
                "author_pattern": f"%{intent.focus_author.replace(' ', '')}%",
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
                f"to complement semantic search for '{intent.focus_author}'."
            )
            search_results.extend(fallback_results)
            search_results = search_results[:AI_SEARCH_RESULT_LIMIT]

    print(
        f"[{intent.query_type.upper()}] Returning {len(search_results)} results for query: '{query}' "
        f"(limited to top {AI_SEARCH_RESULT_LIMIT})"
    )
    for i, r in enumerate(search_results[:3], 1):
        similarity = r.get("similarity")
        similarity_text = f"{similarity:.3f}" if similarity is not None else "N/A"
        print(f"{i}. {r.get('title')} (sim: {similarity_text})")

    return search_results
