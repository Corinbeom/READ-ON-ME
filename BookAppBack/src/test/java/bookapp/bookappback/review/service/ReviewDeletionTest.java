package bookapp.bookappback.review.service;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.service.BookService;
import bookapp.bookappback.notification.entity.Notification;
import bookapp.bookappback.notification.service.NotificationService;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
@Import({BookReviewService.class, NotificationService.class})
class ReviewDeletionTest {
    @Autowired TestEntityManager db;
    @Autowired BookReviewService service;
    @MockitoBean BookService catalog;

    @Test
    void deletingALikedReviewKeepsTheNotificationAndRemovesTheLike() {
        User author = db.persist(new User("owner@example.test", "unused", "author", null, null));
        User reader = db.persist(new User("reader@example.test", "unused", "reader", null, null));
        Book book = new Book();
        book.setIsbn13("9788925588735");
        db.persist(book);
        BookReview review = new BookReview();
        review.setBook(book);
        review.setUser(author);
        db.persistAndFlush(review);

        service.toggleReviewLike(review.getId(), reader.getId());
        db.flush();
        db.clear();
        service.deleteReview(review.getId(), author.getId());
        db.flush();
        db.clear();

        assertNull(db.find(BookReview.class, review.getId()));
        var em = db.getEntityManager();
        assertEquals(0L, em.createQuery("select count(l) from ReviewLike l where l.review.id = :id", Long.class)
                .setParameter("id", review.getId()).getSingleResult());
        Notification notice = em.createQuery("select n from Notification n where n.receiver.id = :id", Notification.class)
                .setParameter("id", author.getId()).getSingleResult();
        assertNull(notice.getReview());
        assertEquals(reader.getId(), notice.getSender().getId());
    }
}
