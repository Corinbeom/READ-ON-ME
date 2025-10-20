package bookapp.bookappback.review.dto;

import bookapp.bookappback.review.entity.BookReview;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class ReviewResponse {
    private Long id;
    private String comment;
    private double rating;
    private String author;
    private LocalDateTime createdAt;

    public ReviewResponse(BookReview bookReview) {
        this.id = bookReview.getId();
        this.comment = bookReview.getComment();
        this.rating = bookReview.getRating();
        this.author = bookReview.getUser().getNickname();
        this.createdAt = bookReview.getCreatedAt();
    }
}
