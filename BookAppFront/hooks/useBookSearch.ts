import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { bookApi } from '@/src/services/api';
import type { KakaoBook } from '@/src/types/kakaoBook';
import { createLatestBookRequest } from '@/src/utils/latestBookRequest';
import { normalizeSearchQuery } from '@/src/utils/recentSearches';
import { searchResultView, type SearchResult, type SearchStatus } from '@/src/utils/searchResults';

function documents(data: { documents?: KakaoBook[] }): KakaoBook[] {
  if (!Array.isArray(data?.documents)) throw new Error('Invalid book search response');
  return data.documents;
}

export function useBookSearch(onSuccess: (query: string) => Promise<void>) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [result, setResult] = useState<SearchResult<KakaoBook> | null>(null);
  const [suggestions, setSuggestions] = useState<KakaoBook[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState(false);
  const requests = useRef(createLatestBookRequest());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingQuery = useRef<string | null>(null);

  const cancel = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    requests.current.cancel();
    submittingQuery.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const changeQuery = useCallback((text: string) => {
    cancel();
    setQuery(text);
    setStatus('idle');
    setSuggestions([]);
    setSuggestionError(false);
    const trimmed = normalizeSearchQuery(text);
    setSuggesting(trimmed.length >= 2);
    if (trimmed.length < 2) return;
    debounce.current = setTimeout(async () => {
      const request = requests.current.begin();
      try {
        const response = await bookApi.searchBooks({ query: trimmed, size: 5 }, { signal: request.signal, handleErrorLocally: true });
        if (request.isCurrent()) setSuggestions(documents(response.data));
      } catch {
        if (request.isCurrent()) setSuggestionError(true);
      } finally {
        if (request.isCurrent()) setSuggesting(false);
      }
    }, 400);
  }, [cancel]);

  const search = useCallback(async (override?: string) => {
    const trimmed = normalizeSearchQuery(override ?? query);
    if (!trimmed || submittingQuery.current === trimmed) return;
    cancel();
    const request = requests.current.begin();
    submittingQuery.current = trimmed;
    Keyboard.dismiss();
    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setStatus('loading');
    setSuggestions([]);
    setSuggesting(false);
    setSuggestionError(false);
    try {
      const response = await bookApi.searchBooks({ query: trimmed, size: 20 }, { signal: request.signal, handleErrorLocally: true });
      if (!request.isCurrent()) return;
      setResult({ query: trimmed, books: documents(response.data) });
      setStatus('success');
      void onSuccess(trimmed);
    } catch {
      if (request.isCurrent()) setStatus('error');
    } finally {
      if (request.isCurrent()) submittingQuery.current = null;
    }
  }, [cancel, onSuccess, query]);

  const { books, retaining } = searchResultView(status, submittedQuery, result);
  return { query, submittedQuery, status, books, retaining, suggestions, suggesting, suggestionError, changeQuery, search };
}
