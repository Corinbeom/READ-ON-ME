import { useCallback, useEffect, useState } from 'react';
import { bookApi, recommendationApi } from '@/src/services/api';
import { useFocusEffect } from 'expo-router';
import { recommendationCriteria, type HomeBook, type HomeRecommendations } from '@/src/types/homeRecommendations';
import type { Book } from '@/src/types/book';

interface LibraryBook {
  bookImageURL?: string | null;
  ranking: string; bookname: string; authors: string; publisher: string; isbn13: string; as_of: string; loan_count: string; source: string; age_group: number;
}
interface ListState<T> {
  key: string | null; books: T[]; loading: boolean; error: string;
}
const initial = { key: null, books: [], loading: true, error: '' };
const initialRecommendations = { ...initial, basis: 'EMPTY' as HomeRecommendations['basis'] };
export const calcAgeGroup = (birthYear: number): number =>
  Math.max(10, Math.min(60, Math.floor((new Date().getFullYear() - birthYear) / 10) * 10));
const mapBook = (item: LibraryBook, index: number): Book => ({
  id: parseInt(item.ranking, 10) || index + 1, title: item.bookname || '', thumbnail: item.bookImageURL || '',
  loanRanking: { rank: item.ranking, count: item.loan_count, date: item.as_of, source: item.source, ageGroup: item.age_group },
  authors: item.authors || '', publisher: item.publisher || '', isbn13: item.isbn13 || '',
  contents: '', url: '', isbn10: '', datetime: '', price: 0, sale_price: 0, status: '',
});

export function useHomeBooks(userId?: number, birthYear?: number) {
  const [popular, setPopular] = useState<ListState<Book>>(initial);
  const [recommendations, setRecommendations] = useState<ListState<HomeBook> & Pick<HomeRecommendations, 'basis'>>(initialRecommendations);
  const [popularAttempt, setPopularAttempt] = useState(0);
  const [recommendationAttempt, setRecommendationAttempt] = useState(0);
  const ageGroup = birthYear ? calcAgeGroup(birthYear) : undefined;
  const popularKey = String(ageGroup ?? 'all');
  const recommendationKey = userId ? String(userId) : null;

  useEffect(() => {
    const controller = new AbortController();
    setPopular((previous) => ({ ...(previous.key === popularKey ? previous : initial), key: popularKey, loading: true, error: '' }));
    const update = (patch: Partial<ListState<Book>>) => {
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

  useFocusEffect(useCallback(() => {
    if (!recommendationKey) {
      setRecommendations(initialRecommendations);
      return;
    }
    const controller = new AbortController();
    const options = { signal: controller.signal, handleErrorLocally: true };
    setRecommendations((previous) => ({ ...(previous.key === recommendationKey ? previous : initialRecommendations), key: recommendationKey, loading: true, error: '' }));
    const update = (patch: Partial<HomeRecommendations & ListState<HomeBook>>) => {
      if (!controller.signal.aborted) setRecommendations((previous) => previous.key === recommendationKey ? { ...previous, ...patch } : previous);
    };
    void (async () => {
      try {
        const { data } = await recommendationApi.getHome(options);
        if (!Array.isArray(data?.books) || !Object.prototype.hasOwnProperty.call(recommendationCriteria, data.basis)) {
          throw new Error('Invalid home recommendations response');
        }
        update({ books: data.books, basis: data.basis, loading: false });
      } catch {
        update({ loading: false, error: '추천 책을 불러오지 못했어요.' });
      }
    })();
    return () => controller.abort();
  }, [recommendationKey, recommendationAttempt]));

  return {
    popular: { ...(popular.key === popularKey ? popular : initial), retry: () => setPopularAttempt((value) => value + 1) },
    recommendations: { ...(recommendations.key === recommendationKey ? recommendations : initialRecommendations), retry: () => setRecommendationAttempt((value) => value + 1) },
  };
}
