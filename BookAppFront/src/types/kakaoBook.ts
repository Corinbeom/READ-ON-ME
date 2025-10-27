export interface KakaoBook {
  title: string;
  contents: string;
  url: string;
  isbn: string; // Can be isbn10 or isbn13, or both space-separated
  datetime: string;
  authors: string[];
  publisher: string;
  translators?: string[];
  price: number;
  sale_price: number;
  thumbnail: string;
  status: string;
}
