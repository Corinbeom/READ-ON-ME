import asyncio
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Union

import httpx
import numpy as np
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.future import select
from sqlalchemy.sql import text

import app.database as _db

logger = logging.getLogger(__name__)

from app.models.book_corpus import BookCorpus
from app.schemas import SingleBookRequest
from app.services.book_classifier import BookClassifier
from app.services.gemini_tagger import GeminiTagger
from app.services.intent_classifier import IntentAnalyzer
from app.services.keyword_expander import KeywordExpander
from app.services.prompt_templates import PromptTemplateBuilder
from app.services.reference_search import find_reference_anchor, has_theme_evidence
from app.services.reranker import rerank_with_gemini
from app.services.search_retrieval import retrieve_candidates
from app.services.tagging_jobs import enqueue_tagging_jobs
from app.services.text_utils import (
    build_book_text,
    build_keyword_prompt,
    contains_exclusion_terms,
    format_authors,
    get_proxy_search_terms,
    is_genre_match,
    is_search_candidate,
    should_skip_book,
)

# --- Configuration ---
# prod 환경 검증은 lifespan의 validate_prod_config()가 담당
KAKAO_API_KEY = os.getenv("KAKAO_API_KEY", "")

KAKAO_API_URL = "https://dapi.kakao.com/v3/search/book"
SIMILARITY_THRESHOLD = 0.65
AI_SEARCH_RESULT_LIMIT = int(os.getenv("AI_SEARCH_RESULT_LIMIT", "5"))
SIMILARITY_FILTER_ENABLED = os.getenv("SIMILARITY_FILTER_ENABLED", "true").lower() == "true"
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "jhgan/ko-sroberta-multitask")
HYBRID_KEYWORD_LIMIT = int(os.getenv("HYBRID_KEYWORD_LIMIT", "15"))
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", "gemini-3.5-flash-lite")
GEMINI_DETAILED_MODEL = os.getenv("GEMINI_DETAILED_MODEL", "gemini-3.5-flash-lite")

embedding_model = None
_embedding_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="book-embedding")


def _load_embedding_model() -> None:
    global embedding_model
    from sentence_transformers import SentenceTransformer
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Loading embedding model=%s device=%s", EMBEDDING_MODEL_NAME, device)
    embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME, device=device)


async def init_embedding_model() -> None:
    await asyncio.get_running_loop().run_in_executor(_embedding_executor, _load_embedding_model)


def shutdown_embedding_model() -> None:
    _embedding_executor.shutdown(wait=False, cancel_futures=True)

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




# --- Service Functions ---


async def get_embedding(text: str):
    """Generates embedding for a given text using Hugging Face SentenceTransformer."""
    try:
        if embedding_model is None:
            raise RuntimeError("Embedding model is not ready")
        embedding = await asyncio.get_running_loop().run_in_executor(
            _embedding_executor,
            lambda: embedding_model.encode(text, convert_to_numpy=True),
        )
        return embedding.tolist()
    except Exception as exc:
        logger.error("Embedding failed error=%s", type(exc).__name__)
        return None


KAKAO_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=3.0, pool=3.0)


async def search_kakao_books(keyword: str, page: int):
    """Searches for books using Kakao API."""
    headers = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}
    params = {"query": keyword, "page": page, "size": 10}
    async with httpx.AsyncClient(timeout=KAKAO_TIMEOUT) as client:
        try:
            response = await client.get(KAKAO_API_URL, headers=headers, params=params)
            response.raise_for_status()
            return response.json()["documents"]
        except httpx.HTTPStatusError as e:
            logger.warning("Kakao API HTTP error [keyword=%s, page=%s]: %s", keyword, page, e)
            return []
        except httpx.TimeoutException as e:
            print(f"Kakao API timeout [keyword={keyword}, page={page}]: {e}")
            return []
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


# --- Deduplication Helpers ---

_EDITION_RE = re.compile(
    r'[\(\[\{][^\)\]\}]*[\)\]\}]'                                        # 괄호 내 내용
    r'|(?:개정판|증보판|초판본?|리커버|특별판|한정판|양장본|문고판'       # 한국어 에디션
    r'|revised|edition|classics|signet|penguin|reprint)',                 # 영문 에디션
    re.IGNORECASE,
)
_WHITESPACE_RE = re.compile(r'[\s\-·\/]+')
_AUTHOR_SUFFIX_RE = re.compile(r'\s*(지음|저|역|옮김|글|그림|편)\s*')


def _normalize_title(title: str) -> str:
    """에디션 표기 제거 후 소문자 정규화."""
    t = _EDITION_RE.sub('', title or '')
    t = _WHITESPACE_RE.sub(' ', t).strip().lower()
    return t


def _normalize_first_author(authors: str) -> str:
    """첫 번째 저자만 추출, 역할 표기 제거, 공백 제거."""
    if not authors:
        return ''
    first = re.split(r'[,/·]', authors)[0]
    first = _AUTHOR_SUFFIX_RE.sub('', first)
    return first.strip().lower().replace(' ', '')


