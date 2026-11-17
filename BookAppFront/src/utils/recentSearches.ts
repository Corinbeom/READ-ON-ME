type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

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

export function createRecentSearches(storage: Storage) {
  const initial = { items: [] as string[], loaded: false, error: '' };
  let snapshot = initial;
  let hydration: Promise<void> | null = null;
  let queue = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (items: string[], error = '') => {
    snapshot = { items, loaded: true, error };
    listeners.forEach((listener) => listener());
  };
  const load = () => hydration ??= (async () => {
    try {
      const stored = await storage.getItem(RECENT_SEARCHES_KEY);
      let parsed: unknown = [];
      try { parsed = stored ? JSON.parse(stored) : []; } catch { /* Ignore malformed device history. */ }
      publish(sanitizeRecentSearches(parsed));
    } catch {
      publish([], '최근 검색어를 불러오지 못했어요.');
    }
  })();
  const mutate = (transform: (items: string[]) => string[]) => {
    // Serialize hydration and writes so a late read/write cannot undo a deletion.
    queue = queue.then(load).then(async () => {
      const items = transform(snapshot.items);
      publish(items);
      try {
        if (items.length) await storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items));
        else await storage.removeItem(RECENT_SEARCHES_KEY);
      } catch {
        publish(items, '최근 검색어를 저장하지 못했어요.');
      }
    });
    return queue;
  };
  return {
    load,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    add: (query: string) => mutate((items) => sanitizeRecentSearches([query, ...items])),
    remove: (query: string) => mutate((items) => items.filter((item) => item !== query)),
    clear: () => mutate(() => []),
  };
}
