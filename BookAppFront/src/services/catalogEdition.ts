import { hasRecentTitle, type RecentBook } from '../utils/recentBooks';
import { bookApi } from './api';
import type { KakaoBook } from '../types/kakaoBook';
import { getIsbn13 } from '../utils/bookUtils';

export async function findCatalogEdition(isbn: string, signal: AbortSignal): Promise<KakaoBook | undefined> {
  const { data } = await bookApi.searchBooks({ query: isbn, target: 'isbn', size: 5 }, { signal, handleErrorLocally: true });
  const documents: KakaoBook[] = Array.isArray(data?.documents) ? data.documents : [];
  const editions = documents.filter(book => typeof book?.isbn === 'string' && getIsbn13(book) === isbn);
  return editions.find(book => book.thumbnail) ?? editions[0];
}

export async function restoreRecentEdition(isbn: string, signal: AbortSignal): Promise<RecentBook> {
  try {
    const { data } = await bookApi.getBookDetail(isbn, signal, { handleErrorLocally: true });
    if (data && getIsbn13(data) === isbn && hasRecentTitle(data.title, isbn)) return data;
  } catch (error) {
    if (signal.aborted) throw error;
  }
  const edition = await findCatalogEdition(isbn, signal);
  if (!edition || !hasRecentTitle(edition.title, isbn)) throw new Error('Missing edition details');
  return { isbn13: isbn, title: edition.title, authors: edition.authors?.join(', ') || '', thumbnail: edition.thumbnail };
}
