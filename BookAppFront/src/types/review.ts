import { BookDto } from './BookDto'; // Import BookDto

export interface Review {
  id: number;
  comment: string;
  rating: number;
  author: string;
  authorId: number;
  createdAt: string;
  likeCount: number;
  isLikedByCurrentUser: boolean;
  book: BookDto; // Added book information
}
