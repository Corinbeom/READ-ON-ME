export interface HomeCollectionBook {
  isbn: string;
  title: string;
  author: string;
  thumbnail: string;
  angle: string;
  summary: string;
  invitation: string;
  prompt: string;
  sourceUrl: string;
}

// Fixed editorial selection, checked against the provider descriptions on 2026-11-18.
export const HOME_COLLECTION = {
  title: '한동안 책을 놓고 있었다면',
  description: '지금 끌리는 이야기는 어느 쪽인가요?',
  basis: '책 소개를 바탕으로 골랐어요',
  books: [
    {
      isbn: '9791161571188', title: '불편한 편의점(벚꽃 에디션)', author: '김호연',
      thumbnail: 'https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F5643183%3Ftimestamp%3D20261006121959',
      angle: '이웃의 이야기', summary: '편의점에서 만나는 사람들',
      invitation: '작은 편의점을 무대로 이웃들의 삶과 희로애락을 담은 이야기예요.',
      prompt: '다양한 사람들의 일상과 관계를 다룬 소설을 추천해줘',
      sourceUrl: 'https://search.daum.net/search?w=bookpage&bookId=5643183',
    },
    {
      isbn: '9791198363503', title: '아몬드(청소년)', author: '손원평',
      thumbnail: 'https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F6381497%3Ftimestamp%3D20260916123006',
      angle: '성장 이야기', summary: '감정을 알아가는 소년',
      invitation: '감정을 느끼는 데 어려움을 겪는 소년이 세상으로 걸음을 내딛는 이야기예요.',
      prompt: '인물이 사람들과 관계를 맺으며 성장하는 소설을 추천해줘',
      sourceUrl: 'https://search.daum.net/search?w=bookpage&bookId=6381497',
    },
    {
      isbn: '9791165341909', title: '달러구트 꿈 백화점', author: '이미예',
      thumbnail: 'https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F5416922%3Ftimestamp%3D20260701140519',
      angle: '상상 속 세계', summary: '꿈을 사고파는 상점',
      invitation: '잠들어야 들어갈 수 있는 마을, 온갖 꿈을 판매하는 백화점의 이야기예요.',
      prompt: '현실과 다른 상상 속 세계를 배경으로 한 소설을 추천해줘',
      sourceUrl: 'https://search.daum.net/search?w=bookpage&bookId=5416922',
    },
  ] satisfies HomeCollectionBook[],
};
