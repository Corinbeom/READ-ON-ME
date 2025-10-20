// BookAppFront/src/types/Book.ts
export interface Book {
    title: string;
    contents: string;
    url: string;
    isbn10: string;
    isbn13: string;
    datetime: string;
    authors: string[];
    publisher: string;
    translators?: string[];
    price: number;
    sale_price: number;
    thumbnail: string;
    status: string;
  }
  
  export interface BookSearchResponse {
    meta: {
      total_count: number;
      pageable_count: number;
      is_end: boolean;
    };
    documents: Book[];
  }
  
  export interface BookSearchParams {
    query: string;
    page?: number;
    size?: number;
    sort?: 'accuracy' | 'latest';
    target?: 'title' | 'isbn' | 'publisher' | 'person';
  }