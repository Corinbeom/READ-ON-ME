import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { createRecentSearches } from '@/src/utils/recentSearches';

const history = createRecentSearches(AsyncStorage);

export function useRecentSearches() {
  const snapshot = useSyncExternalStore(history.subscribe, history.getSnapshot, history.getServerSnapshot);
  useEffect(() => { void history.load(); }, []);
  return { ...snapshot, add: history.add, remove: history.remove, clear: history.clear };
}
