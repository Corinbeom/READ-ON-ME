package bookapp.bookappback.feedback;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/feedback")
public class FeedbackController {
    private final JdbcClient jdbc;

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void submit(@Valid @RequestBody Submission feedback) {
        jdbc.sql("INSERT INTO beta_feedback (category, message) VALUES (:category, :message)")
                .param("category", feedback.category())
                .param("message", feedback.message().strip())
                .update();
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public void malformedSubmission() {}

    public record Submission(
            @NotBlank @Pattern(regexp = "ERROR|DISCOVERY|USABILITY") String category,
            @NotBlank @Size(max = 1000) String message
    ) {}
}
