import { createDeviceHistory } from './deviceHistory';

export const RECENT_SEARCHES_KEY = 'recent-book-searches:v1';
export const MAX_RECENT_SEARCHES = 8;
export const MAX_SEARCH_LENGTH = 500;

export function normalizeSearchQuery(value: string) {
  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

export function sanitizeRecentSearches(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is string => typeof item === 'string')
    .map(normalizeSearchQuery)
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_RECENT_SEARCHES);
}

export function createRecentSearches(storage: Parameters<typeof createDeviceHistory>[0]) {
  const { mutate, ...history } = createDeviceHistory(storage, RECENT_SEARCHES_KEY, sanitizeRecentSearches, {
    load: '최근 검색어를 불러오지 못했어요.',
    save: '최근 검색어를 저장하지 못했어요.',
  });
  return {
    ...history,
    add: (query: string) => mutate((items) => sanitizeRecentSearches([query, ...items])),
    remove: (query: string) => mutate((items) => items.filter((item) => item !== query)),
  };
}
