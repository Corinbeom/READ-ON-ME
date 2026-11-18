import type { BookDto } from '@/src/types/BookDto';
import type { Review } from '@/src/types/review';

export interface UserLibrary {
  readingBooks: BookDto[];
  toReadBooks: BookDto[];
  completedBooks: BookDto[];
}

export interface ReadingKeywords {
  keywords: { tag: string; count: number }[];
  analyzed: number;
}

export function parseReadingKeywords(value: unknown): ReadingKeywords {
  const data = value as Partial<ReadingKeywords> | null | undefined;
  if (!Array.isArray(data?.keywords) || typeof data?.analyzed !== 'number') {
    throw new Error('Invalid keyword response');
  }
  return {
    analyzed: data.analyzed,
    keywords: data.keywords.filter(item => {
      const tag = typeof item?.tag === 'string' ? item.tag.trim().toLowerCase() : '';
      return tag && tag !== 'user_added';
    }),
  };
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
