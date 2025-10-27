export interface Review {
  id: number;
  comment: string;
  rating: number;
  author: string;
  authorId: number;
  createdAt: string;
  likeCount: number;
  isLikedByCurrentUser: boolean;
}
