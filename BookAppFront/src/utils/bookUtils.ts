import { Book } from '../types/book';

export const getIsbn13 = (item: Book): string => {
  const raw = (item.isbn13 || item.isbn10 || item.isbn || '').trim();
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length >= 13 ? digits.slice(-13) : '';
};