import asyncio
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List

import numpy as np
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text

logger = logging.getLogger(__name__)

from app.models.book_corpus import BookCorpus
from app.services.gemini_tagger import GeminiTagger
from app.services.intent_classifier import IntentAnalyzer
from app.services.keyword_expander import KeywordExpander
from app.services.prompt_templates import PromptTemplateBuilder
from app.services.reference_search import find_reference_anchor, has_theme_evidence, is_verified_similar_fallback
from app.services.reranker import rerank_with_gemini
from app.services.search_retrieval import retrieve_candidates
from app.services.text_utils import is_school_anthology, is_search_candidate

# --- Configuration ---
# prod 환경 검증은 lifespan의 validate_prod_config()가 담당
AI_SEARCH_RESULT_LIMIT = int(os.getenv("AI_SEARCH_RESULT_LIMIT", "5"))
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "jhgan/ko-sroberta-multitask")
HYBRID_KEYWORD_LIMIT = int(os.getenv("HYBRID_KEYWORD_LIMIT", "15"))
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", "gemini-3.5-flash-lite")

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

def _limit_keywords(keywords: List[str]) -> List[str]:
    if not keywords:
        return []
    return keywords[:HYBRID_KEYWORD_LIMIT]


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


_ANTHOLOGY_REQUEST_TERMS = ("선집", "모음집", "앤솔로지", "중고생", "필독서", "교과서")


def _prefer_general_novels(books: list[dict], intent) -> list[dict]:
    """Keep school anthologies available, but rank other novels first for broad requests."""
    if intent.query_type != "general" or intent.genre != "소설" or any(
        term in intent.raw_query for term in _ANTHOLOGY_REQUEST_TERMS
    ):
        return books
    return sorted(books, key=is_school_anthology)


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


async def search_by_natural_language(
    query: str, db: AsyncSession, request_id: str | None = None, outcome: dict | None = None,
    diagnostics: dict | None = None,
):
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
            if outcome is not None:
                outcome.update(status="NO_MATCH", reason_code="NO_REFERENCE")
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
        if is_search_candidate(book, intent.genre, intent.domain, intent.requested_form, intent.constraints)
    ]
    if reference and reference.theme_keywords:
        filtered = [book for book in filtered if has_theme_evidence(book, reference.theme_keywords)]
    filtered = _deduplicate_results(filtered)
    filtered = _prefer_general_novels(filtered, intent)
    if diagnostics is not None:
        diagnostics["retrieved_isbns"] = [book["isbn"] for book in candidates]
        diagnostics["filtered_isbns"] = [book["isbn"] for book in filtered]
    verified_fallback = (
        [book for book in filtered if is_verified_similar_fallback(book, reference)]
        if reference else None
    )
    retrieval_ms = (time.perf_counter() - started) * 1000 - intent_ms - embed_ms
    rerank_query = query
    if reference:
        rerank_query += f" 기준 작품: {', '.join(reference.titles[:3])}. 핵심 주제: {', '.join(reference.theme_keywords[:5])}. 다른 작가의 책 중에서 골라줘."
    rerank_kwargs = {"request_id": request_id, "genre": intent.genre,
                     "outcome": outcome, "verified_fallback": verified_fallback}
    if diagnostics is not None:
        rerank_kwargs["diagnostics"] = diagnostics
    results = (await rerank_with_gemini(
        rerank_query, filtered, intent.requested_form, **rerank_kwargs,
    ))[:AI_SEARCH_RESULT_LIMIT]
    if outcome is not None and reference and outcome.get("status") == "FALLBACK":
        outcome["basis"] = "SHARED_THEMES"
    results = _prefer_general_novels(results, intent)
    if diagnostics is not None:
        diagnostics["result_isbns"] = [book["isbn"] for book in results]

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
