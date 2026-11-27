export interface HomeBook {
  isbn13: string;
  title: string;
  authors: string;
  thumbnail: string | null;
}

export const recommendationCriteria = {
  DISCOVERY: '내가 읽은 책의 관심사를 바탕으로, 비슷한 주제를 서로 다른 방식으로 다룬 책도 함께 골라요.',
  INTEREST: '내가 읽은 책과 관심사가 겹치는 책을 골라요.',
  READERS: '나와 같은 책을 읽은 독자들이 읽은 다른 책을 골라요.',
  INTEREST_AND_READERS: '내가 읽은 책의 관심사와 나와 같은 책을 읽은 독자들의 서재를 참고해요.',
  EMPTY: '읽는 중이거나 완독한 책을 바탕으로 다음에 읽을 책을 찾아요.',
} as const;

export interface HomeRecommendations {
  basis: keyof typeof recommendationCriteria;
  books: HomeBook[];
}
