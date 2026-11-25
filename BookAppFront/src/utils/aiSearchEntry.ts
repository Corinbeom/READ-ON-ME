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

export function authReturnParams(returnTo: unknown, prompt: unknown, isbn?: unknown, tags?: unknown) {
  if (returnTo === 'my-library') return { returnTo: 'my-library' as const };
  if (returnTo === 'search' || returnTo === 'notifications' || returnTo === 'feedback') return { returnTo: returnTo as 'search' | 'notifications' | 'feedback' };
  if (returnTo === 'reading-keywords') return { returnTo: 'reading-keywords' as const, tags: typeof tags === 'string' ? tags.slice(0, 500) : '' };
  if (returnTo === 'operations') return { returnTo: 'operations' as const };
  if (returnTo === 'book-detail' && typeof isbn === 'string' && isbn && getIsbn13({ isbn13: isbn }) === isbn) {
    return { returnTo: 'book-detail' as const, isbn };
  }
  return returnTo === 'ai-books'
    ? { returnTo: 'ai-books' as const, prompt: normalizeAiPrompt(prompt) }
    : {};
}

export function authReturnHref(params: ReturnType<typeof authReturnParams>) {
  if (params.returnTo === 'my-library') return '/my-library' as const;
  if (params.returnTo === 'search') return '/search' as const;
  if (params.returnTo === 'notifications') return '/notifications' as const;
  if (params.returnTo === 'feedback') return '/feedback' as const;
  if (params.returnTo === 'reading-keywords') return { pathname: '/reading-keywords' as const, params: { tags: params.tags } };
  if (params.returnTo === 'operations') return '/operations' as const;
  if (params.returnTo === 'ai-books') return aiSearchHref(params.prompt);
  if (params.returnTo === 'book-detail') {
    return { pathname: '/book/[isbn]' as const, params: { isbn: params.isbn } };
  }
  return '/' as const;
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
