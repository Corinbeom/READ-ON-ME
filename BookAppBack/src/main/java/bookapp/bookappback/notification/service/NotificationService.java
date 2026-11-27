package bookapp.bookappback.notification.service;

import bookapp.bookappback.common.exception.AppException;
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
import org.springframework.context.SmartLifecycle;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService implements SmartLifecycle {

    private static final long DEFAULT_TIMEOUT = 60L * 60 * 1000; // 1시간

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    private final Map<Long, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    private volatile boolean running;

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public synchronized void start() {
        running = true;
    }

    // The default SmartLifecycle phase stops before Tomcat waits for open requests.
    @Override
    public synchronized void stop() {
        running = false;
        emitters.values().forEach(streams -> streams.forEach(SseEmitter::complete));
        emitters.clear();
    }

    public synchronized SseEmitter subscribe(Long userId) {
        if (!running) {
            throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "NOTIFICATION_STREAM_UNAVAILABLE",
                    "알림 연결을 잠시 후 다시 시도해 주세요.");
        }
        SseEmitter emitter = new SseEmitter(DEFAULT_TIMEOUT);
        emitter.onCompletion(() -> removeEmitter(userId, emitter));
        emitter.onTimeout(() -> removeEmitter(userId, emitter));
        emitter.onError(ex -> removeEmitter(userId, emitter));

        try {
            emitter.send(SseEmitter.event().name("INIT").data(Map.of("aiSearchCompletion", true)));
        } catch (IOException e) {
            log.warn("Failed to send initial SSE event to user {}", userId, e);
            emitter.completeWithError(e);
            return emitter;
        }

        emitters.compute(userId, (key, list) -> {
            if (list == null) list = new CopyOnWriteArrayList<>();
            list.add(emitter);
            return list;
        });
        return emitter;
    }

    private void removeEmitter(Long userId, SseEmitter emitter) {
        emitters.computeIfPresent(userId, (key, list) -> {
            list.remove(emitter);
            return list.isEmpty() ? null : list;
        });
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
        send(notification.getReceiver().getId(), () -> SseEmitter.event()
                .id(String.valueOf(notification.getId()))
                .name("notification")
                .data(new NotificationResponse(notification)));
    }

    public void notifyAiSearchFinished(Long userId, UUID jobId) {
        send(userId, () -> SseEmitter.event().name("ai-search-finished").data(jobId.toString()));
    }

    private void send(Long userId, Supplier<SseEmitter.SseEventBuilder> event) {
        List<SseEmitter> emitterList = emitters.get(userId);
        if (emitterList == null || emitterList.isEmpty()) {
            return;
        }

        for (SseEmitter emitter : emitterList) {
            try {
                emitter.send(event.get());
            } catch (IOException | IllegalStateException e) {
                removeEmitter(userId, emitter);
            }
        }
    }
}
