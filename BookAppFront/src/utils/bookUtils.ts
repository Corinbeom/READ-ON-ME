import { Book } from '../types/book';
import { KakaoBook } from '../types/kakaoBook'; // Import KakaoBook

export const getIsbn13 = (item: Book | KakaoBook): string => {
  const rawIsbn = 'isbn13' in item
    ? `${item.isbn13 || ''} ${item.isbn10 || ''}`
    : item.isbn || '';
  const parts = rawIsbn.trim().split(/\s+/).map(part => part.replace(/-/g, '').toUpperCase());
  const valid13 = parts.find(part => /^(978|979)\d{10}$/.test(part) && checksum13(part) === 0);
  if (valid13) return valid13;

  const valid10 = parts.find(part => /^\d{9}[\dX]$/.test(part) && checksum10(part) === 0);
  if (!valid10) return '';
  const stem = `978${valid10.slice(0, 9)}`;
  return `${stem}${(10 - checksum13(stem)) % 10}`;
};

const checksum13 = (digits: string): number => [...digits].reduce(
  (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0,
) % 10;

const checksum10 = (digits: string): number => [...digits].reduce(
  (sum, digit, index) => sum + (10 - index) * (digit === 'X' ? 10 : Number(digit)), 0,
) % 11;
