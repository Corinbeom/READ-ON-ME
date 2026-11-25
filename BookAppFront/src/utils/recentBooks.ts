import type { BookDto } from '../types/BookDto';
import { getIsbn13 } from './bookUtils';
import { createDeviceHistory } from './deviceHistory';

export const RECENT_BOOKS_KEY = 'recently-viewed-books:v1';
export const MAX_RECENT_BOOKS = 6;
export type RecentBook = Pick<BookDto, 'isbn13' | 'title' | 'authors' | 'thumbnail'>;

export function hasRecentTitle(title: unknown, isbn: string): title is string {
  return typeof title === 'string' && !!title.trim()
    && !(/^[\dXx\s-]+$/.test(title) && getIsbn13({ isbn: title }) === isbn);
}

function sanitizeRecentBooks(value: unknown): RecentBook[] {
  if (!Array.isArray(value)) return [];
  const books: RecentBook[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const { isbn13, title, authors, thumbnail } = typeof item === 'string' ? { isbn13: item } : item || {};
    if (typeof isbn13 !== 'string' || isbn13.length !== 13 || getIsbn13({ isbn13 }) !== isbn13 || seen.has(isbn13)) continue;
    books.push({
      isbn13,
      title: hasRecentTitle(title, isbn13) ? title.trim().slice(0, 250) : '',
      authors: typeof authors === 'string' ? authors.trim().slice(0, 250) : '',
      thumbnail: typeof thumbnail === 'string' && /^https?:\/\/[^\s]+$/i.test(thumbnail) && thumbnail.length <= 2048 ? thumbnail : '',
    });
    seen.add(isbn13);
    if (books.length === MAX_RECENT_BOOKS) break;
  }
  return books;
}

export function createRecentBooks(storage: Parameters<typeof createDeviceHistory>[0]) {
  const identityStorage = {
    getItem: async (key: string) => {
      const raw = await storage.getItem(key);
      if (!raw) return null;
      let entries: unknown;
      try { entries = JSON.parse(raw); } catch { return null; }
      // Older clients persisted book objects. Only restore their edition identities.
      return Array.isArray(entries)
        ? JSON.stringify(entries.map(item => typeof item === 'string' ? item : item?.isbn13))
        : null;
    },
    setItem: (key: string, value: string) => storage.setItem(key,
      JSON.stringify((JSON.parse(value) as RecentBook[]).map(book => book.isbn13))),
    removeItem: (key: string) => storage.removeItem(key),
  };
  const { mutate, ...history } = createDeviceHistory(identityStorage, RECENT_BOOKS_KEY, sanitizeRecentBooks, {
    load: '최근 본 책을 불러오지 못했어요.',
    save: '최근 본 책의 변경 사항을 이 기기에 저장하지 못했어요.',
  });
  return {
    ...history,
    add: (book: RecentBook) => mutate(items => {
      const existing = items.find(item => item.isbn13 === book.isbn13);
      const viewed = !hasRecentTitle(book.title, book.isbn13) && existing?.title ? existing : book;
      const [latest] = items;
      if (latest && latest.isbn13 === viewed.isbn13 && latest.title === viewed.title
        && latest.authors === viewed.authors && latest.thumbnail === viewed.thumbnail) return items;
      return sanitizeRecentBooks([viewed, ...items]);
    }),
  };
}
