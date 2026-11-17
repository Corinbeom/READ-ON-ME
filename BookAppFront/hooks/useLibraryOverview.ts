import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSelector } from 'react-redux';
import type { RootState } from '@/src/store';
import { bookApi, reviewApi, userApi } from '@/src/services/api';
import type { Review } from '@/src/types/review';
import { loadLibraryOverview, type ReadingKeywords, type UserLibrary } from '@/src/utils/libraryOverview';

type Overview = {
  ownerId: number | null;
  library: UserLibrary | null;
  reviews: Review[] | null;
  keywords: ReadingKeywords | null;
  libraryError: string;
  reviewsError: string;
  keywordsError: string;
  refreshing: boolean;
};
const empty: Overview = {
  ownerId: null, library: null, reviews: null, keywords: null,
  libraryError: '', reviewsError: '', keywordsError: '', refreshing: false,
};

export function useLibraryOverview(isAuthenticated: boolean, userId?: number) {
  const [state, setState] = useState<Overview>(empty);
  const [attempt, setAttempt] = useState(0);
  const revision = useSelector((state: RootState) => state.libraryStatus.revision);
  useFocusEffect(useCallback(() => {
    if (!isAuthenticated || !userId) {
      setState(empty);
      return;
    }
    const controller = new AbortController();
    const options = { signal: controller.signal, handleErrorLocally: true };
    setState((previous) => ({
      ...(previous.ownerId === userId ? previous : empty), ownerId: userId,
      refreshing: true, libraryError: '', reviewsError: '', keywordsError: '',
    }));
    const update = (patch: Partial<Overview>) => {
      if (!controller.signal.aborted) setState((previous) => previous.ownerId === userId ? { ...previous, ...patch } : previous);
    };
    void loadLibraryOverview({
      library: async () => {
        const { data } = await bookApi.getUserLibrary(options);
        if (![data?.readingBooks, data?.toReadBooks, data?.completedBooks].every(Array.isArray)) throw new Error('Invalid library response');
        return data as UserLibrary;
      },
      reviews: async () => {
        const { data } = await reviewApi.getMyReviews(options);
        if (!Array.isArray(data?.data)) throw new Error('Invalid reviews response');
        return data.data as Review[];
      },
      keywords: async () => {
        const response = await userApi.getReadingKeywords(options);
        const data = response.data?.data ?? response.data;
        if (!Array.isArray(data?.keywords) || typeof data?.analyzed !== 'number') throw new Error('Invalid keyword response');
        return data as ReadingKeywords;
      },
    }, {
      library: ({ data, error }) => update(data ? { library: data, libraryError: '' } : { libraryError: error }),
      reviews: ({ data, error }) => update(data ? { reviews: data, reviewsError: '' } : { reviewsError: error }),
      keywords: ({ data, error }) => update(data ? { keywords: data, keywordsError: '' } : { keywordsError: error }),
    }, controller.signal).then(() => update({ refreshing: false }));
    return () => controller.abort();
  }, [attempt, isAuthenticated, userId, revision]));
  const current = isAuthenticated && state.ownerId === userId ? state : empty;
  return { ...current, reload: () => setAttempt((value) => value + 1) };
}
