package bookapp.bookappback.review.dto;

import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.book.dto.BookDto; // Import BookDto
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class ReviewResponse {
    private Long id;
    private String comment;
    private double rating;
    private String author;
    private Long authorId;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;
    private long likeCount;
    private boolean isLikedByCurrentUser;
    private BookDto book; // Added book information

    public ReviewResponse(BookReview bookReview) {
        this.id = bookReview.getId();
        this.comment = bookReview.getComment();
        this.rating = bookReview.getRating();
        this.author = bookReview.getUser().getNickname();
        this.authorId = bookReview.getUser().getId();
        this.createdAt = bookReview.getCreatedAt();
        this.likeCount = 0; // 기본값
        this.isLikedByCurrentUser = false; // 기본값
        this.book = new BookDto( // Map Book entity to BookDto
                bookReview.getBook().getId(),
                bookReview.getBook().getTitle(),
                bookReview.getBook().getAuthors(),
                bookReview.getBook().getPublisher(),
                bookReview.getBook().getThumbnail(),
                bookReview.getBook().getIsbn13()
        );
    }

    public ReviewResponse(BookReview bookReview, long likeCount, boolean isLikedByCurrentUser) {
        this.id = bookReview.getId();
        this.comment = bookReview.getComment();
        this.rating = bookReview.getRating();
        this.author = bookReview.getUser().getNickname();
        this.authorId = bookReview.getUser().getId();
        this.createdAt = bookReview.getCreatedAt();
        this.likeCount = likeCount;
        this.isLikedByCurrentUser = isLikedByCurrentUser;
        this.book = new BookDto( // Map Book entity to BookDto
                bookReview.getBook().getId(),
                bookReview.getBook().getTitle(),
                bookReview.getBook().getAuthors(),
                bookReview.getBook().getPublisher(),
                bookReview.getBook().getThumbnail(),
                bookReview.getBook().getIsbn13()
        );
    }
}
