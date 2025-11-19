export type NotificationType = 'REVIEW_LIKED';

export interface Notification {
  id: number;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: string;
  reviewId?: number | null;
  senderId?: number | null;
  senderNickname?: string | null;
}
