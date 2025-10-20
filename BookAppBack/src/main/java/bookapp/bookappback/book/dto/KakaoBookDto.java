package bookapp.bookappback.book.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;
import java.util.List;
import java.util.Objects;

@Getter
@Setter
public class KakaoBookDto {
    private String title;
    private String contents;
    private String url;
    private String isbn;
    private String datetime;
    private List<String> authors;
    private String publisher;
    private List<String> translators;
    private int price;
    
    @JsonProperty("sale_price")
    private int salePrice;
    
    private String thumbnail;
    private String status;

    public KakaoBookDto() {}

    public KakaoBookDto(String title, String contents, String url, String isbn, String datetime,
                       List<String> authors, String publisher, List<String> translators,
                       int price, int salePrice, String thumbnail, String status) {
        this.title = title;
        this.contents = contents;
        this.url = url;
        this.isbn = isbn;
        this.datetime = datetime;
        this.authors = authors;
        this.publisher = publisher;
        this.translators = translators;
        this.price = price;
        this.salePrice = salePrice;
        this.thumbnail = thumbnail;
        this.status = status;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        KakaoBookDto that = (KakaoBookDto) o;
        return price == that.price && salePrice == that.salePrice &&
               Objects.equals(title, that.title) && Objects.equals(contents, that.contents) &&
               Objects.equals(url, that.url) && Objects.equals(isbn, that.isbn) &&
               Objects.equals(datetime, that.datetime) && Objects.equals(authors, that.authors) &&
               Objects.equals(publisher, that.publisher) && Objects.equals(translators, that.translators) &&
               Objects.equals(thumbnail, that.thumbnail) && Objects.equals(status, that.status);
    }

    @Override
    public int hashCode() {
        return Objects.hash(title, contents, url, isbn, datetime, authors, publisher, 
                           translators, price, salePrice, thumbnail, status);
    }
}