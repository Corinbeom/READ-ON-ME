import { Book } from '../types/book';
import { KakaoBook } from '../types/kakaoBook'; // Import KakaoBook

export const getIsbn13 = (item: Book | KakaoBook): string => {
  let rawIsbn = '';
  if ('isbn13' in item) { // It's a Book type
    rawIsbn = (item.isbn13 || item.isbn10 || '').trim();
  } else if ('isbn' in item) { // It's a KakaoBook type
    rawIsbn = item.isbn.trim();
  }

  const digits = rawIsbn.replace(/[^0-9]/g, '');
  // Kakao's ISBN field can contain "isbn10 isbn13". We want the 13-digit one.
  const isbnParts = digits.split(' ');
  const isbn13 = isbnParts.find(part => part.length === 13) || digits; // Find 13-digit part or use all digits

  return isbn13.length >= 13 ? isbn13.slice(-13) : '';
};