export const maxStoryKeywords = 3;

export function isStoryKeyword(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100
    && !/[\p{Cc}]/u.test(value) && value.trim().toLowerCase() !== 'user_added';
}

// English forms that could appear in previously shared links.
const legacyLabels: Record<string, string> = {
  sf: '과학소설', 'sf소설': '과학소설', 'sf 소설': '과학소설', 'science fiction': '과학소설',
  mystery: '미스터리', 미스테리: '미스터리', 공상과학소설: '과학소설',
  fantasy: '판타지', romance: '로맨스', thriller: '스릴러', history: '역사', family: '가족', ai: '인공지능',
};

export function parseStoryKeywords(value: unknown): string[] {
  if (typeof value !== 'string' || !value || value.length > 1024) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > maxStoryKeywords || !parsed.every(isStoryKeyword)) {
      return [];
    }
    const labels = parsed.map(keyword => {
      const value = keyword.normalize('NFKC').trim().replace(/\s+/g, ' ');
      return Object.prototype.hasOwnProperty.call(legacyLabels, value.toLowerCase()) ? legacyLabels[value.toLowerCase()] : value;
    });
    return [...new Set(labels.filter(tag => /[가-힣]/.test(tag) && /^[가-힣0-9 ·%,+()/-]+$/u.test(tag)))];
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
