type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export function createDeviceHistory<T>(
  storage: Storage,
  key: string,
  sanitize: (value: unknown) => T[],
  messages: { load: string; save: string },
) {
  const initial = { items: [] as T[], loaded: false, error: '' };
  let snapshot = initial;
  let hydration: Promise<void> | null = null;
  let queue = Promise.resolve();
  const listeners = new Set<() => void>();

  const publish = (items: T[], error = '') => {
    snapshot = { items, loaded: true, error };
    listeners.forEach(listener => listener());
  };

  const load = () => hydration ??= (async () => {
    try {
      const stored = await storage.getItem(key);
      let parsed: unknown = [];
      try { parsed = stored ? JSON.parse(stored) : []; } catch { /* Ignore malformed device history. */ }
      publish(sanitize(parsed));
    } catch {
      publish([], messages.load);
    }
  })();

  const mutate = (transform: (items: T[]) => T[]) => {
    // Serialize hydration and writes so a late read/write cannot undo a deletion.
    queue = queue.then(load).then(async () => {
      const items = transform(snapshot.items);
      if (items === snapshot.items && !snapshot.error) return;
      publish(items);
      try {
        if (items.length) await storage.setItem(key, JSON.stringify(items));
        else await storage.removeItem(key);
      } catch {
        publish(items, messages.save);
      }
    });
    return queue;
  };

  return {
    load,
    mutate,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    clear: () => mutate(() => []),
  };
}
