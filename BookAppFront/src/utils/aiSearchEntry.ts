import { getIsbn13 } from './bookUtils';

export function normalizeAiPrompt(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.trim().slice(0, 500) : '';
}

export function aiSearchHref(prompt?: unknown) {
  const normalized = normalizeAiPrompt(prompt);
  return normalized
    ? { pathname: '/ai-books' as const, params: { prompt: normalized } }
    : { pathname: '/ai-books' as const };
}

export function authReturnParams(returnTo: unknown, prompt: unknown, isbn?: unknown) {
  if (returnTo === 'my-library') return { returnTo: 'my-library' as const };
  if (returnTo === 'book-detail' && typeof isbn === 'string' && isbn && getIsbn13({ isbn13: isbn }) === isbn) {
    return { returnTo: 'book-detail' as const, isbn };
  }
  return returnTo === 'ai-books'
    ? { returnTo: 'ai-books' as const, prompt: normalizeAiPrompt(prompt) }
    : {};
}

export function resolveAiSearchEntry<T extends { status: string; query: string }>(prompt: string, previous: T | null) {
  const pending = previous?.status === 'QUEUED' || previous?.status === 'RUNNING';
  // A new condition must never hide an existing search that is still running.
  return {
    job: prompt && !pending ? null : previous,
    query: pending ? previous.query : prompt || previous?.query || '',
    deferredPrompt: pending && prompt !== previous.query ? prompt : '',
  };
}