def _deduplicate_results(results: list) -> list:
    """
    (정규화 제목, 정규화 첫 저자) 기준으로 중복 제거.
    같은 그룹 내에서 similarity가 가장 높은 것만 유지.
    """
    seen: dict = {}
    for row in results:
        key = (
            _normalize_title(row.get('title', '')),
            _normalize_first_author(row.get('authors', '')),
        )
        existing = seen.get(key)
        if existing is None or (row.get('retrieval_score') or 0) > (existing.get('retrieval_score') or 0):
            seen[key] = row
    return sorted(seen.values(), key=lambda row: (-(row.get("retrieval_score") or 0), row.get("isbn") or ""))


async def check_if_similar_in_corpus(db: AsyncSession, title: str, authors: str) -> bool:
    """
    같은 저작의 다른 에디션이 corpus에 이미 있는지 확인.
    (정규화 제목 + 첫 저자)가 일치하는 항목이 있으면 True.
    """
    norm_title = _normalize_title(title)
    if not norm_title:
        return False

    first_author = re.split(r'[,/·]', authors or '')[0].strip()
    first_author_prefix = first_author[:12]  # 성명 앞 12자로 필터

    if first_author_prefix:
        stmt = text(
            "SELECT title FROM book_corpus WHERE authors ILIKE :author LIMIT 200"
        )
        result = await db.execute(stmt, {"author": f"%{first_author_prefix}%"})
    else:
        stmt = text("SELECT title FROM book_corpus LIMIT 500")
        result = await db.execute(stmt)

    for row in result.fetchall():
        if _normalize_title(row.title) == norm_title:
            return True
    return False


async def find_similar_corpus_edition(db: AsyncSession, title: str, authors: str) -> BookCorpus | None:
    norm_title = _normalize_title(title)
    norm_author = _normalize_first_author(authors)
    if not norm_title or not norm_author:
        return None
    first_author = re.split(r'[,/·]', authors)[0].strip()
    statement = text("""
        SELECT id, title, authors FROM book_corpus
        WHERE authors ILIKE :author
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT 200
    """)
    rows = (await db.execute(statement, {"author": f"%{first_author[:12]}%"})).fetchall()
    for row in rows:
        if _normalize_title(row.title) == norm_title and _normalize_first_author(row.authors) == norm_author:
            return await db.get(BookCorpus, row.id)
    return None


# --- Main Orchestrators & Search ---


async def process_keywords(keywords: list[str]):
    """The main function to orchestrate the data building process."""
    async with _db.async_session() as db:
        await _process_keywords_with_db(keywords, db)


async def _process_keywords_with_db(keywords: list[str], db: AsyncSession):
    total_saved_count = 0
    total_similarity = 0
    processed_books_count = 0

    for keyword in keywords:
        proxy_terms = get_proxy_search_terms(keyword)
        print(
            f"Processing keyword: '{keyword}' → proxy terms: {proxy_terms} "
            f"(filter={'ON' if SIMILARITY_FILTER_ENABLED else 'OFF'})"
        )

        # 임베딩 유사도 비교 기준은 원본 장르 키워드 기반으로 생성
        keyword_prompt = build_keyword_prompt(keyword)
        keyword_embedding = await get_embedding(keyword_prompt)
        if not keyword_embedding:
            print(f"Could not generate embedding for keyword prompt '{keyword_prompt}'. Skipping keyword.")
            continue

        for proxy_term in proxy_terms:
            for page in range(1, 6):
                books = await search_kakao_books(proxy_term, page)
                if not books:
                    break

                for book in books:
                    isbn = book.get("isbn")
                    if isbn and len(isbn.split()) > 1:
                        isbn = isbn.split()[1]
                    elif not isbn or len(isbn.split()) != 1 or len(isbn) != 13 or not isbn.isdigit():
                        continue

                    if should_skip_book(keyword, book):
                        print(f"Skipping '{book.get('title')}' due to heuristic exclusion rules.")
                        continue

                    if await check_if_isbn_exists(db, isbn):
                        await db.rollback()
                        continue

                    if await check_if_similar_in_corpus(db, book.get("title", ""), format_authors(book.get("authors"))):
                        print(f"[DEDUP] Skipping duplicate edition: '{book.get('title')}'")
                        await db.rollback()
                        continue
                    await db.rollback()

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
                    # 장르 검증: Gemini 분류 결과가 목표 장르와 불일치하면 제외
                    if not is_genre_match(keyword, classification.primary_keyword):
                        print(
                            f"Genre mismatch: '{book.get('title')}' classified as "
                            f"'{classification.primary_keyword}', expected '{keyword}'. Skipping."
                        )
                        continue

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
                        try:
                            await db.flush()
                            if not classification.used_llm:
                                await enqueue_tagging_jobs(db, [isbn], commit=False)
                            await db.commit()
                        except IntegrityError:
                            await db.rollback()
                            logger.info("Skipped concurrent duplicate corpus ISBN")
                            continue
                        total_saved_count += 1
                        print(
                            f"Saved book: {book.get('title')} (Similarity: {similarity:.4f}) "
                            f"[filter={'ON' if SIMILARITY_FILTER_ENABLED else 'OFF'}]"
                        )
                    else:
                        print(f"Discarded book: {book.get('title')} (Similarity below threshold: {similarity:.4f})")

    average_similarity = (total_similarity / processed_books_count) if processed_books_count > 0 else 0
    return {
        "processed_keywords": len(keywords),
        "total_books_saved": total_saved_count,
        "average_similarity": average_similarity,
    }


