package bookapp.bookappback.userbookstatus.dto;

import bookapp.bookappback.book.dto.BookDto; // Import BookDto
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UserLibraryResponse {
    private List<BookDto> toReadBooks;
    private List<BookDto> readingBooks;
    private List<BookDto> completedBooks;
}
