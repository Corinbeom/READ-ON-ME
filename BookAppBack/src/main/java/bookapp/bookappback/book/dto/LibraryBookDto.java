package bookapp.bookappback.book.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class LibraryBookDto {

    @JsonProperty("ranking")
    private String ranking;

    @JsonProperty("bookname")
    private String bookName;

    @JsonProperty("authors")
    private String authors;

    @JsonProperty("publisher")
    private String publisher;

    @JsonProperty("publication_year")
    private String publicationYear;

    @JsonProperty("isbn13")
    private String isbn13;

    @JsonProperty("class_nm")
    private String classNm;

    @JsonProperty("bookImageURL")
    private String bookImageUrl;

    @JsonProperty("loan_count")
    private String loanCount;
}
