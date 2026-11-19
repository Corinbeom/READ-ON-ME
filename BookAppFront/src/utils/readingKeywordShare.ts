export const maxStoryKeywords = 3;

export function isStoryKeyword(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100
    && !/[\p{Cc}]/u.test(value) && value.trim().toLowerCase() !== 'user_added';
}

export function parseStoryKeywords(value: unknown): string[] {
  if (typeof value !== 'string' || !value || value.length > 1024) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > maxStoryKeywords || !parsed.every(isStoryKeyword)) {
      return [];
    }
    return [...new Set(parsed.map(keyword => keyword.trim()))];
  } catch {
    return [];
  }
}

export function storyKeywordUrl(origin: string, keywords: readonly string[]): string {
  const url = new URL('/reading-keywords', origin);
  // Treat literal percent escapes in tags as text after Expo Router decodes route params.
  url.searchParams.set('tags', JSON.stringify(keywords).replace(/%/g, '\\u0025'));
  return url.toString();
}
