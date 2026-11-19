export const feedbackCategories = [
  { value: 'ERROR', label: '오류' },
  { value: 'DISCOVERY', label: '검색·추천' },
  { value: 'USABILITY', label: '사용성' },
] as const;

export const feedbackStatuses = [
  { value: 'NEW', label: '새 의견' },
  { value: 'REVIEWING', label: '확인 중' },
  { value: 'RESOLVED', label: '처리 완료' },
] as const;

export type FeedbackCategory = typeof feedbackCategories[number]['value'];
export type FeedbackStatus = typeof feedbackStatuses[number]['value'];

export const recommendationRatings = [1, 2, 3, 4, 5] as const;
export type RecommendationRating = typeof recommendationRatings[number];
