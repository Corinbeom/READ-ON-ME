package bookapp.bookappback.review.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ReviewRequest {
    private String comment;
    private double rating;
}