package bookapp.bookappback.notification.dto;

import bookapp.bookappback.notification.entity.Notification;
import bookapp.bookappback.notification.entity.NotificationType;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class NotificationResponse {
    private final Long id;
    private final NotificationType type;
    private final String message;
    private final boolean read;
    private final Long reviewId;
    private final Long senderId;
    private final String senderNickname;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private final LocalDateTime createdAt;

    public NotificationResponse(Notification notification) {
        this.id = notification.getId();
        this.type = notification.getType();
        this.message = notification.getMessage();
        this.read = notification.isRead();
        this.reviewId = notification.getReview() != null ? notification.getReview().getId() : null;
        this.senderId = notification.getSender() != null ? notification.getSender().getId() : null;
        this.senderNickname = notification.getSender() != null ? notification.getSender().getNickname() : null;
        this.createdAt = notification.getCreatedAt();
    }
}
