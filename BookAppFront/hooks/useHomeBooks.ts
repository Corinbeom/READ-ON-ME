import { useEffect, useState } from 'react';
import { bookApi, recommendationApi } from '@/src/services/api';
import type { Book } from '@/src/types/book';

interface LibraryBook {
  ranking: string; bookname: string; authors: string; publisher: string; isbn13: string; as_of: string; loan_count: string; source: string; age_group: number;
}
interface ListState {
  key: string | null; books: Book[]; loading: boolean; error: string; type: string;
}
const initial: ListState = { key: null, books: [], loading: true, error: '', type: 'personalized' };
const start = (previous: ListState, key: string): ListState =>
  previous.key === key ? { ...previous, loading: true, error: '' } : { ...initial, key };
export const calcAgeGroup = (birthYear: number): number =>
  Math.max(10, Math.min(60, Math.floor((new Date().getFullYear() - birthYear) / 10) * 10));
const mapBook = (item: LibraryBook, index: number): Book => ({
  id: parseInt(item.ranking, 10) || index + 1, title: item.bookname || '', thumbnail: '',
  loanRanking: { rank: item.ranking, count: item.loan_count, date: item.as_of, source: item.source, ageGroup: item.age_group },
  authors: item.authors || '', publisher: item.publisher || '', isbn13: item.isbn13 || '',
  contents: '', url: '', isbn10: '', datetime: '', price: 0, sale_price: 0, status: '',
});

export function useHomeBooks(userId?: number, birthYear?: number) {
  const [popular, setPopular] = useState<ListState>(initial);
  const [recommendations, setRecommendations] = useState<ListState>(initial);
  const [popularAttempt, setPopularAttempt] = useState(0);
  const [recommendationAttempt, setRecommendationAttempt] = useState(0);
  const ageGroup = birthYear ? calcAgeGroup(birthYear) : undefined;
  const popularKey = String(ageGroup ?? 'all');
  const recommendationKey = userId ? String(userId) : null;

  useEffect(() => {
    const controller = new AbortController();
    setPopular((previous) => start(previous, popularKey));
    const update = (patch: Partial<ListState>) => {
      if (!controller.signal.aborted) setPopular((previous) => previous.key === popularKey ? { ...previous, ...patch } : previous);
    };
    void (async () => {
      try {
        const { data } = await bookApi.getPopularBooksFromLibrary(ageGroup, { signal: controller.signal, handleErrorLocally: true });
        if (!Array.isArray(data)) throw new Error('Invalid popular books response');
        update({ books: data.map(mapBook), loading: false });
      } catch {
        update({ loading: false, error: '인기 책을 불러오지 못했어요.' });
      }
    })();
    return () => controller.abort();
  }, [ageGroup, popularKey, popularAttempt]);

  useEffect(() => {
    if (!recommendationKey) {
      setRecommendations(initial);
      return;
    }
    const controller = new AbortController();
    const options = { signal: controller.signal, handleErrorLocally: true };
    setRecommendations((previous) => start(previous, recommendationKey));
    const update = (patch: Partial<ListState>) => {
      if (!controller.signal.aborted) setRecommendations((previous) => previous.key === recommendationKey ? { ...previous, ...patch } : previous);
    };
    void (async () => {
      try {
        const { data } = await recommendationApi.getRecommendations(options);
        if (controller.signal.aborted) return;
        if (!Array.isArray(data?.bookIds)) throw new Error('Invalid recommendations response');
        const books = data.bookIds.length ? (await bookApi.getBooksByIds(data.bookIds, options)).data : [];
        if (!Array.isArray(books)) throw new Error('Invalid book details response');
        update({ books, type: data.type, loading: false });
      } catch {
        update({ loading: false, error: '추천 책을 불러오지 못했어요.' });
      }
    })();
    return () => controller.abort();
  }, [recommendationKey, recommendationAttempt]);

  return {
    popular: { ...(popular.key === popularKey ? popular : initial), retry: () => setPopularAttempt((value) => value + 1) },
    recommendations: { ...(recommendations.key === recommendationKey ? recommendations : initial), retry: () => setRecommendationAttempt((value) => value + 1) },
  };
}
