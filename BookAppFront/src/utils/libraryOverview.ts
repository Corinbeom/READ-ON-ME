import type { BookDto } from '@/src/types/BookDto';
import type { Review } from '@/src/types/review';

export interface UserLibrary {
  readingBooks: BookDto[];
  toReadBooks: BookDto[];
  completedBooks: BookDto[];
}

export interface ReadingKeyword {
  tag: string;
  count: number;
  book_isbns?: string[];
  catalog_count?: number;
}

export interface ReadingKeywords {
  keywords: ReadingKeyword[];
  analyzed: number;
  pending?: number;
  failed?: number;
}

export function parseReadingKeywords(value: unknown): ReadingKeywords {
  const data = value as Partial<ReadingKeywords> | null | undefined;
  if (!Array.isArray(data?.keywords) || typeof data?.analyzed !== 'number') {
    throw new Error('Invalid keyword response');
  }
  const seen = new Set<string>();
  return {
    analyzed: data.analyzed,
    ...(Number.isInteger(data.pending) && data.pending! > 0 ? { pending: data.pending } : {}),
    ...(Number.isInteger(data.failed) && data.failed! > 0 ? { failed: data.failed } : {}),
    keywords: data.keywords.flatMap((item): ReadingKeyword[] => {
      const tag = typeof item?.tag === 'string' ? item.tag.trim() : '';
      if (!tag || tag.toLowerCase() === 'user_added' || seen.has(tag) || !Number.isInteger(item.count) || item.count < 1) return [];
      seen.add(tag);
      const book_isbns = Array.isArray(item.book_isbns)
        ? [...new Set(item.book_isbns.filter(isbn => typeof isbn === 'string' && /^\d{13}$/.test(isbn)))]
        : undefined;
      return [{ tag, count: item.count, ...(book_isbns ? { book_isbns } : {}),
        ...(Number.isInteger(item.catalog_count) && item.catalog_count! > 0 ? { catalog_count: item.catalog_count } : {}) }];
    }),
  };
}

export function readingKeywordBooks(keyword: ReadingKeyword, library: UserLibrary): BookDto[] {
  const sources = new Set(keyword.book_isbns);
  return [...library.readingBooks, ...library.completedBooks].filter(book => sources.has(book.isbn13));
}

type Result<T> = { data: T | null; error: string };
type Sources = {
  library: () => Promise<UserLibrary>;
  reviews: () => Promise<Review[]>;
  keywords: () => Promise<ReadingKeywords>;
};
type Receivers = {
  library: (result: Result<UserLibrary>) => void;
  reviews: (result: Result<Review[]>) => void;
  keywords: (result: Result<ReadingKeywords>) => void;
};

export function loadLibraryOverview(sources: Sources, receivers: Receivers, signal: AbortSignal) {
  async function load<T>(request: () => Promise<T>, receive: (result: Result<T>) => void, message: string) {
    let result: Result<T>;
    try { result = { data: await request(), error: '' }; }
    catch { result = { data: null, error: message }; }
    if (!signal.aborted) receive(result);
  }
  // Each section can render as soon as its own request finishes.
  return Promise.all([
    load(sources.library, receivers.library, '서재의 책을 불러오지 못했어요.'),
    load(sources.reviews, receivers.reviews, '리뷰를 불러오지 못했어요.'),
    load(sources.keywords, receivers.keywords, '독서 키워드를 불러오지 못했어요.'),
  ]);
}

export function libraryBookCount(library: UserLibrary) {
  return library.readingBooks.length + library.toReadBooks.length + library.completedBooks.length;
}
