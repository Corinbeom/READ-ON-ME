import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { createRecentBooks } from '@/src/utils/recentBooks';

import { bookApi } from '@/src/services/api';

const history = createRecentBooks(AsyncStorage, async isbn => (await bookApi.getBookDetail(isbn)).data);

export const rememberBookView = history.add;

export function useRecentBooks() {
  const snapshot = useSyncExternalStore(history.subscribe, history.getSnapshot, history.getServerSnapshot);
  useEffect(() => { void history.load(); }, []);
  return { ...snapshot, clear: history.clear };
}
