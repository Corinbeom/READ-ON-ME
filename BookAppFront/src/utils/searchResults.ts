export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';
export type SearchResult<T> = { query: string; books: T[] };

export function searchResultView<T>(status: SearchStatus, submittedQuery: string, result: SearchResult<T> | null) {
  const books = status !== 'idle' && result?.query === submittedQuery ? result.books : [];
  return { books, retaining: books.length > 0 && (status === 'loading' || status === 'error') };
}
