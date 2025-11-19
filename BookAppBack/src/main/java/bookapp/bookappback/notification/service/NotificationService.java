package bookapp.bookappback.notification.service;

import bookapp.bookappback.common.exception.NotificationExceptions;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.notification.dto.NotificationResponse;
import bookapp.bookappback.notification.entity.Notification;
import bookapp.bookappback.notification.entity.NotificationType;
import bookapp.bookappback.notification.repository.NotificationRepository;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private static final long DEFAULT_TIMEOUT = 60L * 60 * 1000; // 1시간

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    private final Map<Long, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(Long userId) {
        SseEmitter emitter = new SseEmitter(DEFAULT_TIMEOUT);
        emitters.computeIfAbsent(userId, key -> new CopyOnWriteArrayList<>()).add(emitter);

        emitter.onCompletion(() -> removeEmitter(userId, emitter));
        emitter.onTimeout(() -> removeEmitter(userId, emitter));
        emitter.onError(ex -> removeEmitter(userId, emitter));

        try {
            emitter.send(SseEmitter.event().name("INIT").data("connected"));
        } catch (IOException e) {
            removeEmitter(userId, emitter);
            log.warn("Failed to send initial SSE event to user {}", userId, e);
        }

        return emitter;
    }

    private void removeEmitter(Long userId, SseEmitter emitter) {
        List<SseEmitter> emitterList = emitters.get(userId);
        if (emitterList == null) {
            return;
        }
        emitterList.remove(emitter);
        if (emitterList.isEmpty()) {
            emitters.remove(userId);
        }
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotifications(Long userId) {
        User receiver = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        return notificationRepository.findTop50ByReceiverOrderByCreatedAtDesc(receiver)
                .stream()
                .map(NotificationResponse::new)
                .collect(Collectors.toList());
    }

    @Transactional
    public void markAsRead(Long notificationId, Long userId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new NotificationExceptions.NotificationNotFoundException(notificationId));

        if (!notification.getReceiver().getId().equals(userId)) {
            throw new NotificationExceptions.NotificationAccessDeniedException();
        }

        notification.markAsRead();
    }

    @Transactional
    public void markAllAsRead(Long userId) {
        User receiver = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        notificationRepository.findByReceiverAndReadIsFalse(receiver)
                .forEach(Notification::markAsRead);
    }

    @Transactional
    public void notifyReviewLiked(BookReview review, User likedBy) {
        Long ownerId = review.getUser().getId();
        if (ownerId == null || ownerId.equals(likedBy.getId())) {
            return; // 본인 리뷰에 대한 좋아요는 알림 제외
        }

        Notification notification = Notification.builder()
                .receiver(review.getUser())
                .sender(likedBy)
                .review(review)
                .type(NotificationType.REVIEW_LIKED)
                .message(likedBy.getNickname() + "님이 내 리뷰를 좋아합니다.")
                .build();

        notificationRepository.save(notification);
        dispatch(notification);
    }

    private void dispatch(Notification notification) {
        List<SseEmitter> emitterList = emitters.get(notification.getReceiver().getId());
        if (emitterList == null || emitterList.isEmpty()) {
            return;
        }

        List<SseEmitter> deadEmitters = new ArrayList<>();
        for (SseEmitter emitter : emitterList) {
            try {
                emitter.send(SseEmitter.event()
                        .id(String.valueOf(notification.getId()))
                        .name("notification")
                        .data(new NotificationResponse(notification)));
            } catch (IOException e) {
                deadEmitters.add(emitter);
            }
        }

        deadEmitters.forEach(emitter -> removeEmitter(notification.getReceiver().getId(), emitter));
    }
}