async def embed_single_book(book_data: SingleBookRequest):
    """Return only after the book is persisted or a duplicate is confirmed."""
    async with _db.async_session() as db:
        return await _embed_single_book_with_db(book_data, db)


async def _embed_single_book_with_db(book_data: SingleBookRequest, db: AsyncSession):
    print(f"Processing single book with ISBN: {book_data.isbn}")
    if await check_if_isbn_exists(db, book_data.isbn):
        print(f"Book with ISBN {book_data.isbn} already exists in corpus. Skipping.")
        return "already_exists"

    similar = await find_similar_corpus_edition(db, book_data.title, format_authors(book_data.authors))
    if similar:
        db.add(BookCorpus(
            title=book_data.title,
            contents=book_data.contents,
            isbn=book_data.isbn,
            authors=format_authors(book_data.authors),
            publisher=book_data.publisher,
            thumbnail=book_data.thumbnail,
            keyword=similar.keyword,
            similarity_score=similar.similarity_score,
            embedding=similar.embedding,
            tags=list(similar.tags) if isinstance(similar.tags, list) else [],
        ))
        await db.commit()
        return "reused_edition"

    book_text = build_book_text(book_data.title, book_data.contents or "", book_data.authors)
    book_embedding = await get_embedding(book_text)
    if not book_embedding:
        raise HTTPException(status_code=503, detail="Book embedding is unavailable")
    classification = await book_classifier_detailed.classify(
        book_data.title,
        book_data.contents or "",
        format_authors(book_data.authors),
    )
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
    await db.flush()
    if not classification.used_llm:
        await enqueue_tagging_jobs(db, [book_data.isbn], commit=False)
    await db.commit()
    print(f"Successfully saved single book to corpus: {book_data.title}")
    return "saved"


async def search_by_natural_language(query: str, db: AsyncSession, request_id: str | None = None):
    """Retrieve bounded candidates, enforce explicit constraints, then rank up to five books."""
    started = time.perf_counter()
    intent = await intent_analyzer.analyze(query)
    keywords = _limit_keywords(await keyword_expander.expand(intent))
    intent_ms = (time.perf_counter() - started) * 1000
    reference = None
    if intent.query_type == "author_similar" and intent.reference_author:
        reference = await find_reference_anchor(db, intent.reference_author)
        if reference is None:
            logger.info("search_no_reference type=author_similar")
            return []
        query_embedding = reference.embedding
        keywords = _limit_keywords([*reference.theme_keywords, *keywords])
    else:
        query_embedding = await get_embedding(prompt_builder.build(intent, query))
    if not query_embedding:
        raise HTTPException(status_code=503, detail="Search embedding is unavailable")

    embed_ms = (time.perf_counter() - started) * 1000 - intent_ms
    candidates, counts = await retrieve_candidates(
        db, query_embedding, intent, keywords,
        exclude_author=reference.author if reference else None,
    )
    filtered = [
        book for book in candidates
        if is_search_candidate(book, intent.genre, intent.domain, intent.requested_form)
    ]
    if reference and reference.theme_keywords:
        filtered = [book for book in filtered if has_theme_evidence(book, reference.theme_keywords)]
    filtered = _deduplicate_results(filtered)
    retrieval_ms = (time.perf_counter() - started) * 1000 - intent_ms - embed_ms
    rerank_query = query
    if reference:
        rerank_query += f" 기준 작품: {', '.join(reference.titles[:3])}. 핵심 주제: {', '.join(reference.theme_keywords[:5])}. 다른 작가의 책 중에서 골라줘."
    results = (await rerank_with_gemini(rerank_query, filtered, intent.requested_form))[:AI_SEARCH_RESULT_LIMIT]

    elapsed_ms = (time.perf_counter() - started) * 1000
    rerank_ms = elapsed_ms - intent_ms - embed_ms - retrieval_ms
    logger.info(
        "search_completed request_id=%s type=%s form=%s vector=%d keyword=%d title=%d author=%d merged=%d filtered=%d returned=%d intent_ms=%.1f embed_ms=%.1f retrieval_ms=%.1f rerank_ms=%.1f latency_ms=%.1f",
        (request_id or "-")[:64], intent.query_type, intent.requested_form, counts.vector, counts.keyword, counts.title, counts.author,
        counts.merged, len(filtered), len(results), intent_ms, embed_ms, retrieval_ms, rerank_ms, elapsed_ms,
    )
    if not results:
        logger.warning(
            "search_empty type=%s vector=%d keyword=%d title=%d author=%d merged=%d filtered=%d",
            intent.query_type, counts.vector, counts.keyword, counts.title, counts.author,
            counts.merged, len(filtered),
        )
    return results
