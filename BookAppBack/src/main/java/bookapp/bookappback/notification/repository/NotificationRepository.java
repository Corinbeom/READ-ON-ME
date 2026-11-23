package bookapp.bookappback.notification.repository;

import bookapp.bookappback.notification.entity.Notification;
import bookapp.bookappback.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    @Modifying
    @Query("update Notification n set n.review = null where n.review.id = :reviewId")
    void detachReview(@Param("reviewId") Long reviewId);

    List<Notification> findTop50ByReceiverOrderByCreatedAtDesc(User receiver);
    List<Notification> findByReceiverAndReadIsFalse(User receiver);
}
