package bookapp.bookappback.review.entity;

import bookapp.bookappback.user.entity.User;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "review_like", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"user_id", "review_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class ReviewLike {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "review_id", nullable = false)
    private BookReview review;

    public ReviewLike(User user, BookReview review) {
        this.user = user;
        this.review = review;
    }
}
