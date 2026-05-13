"""
Content-based 개인화 추천 서비스.

유저가 읽은 책들의 임베딩을 가중 평균하여 '유저 취향 벡터'를 만들고,
pgvector로 유사한 책을 탐색한다.

가중치 기준:
  COMPLETED → 1.0  (완독 = 강한 선호 신호)
  READING   → 0.8  (읽는 중 = 중간 신호)
  TO_READ   → 0.3  (읽고 싶음 = 약한 신호)
"""

from __future__ import annotations

import json
import numpy as np
from typing import List, Optional, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text

from app.schemas import UserBookEntry

STATUS_WEIGHTS: dict[str, float] = {
    "COMPLETED": 1.0,
    "READING": 0.8,
    "TO_READ": 0.3,
}


async def build_user_profile_vector(
    user_books: List[UserBookEntry],
    db: AsyncSession,
) -> Optional[np.ndarray]:
    """
    유저 독서 목록에서 취향 벡터(768-dim)를 생성한다.
    book_corpus에 없는 책은 스킵. 매칭 0건이면 None 반환.
    """
    if not user_books:
        return None

    isbns = [b.isbn for b in user_books]
    isbn_to_weight = {b.isbn: STATUS_WEIGHTS.get(b.status, 0.3) for b in user_books}

    result = await db.execute(
        text("SELECT isbn, embedding FROM book_corpus WHERE isbn = ANY(:isbns)"),
        {"isbns": isbns},
    )
    rows = result.fetchall()

    if not rows:
        return None

    weighted_vecs: list[np.ndarray] = []
    total_weight = 0.0

    for row in rows:
        weight = isbn_to_weight.get(row.isbn, 0.3)
        raw = row.embedding
        # raw SQL로 조회 시 pgvector가 문자열로 반환하는 경우 파싱
        if isinstance(raw, str):
            raw = json.loads(raw)
        vec = np.array(raw, dtype=np.float32)
        weighted_vecs.append(vec * weight)
        total_weight += weight

    if total_weight == 0:
        return None

    profile_vec = np.sum(weighted_vecs, axis=0) / total_weight
    norm = np.linalg.norm(profile_vec)
    if norm > 0:
        profile_vec = profile_vec / norm

    return profile_vec


async def content_based_recommend(
    user_books: List[UserBookEntry],
    db: AsyncSession,
    limit: int = 10,
) -> List[str]:
    """
    유저 취향 벡터와 코사인 유사도로 추천 ISBN 목록을 반환한다.
    유저가 이미 보유한 책은 자동으로 제외된다.
    """
    profile_vec = await build_user_profile_vector(user_books, db)
    if profile_vec is None:
        return []

    exclude_isbns: Set[str] = {b.isbn for b in user_books}
    vec_str = str(profile_vec.tolist())

    if exclude_isbns:
        sql = text("""
            SELECT isbn,
                   1 - (embedding <=> :profile_vec) AS score
            FROM book_corpus
            WHERE isbn != ALL(:excludes)
            ORDER BY embedding <=> :profile_vec
            LIMIT :limit
        """)
        params = {
            "profile_vec": vec_str,
            "excludes": list(exclude_isbns),
            "limit": limit,
        }
    else:
        sql = text("""
            SELECT isbn,
                   1 - (embedding <=> :profile_vec) AS score
            FROM book_corpus
            ORDER BY embedding <=> :profile_vec
            LIMIT :limit
        """)
        params = {
            "profile_vec": vec_str,
            "limit": limit,
        }

    result = await db.execute(sql, params)
    rows = result.fetchall()

    return [row.isbn for row in rows]
