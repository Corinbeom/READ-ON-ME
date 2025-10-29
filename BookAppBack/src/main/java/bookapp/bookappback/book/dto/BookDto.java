package bookapp.bookappback.book.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class BookDto {
    private Long id;
    private String title;
    private String authors;
    private String publisher;
    private String thumbnail;
    private String isbn13;
    // Add other fields if necessary for display in the frontend
}
