import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { createRecentBooks } from '@/src/utils/recentBooks';

const history = createRecentBooks(AsyncStorage);

export const rememberBookView = history.add;

export function useRecentBooks() {
  const snapshot = useSyncExternalStore(history.subscribe, history.getSnapshot, history.getServerSnapshot);
  useEffect(() => { void history.load(); }, []);
  return { ...snapshot, clear: history.clear };
}
