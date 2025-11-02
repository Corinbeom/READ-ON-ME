
import os
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
AI_SIMILARITY_THRESHOLD = 0.55 # New threshold for general similarity queries
AI_SEARCH_LIMIT = 20

# --- Hugging Face Model Loading ---
# Check if GPU is available and use it, otherwise use CPU
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")
embedding_model = SentenceTransformer('jhgan/ko-sroberta-multitask', device=device)

# --- Service Functions ---

async def get_embedding(text: str):
    """Generates embedding for a given text using Hugging Face SentenceTransformer."""
    try:
        # SentenceTransformer's encode method returns numpy array by default
        embedding = embedding_model.encode(text, convert_to_numpy=True)
        return embedding.tolist() # Convert to list for pgvector compatibility
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
            return response.json()['documents']
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
        print(f"Processing keyword: {keyword}")
        keyword_embedding = await get_embedding(f"This book is a {keyword} genre book.")
        if not keyword_embedding:
            print(f"Could not generate embedding for keyword: {keyword}. Skipping.")
            continue
        for page in range(1, 6):
            books = await search_kakao_books(keyword, page)
            if not books:
                break
            for book in books:
                isbn = book.get('isbn')
                if isbn and len(isbn.split()) > 1:
                    isbn = isbn.split()[1]
                else:
                    continue
                if await check_if_isbn_exists(db, isbn):
                    continue

                book_text = f"이 책은 {book.get('authors', '')} 작가가 쓴 책입니다. 제목: {book.get('title', '')}. 내용: {book.get('contents', '')}"
                book_embedding = await get_embedding(book_text)
                if not book_embedding:
                    continue
                similarity = cosine_similarity(keyword_embedding, book_embedding)
                processed_books_count += 1
                total_similarity += similarity
                if similarity >= SIMILARITY_THRESHOLD:
                    new_book = BookCorpus(
                        title=book.get('title'),
                        contents=book.get('contents'),
                        isbn=isbn,
                        authors=", ".join(book.get('authors', [])),
                        publisher=book.get('publisher'),
                        thumbnail=book.get('thumbnail'),
                        keyword=keyword,
                        similarity_score=similarity,
                        embedding=book_embedding
                    )
                    db.add(new_book)
                    total_saved_count += 1
                    print(f"Saved book: {book.get('title')} (Similarity: {similarity:.4f})")
    await db.commit()
    average_similarity = (total_similarity / processed_books_count) if processed_books_count > 0 else 0
    return {
        "processed_keywords": len(keywords),
        "total_books_saved": total_saved_count,
        "average_similarity": average_similarity
    }

async def embed_single_book(book_data: SingleBookRequest, db: AsyncSession):
    """Embeds a single book and saves it to the corpus if it doesn't exist."""
    print(f"Processing single book with ISBN: {book_data.isbn}")
    book_text = f"이 책은 {book_data.authors} 작가가 쓴 책입니다. 제목: {book_data.title}. 내용: {book_data.contents}"
    if await check_if_isbn_exists(db, book_data.isbn):
        print(f"Book with ISBN {book_data.isbn} already exists in corpus. Skipping.")
        return
    book_embedding = await get_embedding(book_text)
    if not book_embedding:
        print(f"Could not generate embedding for book: {book_data.title}. Skipping.")
        return
    new_corpus_entry = BookCorpus(
        title=book_data.title,
        contents=book_data.contents,
        isbn=book_data.isbn,
        authors=", ".join(book_data.authors) if book_data.authors else "",
        publisher=book_data.publisher,
        thumbnail=book_data.thumbnail,
        keyword="user_added",
        similarity_score=0.0,
        embedding=book_embedding
    )
    db.add(new_corpus_entry)
    await db.commit()
    print(f"Successfully saved single book to corpus: {book_data.title}")

async def search_by_natural_language(query: str, db: AsyncSession):
    """Performs vector similarity search on the book_corpus table."""
    print(f"Performing AI search for query: {query}")

    # --- 1️⃣ 의도 분류 ---
    author_keywords = ["작가", "저자", "쓴"]
    similar_keywords = ["같은", "비슷한"]
    mood_keywords = ["분위기", "느낌", "감성", "무드"]

    if any(k in query for k in author_keywords):
        intent = "author"
    elif any(k in query for k in similar_keywords):
        intent = "similar"
    elif any(k in query for k in mood_keywords):
        intent = "mood"
    else:
        intent = "general"

    # --- 2️⃣ 프롬프트 리라이트 ---
    if intent == "author":
        query_text_for_embedding = f"이 작가의 책을 찾아줘: {query}. 이 작가의 작품을 추천해줘."
        current_threshold = AI_SEARCH_THRESHOLD

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
        query_text_for_embedding = f"{query.strip()}와 관련된 책을 찾아줘."
        current_threshold = AI_SIMILARITY_THRESHOLD

    print(f"[Intent: {intent}] Rewritten query: {query_text_for_embedding}")

    # --- 3️⃣ 쿼리 임베딩 생성 ---
    query_embedding = await get_embedding(query_text_for_embedding)
    if not query_embedding:
        raise HTTPException(status_code=500, detail="Could not generate embedding for the search query.")

    # --- 4️⃣ 벡터 유사도 검색 ---
    stmt = text("""
        SELECT id, title, contents, isbn, authors, publisher, thumbnail,
               1 - (embedding <=> :query_embedding) AS similarity
        FROM book_corpus
        WHERE 1 - (embedding <=> :query_embedding) > :threshold
        ORDER BY similarity DESC
        LIMIT :limit
    """)
    result = await db.execute(
        stmt,
        {
            "query_embedding": str(list(query_embedding)),
            "threshold": current_threshold,
            "limit": AI_SEARCH_LIMIT
        }
    )

    # --- 5️⃣ 결과 반환 ---
    search_results = [dict(row) for row in result.mappings()]
    print(f"[{intent.upper()}] Found {len(search_results)} results for query: '{query}'")
    for i, r in enumerate(search_results[:3], 1):
        print(f"{i}. {r.get('title')} (sim: {r.get('similarity'):.3f})")

    return search_results

