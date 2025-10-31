
import os
import httpx
import numpy as np
import google.generativeai as genai
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.book_corpus import BookCorpus
from app.schemas import SingleBookRequest

# --- Configuration ---
KAKAO_API_KEY = os.getenv("KAKAO_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not KAKAO_API_KEY or not GEMINI_API_KEY:
    raise ValueError("API keys for Kakao and Gemini must be set in .env file")

KAKAO_API_URL = "https://dapi.kakao.com/v3/search/book"
SIMILARITY_THRESHOLD = 0.65

genai.configure(api_key=GEMINI_API_KEY)

# --- Service Functions ---

async def get_embedding(text: str):
    """Generates embedding for a given text using Gemini API."""
    try:
        result = await genai.embed_content_async(model="models/text-embedding-004", content=text)
        return result['embedding']
    except Exception as e:
        print(f"Error getting embedding: {e}")
        return None

async def search_kakao_books(keyword: str, page: int):
    """Searches for books using Kakao API."""
    headers = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}
    params = {"query": keyword, "page": page, "size": 10} # size is 1-50
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

# --- Main Orchestrators ---

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

        for page in range(1, 6): # 1 to 5 pages as per requirements
            books = await search_kakao_books(keyword, page)
            if not books:
                break

            for book in books:
                isbn = book.get('isbn')
                # Kakao API returns 2 ISBNs (isbn10 isbn13), we take the second one (isbn13)
                if isbn and len(isbn.split()) > 1:
                    isbn = isbn.split()[1]
                else:
                    continue # Skip if no valid ISBN

                if await check_if_isbn_exists(db, isbn):
                    print(f"Book with ISBN {isbn} already exists. Skipping.")
                    continue

                book_text = f"{book.get('title', '')} {book.get('contents', '')}"
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

    if await check_if_isbn_exists(db, book_data.isbn):
        print(f"Book with ISBN {book_data.isbn} already exists in corpus. Skipping.")
        return

    book_text = f"{book_data.title} {book_data.contents}"
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
