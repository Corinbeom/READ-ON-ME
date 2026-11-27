package bookapp.bookappback.recommendation;

import bookapp.bookappback.ai.service.ReadingKeywordService;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.recommendation.dto.HomeRecommendations;
import bookapp.bookappback.recommendation.service.HomeRecommendationService;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.entity.UserBookStatus;
import bookapp.bookappback.userbookstatus.repository.UserBookStatusRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static bookapp.bookappback.userbookstatus.entity.ReadingStatus.*;
import java.util.List;

@DataJpaTest
@ActiveProfiles("test")
class HomeRecommendationTest {
    @Autowired TestEntityManager db;
    @Autowired UserBookStatusRepository shelves;

    @Test
    void matchesTwoReadEditionsAndExcludesWishlistFromBothEvidenceAndResults() {
        var me = reader("me");
        var neighbor = reader("neighbor");
        var other = reader("other");
        var first = edition("9780306406157");
        var second = edition("9780451524935");
        var wish = edition("9788925588735");
        var pick = edition("9791187743002");
        var unrelated = edition("9788972219651");
        var keywords = mock(ReadingKeywordService.class);
        var service = new HomeRecommendationService(shelves, keywords);
        assertEquals(HomeRecommendations.empty(), service.forUser(me.getId()));
        save(me, wish, TO_READ);
        assertEquals(HomeRecommendations.empty(), service.forUser(me.getId()));
        verifyNoInteractions(keywords);
        save(me, first, COMPLETED);
        save(me, second, READING);
        save(neighbor, first, READING);
        save(neighbor, second, COMPLETED);
        save(neighbor, pick, READING);
        save(neighbor, wish, COMPLETED);
        save(neighbor, unrelated, TO_READ);
        save(other, first, READING);
        save(other, second, TO_READ);
        save(other, unrelated, COMPLETED);
        db.flush();
        service.forUser(me.getId());
        verify(keywords).getHomePicks(
                argThat(read -> read.size() == 2 && read.containsAll(List.of(first.getIsbn13(), second.getIsbn13()))),
                argThat(owned -> owned.size() == 3 && owned.contains(wish.getIsbn13())),
                eq(List.of(pick.getIsbn13())));
    }

    private Book edition(String isbn) {
        var book = new Book();
        book.setIsbn13(isbn);
        return db.persist(book);
    }

    private User reader(String name) {
        return db.persist(new User(name + "@example.test", "unused", name, null, null));
    }

    private void save(User user, Book book, ReadingStatus status) {
        var entry = new UserBookStatus();
        entry.setUser(user);
        entry.setBook(book);
        entry.setStatus(status);
        db.persist(entry);
    }
}
