import type { BookDto } from '../types/BookDto';
import { getIsbn13 } from './bookUtils';
import { createDeviceHistory } from './deviceHistory';

export const RECENT_BOOKS_KEY = 'recently-viewed-books:v1';
export const MAX_RECENT_BOOKS = 6;
export type RecentBook = Pick<BookDto, 'isbn13' | 'title' | 'authors' | 'thumbnail'>;

function sanitizeRecentBooks(value: unknown): RecentBook[] {
  if (!Array.isArray(value)) return [];
  const books: RecentBook[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { isbn13, title, authors, thumbnail } = item as Partial<RecentBook>;
    if (typeof isbn13 !== 'string' || isbn13.length !== 13 || getIsbn13({ isbn13 }) !== isbn13 || seen.has(isbn13)) continue;
    if (typeof title !== 'string' || !title.trim()) continue;
    books.push({
      isbn13,
      title: title.trim().slice(0, 250),
      authors: typeof authors === 'string' ? authors.trim().slice(0, 250) : '',
      thumbnail: typeof thumbnail === 'string' && /^https?:\/\/[^\s]+$/i.test(thumbnail) && thumbnail.length <= 2048 ? thumbnail : '',
    });
    seen.add(isbn13);
    if (books.length === MAX_RECENT_BOOKS) break;
  }
  return books;
}

export function createRecentBooks(storage: Parameters<typeof createDeviceHistory>[0]) {
  const { mutate, ...history } = createDeviceHistory(storage, RECENT_BOOKS_KEY, sanitizeRecentBooks, {
    load: '최근 본 책을 불러오지 못했어요.',
    save: '최근 본 책의 변경 사항을 이 기기에 저장하지 못했어요.',
  });
  return {
    ...history,
    add: (book: RecentBook) => mutate(items => {
      const [latest] = items;
      if (latest && latest.isbn13 === book.isbn13 && latest.title === book.title
        && latest.authors === book.authors && latest.thumbnail === book.thumbnail) return items;
      return sanitizeRecentBooks([book, ...items]);
    }),
  };
}
