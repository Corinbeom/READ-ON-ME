package bookapp.bookappback.book.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import bookapp.bookappback.book.dto.LibraryBookDto;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "popular_naru_books")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PopularNaruBook {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 0=전체, 10/20/30/40/50/60=연령대 */
    @Column(nullable = false)
    private Integer ageGroup;

    @Column(nullable = false)
    private int ranking;

    @Column(length = 500)
    private String bookName;

    @Column(length = 500)
    private String authors;

    @Column(length = 255)
    private String publisher;

    @Column(length = 50)
    private String publicationYear;

    @Column(length = 20)
    private String isbn13;

    @Column(length = 100)
    private String classNm;

    @JsonIgnore
    @Column(name = "book_image_url", insertable = false, updatable = false)
    private String legacyCover;

    private boolean archived;

    @Column(length = 20)
    private String loanCount;

    @Column(nullable = false)
    private LocalDateTime fetchedAt;

    public LibraryBookDto toDto(String coverUrl) {
        return new LibraryBookDto(
                String.valueOf(ranking),
                bookName,
                authors,
                publisher,
                publicationYear,
                isbn13,
                classNm,
                loanCount,
                ageGroup,
                fetchedAt.toLocalDate(),
                "도서관 정보나루",
                coverUrl
        );
    }
}
