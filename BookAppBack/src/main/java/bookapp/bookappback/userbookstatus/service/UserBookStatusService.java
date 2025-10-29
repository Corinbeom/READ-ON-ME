package bookapp.bookappback.userbookstatus.service;

import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.common.exception.BookExceptions;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.entity.UserBookStatus;
import bookapp.bookappback.userbookstatus.repository.UserBookStatusRepository;
import bookapp.bookappback.userbookstatus.dto.UserLibraryResponse;
import bookapp.bookappback.book.dto.BookDto; // Import BookDto
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserBookStatusService {

    private final UserBookStatusRepository userBookStatusRepository;
    private final UserRepository userRepository;
    private final BookRepository bookRepository;

    public UserBookStatus updateStatus(String userEmail, Long bookId, ReadingStatus status) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new UserExceptions.EmailNotFoundException(userEmail));

        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookExceptions.InvalidBookIdException(bookId));

        UserBookStatus userBookStatus = userBookStatusRepository.findByUserIdAndBookId(user.getId(), bookId)
                .orElseGet(UserBookStatus::new);

        userBookStatus.setUser(user);
        userBookStatus.setBook(book);
        userBookStatus.setStatus(status);

        return userBookStatusRepository.save(userBookStatus);
    }

    public UserLibraryResponse getUserLibrary(String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new UserExceptions.EmailNotFoundException(userEmail));

        List<UserBookStatus> userBookStatuses = userBookStatusRepository.findByUserId(user.getId());

        List<BookDto> toReadBooks = userBookStatuses.stream()
                .filter(ubs -> ubs.getStatus() == ReadingStatus.TO_READ)
                .map(UserBookStatus::getBook)
                .map(this::convertToDto) // Map Book to BookDto
                .collect(Collectors.toList());

        List<BookDto> readingBooks = userBookStatuses.stream()
                .filter(ubs -> ubs.getStatus() == ReadingStatus.READING)
                .map(UserBookStatus::getBook)
                .map(this::convertToDto) // Map Book to BookDto
                .collect(Collectors.toList());

        List<BookDto> completedBooks = userBookStatuses.stream()
                .filter(ubs -> ubs.getStatus() == ReadingStatus.COMPLETED)
                .map(UserBookStatus::getBook)
                .map(this::convertToDto) // Map Book to BookDto
                .collect(Collectors.toList());

        return new UserLibraryResponse(toReadBooks, readingBooks, completedBooks);
    }

    private BookDto convertToDto(Book book) {
        return new BookDto(
                book.getId(),
                book.getTitle(),
                book.getAuthors(),
                book.getPublisher(),
                book.getThumbnail(),
                book.getIsbn13()
        );
    }
}
