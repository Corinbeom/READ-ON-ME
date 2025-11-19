package bookapp.bookappback.notification.repository;

import bookapp.bookappback.notification.entity.Notification;
import bookapp.bookappback.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findTop50ByReceiverOrderByCreatedAtDesc(User receiver);
    List<Notification> findByReceiverAndReadIsFalse(User receiver);
}
