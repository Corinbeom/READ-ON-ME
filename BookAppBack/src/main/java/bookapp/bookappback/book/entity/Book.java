package bookapp.bookappback.book.entity;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.review.entity.BookReview;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.Objects;

@Entity
@Table(name = "books")
@Getter
@Setter
@NoArgsConstructor
public class Book {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "isbn13", unique = true, nullable = false)
    private String isbn13;

    @Column(name = "isbn10")
    private String isbn10;

    @Column(nullable = false)
    private String title;

    @Column(name = "group_title")
    private String groupTitle;

    @Column(columnDefinition = "TEXT")
    private String contents;

    private String authors;
    private String translators;
    private String publisher;
    private Integer price;

    @Column(name = "sale_price")
    private Integer salePrice;

    private String thumbnail;

    @Column(name = "publish_date")
    private LocalDate publishDate;

    private String url;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "book", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore // Add this annotation
    private List<BookReview> reviews = new ArrayList<>();

    @Column(name = "average_rating")
    private Double averageRating = 0.0;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public static Book fromKakaoApiResponse(KakaoBookDto dto) {
        Book book = new Book();
        String[] isbns = dto.getIsbn().split(" ");
        book.setIsbn10(isbns.length > 0 ? isbns[0] : null);
        book.setIsbn13(isbns.length > 1 ? isbns[1] : book.getIsbn10());
        book.setTitle(dto.getTitle());
        book.setGroupTitle(generateGroupTitle(dto.getTitle()));
        book.setContents(dto.getContents());
        book.setAuthors(dto.getAuthors() != null ? String.join(",", dto.getAuthors()) : null);
        book.setPublisher(dto.getPublisher());
        book.setTranslators(dto.getTranslators() != null ? String.join(",", dto.getTranslators()) : null);
        book.setPrice(dto.getPrice());
        book.setSalePrice(dto.getSalePrice());
        book.setThumbnail(dto.getThumbnail());
        if (dto.getDatetime() != null && !dto.getDatetime().isEmpty()) {
            book.setPublishDate(OffsetDateTime.parse(dto.getDatetime(), DateTimeFormatter.ISO_OFFSET_DATE_TIME).toLocalDate());
        }
        book.setUrl(dto.getUrl());
        return book;
    }

    public static String generateGroupTitle(String title) {
        if (title == null) return "";
        return title.toLowerCase()
                .replaceAll("\\(.*?\\)", "")
                .replaceAll("\\[.*?\\]", "")
                .replaceAll("[^a-zA-Z0-9가-힣]", "");
    }

    public void addReview(BookReview review) {
        reviews.add(review);
        review.setBook(this);
        updateAverageRating();
    }

    public void removeReview(BookReview review) {
        reviews.remove(review);
        review.setBook(null);
        updateAverageRating();
    }

    public void updateAverageRating() {
        this.averageRating = reviews.stream()
                .mapToDouble(BookReview::getRating)
                .average()
                .orElse(0.0);
    }
}