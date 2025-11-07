package bookapp.bookappback.userbookstatus.service;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import bookapp.bookappback.userbookstatus.dto.UserLibraryResponse;
import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.entity.UserBookStatus;
import bookapp.bookappback.userbookstatus.repository.UserBookStatusRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserBookStatusServiceTest {

    @Mock private UserBookStatusRepository userBookStatusRepository;
    @Mock private UserRepository userRepository;
    @Mock private BookRepository bookRepository;

    @InjectMocks
    private UserBookStatusService userBookStatusService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    @DisplayName("사용자 서재 상태 업데이트 성공")
    void updateStatus_success() {
        User user = new User("reader@test.com", "encoded", "reader", null);
        user.setId(1L);
        Book book = new Book();
        book.setId(100L);

        when(userRepository.findByEmail("reader@test.com")).thenReturn(Optional.of(user));
        when(bookRepository.findById(100L)).thenReturn(Optional.of(book));
        when(userBookStatusRepository.findByUserIdAndBookId(1L, 100L)).thenReturn(Optional.empty());

        UserBookStatus saved = new UserBookStatus();
        saved.setUser(user);
        saved.setBook(book);
        saved.setStatus(ReadingStatus.READING);
        when(userBookStatusRepository.save(any(UserBookStatus.class))).thenReturn(saved);

        UserBookStatus result = userBookStatusService.updateStatus("reader@test.com", 100L, ReadingStatus.READING);

        assertEquals(ReadingStatus.READING, result.getStatus());
        verify(userBookStatusRepository, times(1)).save(any(UserBookStatus.class));
    }

    @Test
    @DisplayName("사용자 서재 조회 - 상태별 분류")
    void getUserLibrary_success() {
        User user = new User("reader@test.com", "encoded", "reader", null);
        user.setId(1L);
        when(userRepository.findByEmail("reader@test.com")).thenReturn(Optional.of(user));

        Book toRead = buildBook(10L, "읽고 싶은 책");
        Book reading = buildBook(11L, "읽는 중 책");
        Book completed = buildBook(12L, "완독 책");

        UserBookStatus u1 = buildStatus(user, toRead, ReadingStatus.TO_READ);
        UserBookStatus u2 = buildStatus(user, reading, ReadingStatus.READING);
        UserBookStatus u3 = buildStatus(user, completed, ReadingStatus.COMPLETED);

        when(userBookStatusRepository.findByUserId(1L)).thenReturn(List.of(u1, u2, u3));

        UserLibraryResponse response = userBookStatusService.getUserLibrary("reader@test.com");

        assertEquals(1, response.getToReadBooks().size());
        assertEquals(1, response.getReadingBooks().size());
        assertEquals(1, response.getCompletedBooks().size());
        assertEquals("읽고 싶은 책", response.getToReadBooks().get(0).getTitle());
    }

    @Test
    @DisplayName("모든 사용자 서재 집계 - READING/COMPLETED만 포함")
    void getAllUserLibraries_success() {
        User user1 = new User("u1@test.com", "encoded", "u1", null);
        user1.setId(1L);
        User user2 = new User("u2@test.com", "encoded", "u2", null);
        user2.setId(2L);

        UserBookStatus s1 = buildStatus(user1, buildBook(1L, "책1"), ReadingStatus.READING);
        UserBookStatus s2 = buildStatus(user1, buildBook(2L, "책2"), ReadingStatus.COMPLETED);
        UserBookStatus s3 = buildStatus(user2, buildBook(3L, "책3"), ReadingStatus.TO_READ); // should be ignored

        when(userBookStatusRepository.findAll()).thenReturn(List.of(s1, s2, s3));

        Map<Long, List<Long>> result = userBookStatusService.getAllUserLibraries();

        assertEquals(1, result.size());
        assertEquals(2, result.get(1L).size());
        assertEquals(List.of(1L, 2L), result.get(1L));
        assertFalse(result.containsKey(2L));
    }

    @Test
    @DisplayName("사용자 미존재 시 예외 발생")
    void updateStatus_userNotFound() {
        when(userRepository.findByEmail("missing@test.com")).thenReturn(Optional.empty());

        assertThrows(UserExceptions.EmailNotFoundException.class,
                () -> userBookStatusService.updateStatus("missing@test.com", 1L, ReadingStatus.TO_READ));
    }

    @Test
    @DisplayName("도서 미존재 시 예외 발생")
    void updateStatus_bookNotFound() {
        User user = new User("reader@test.com", "encoded", "reader", null);
        user.setId(1L);
        when(userRepository.findByEmail("reader@test.com")).thenReturn(Optional.of(user));
        when(bookRepository.findById(100L)).thenReturn(Optional.empty());

        assertThrows(BookExceptions.InvalidBookIdException.class,
                () -> userBookStatusService.updateStatus("reader@test.com", 100L, ReadingStatus.TO_READ));
    }

    private Book buildBook(Long id, String title) {
        Book book = new Book();
        book.setId(id);
        book.setTitle(title);
        book.setAuthors("저자");
        book.setPublisher("출판사");
        book.setThumbnail("thumb");
        book.setIsbn13("ISBN-" + id);
        return book;
    }

    private UserBookStatus buildStatus(User user, Book book, ReadingStatus status) {
        UserBookStatus ubs = new UserBookStatus();
        ubs.setUser(user);
        ubs.setBook(book);
        ubs.setStatus(status);
        return ubs;
    }
}
