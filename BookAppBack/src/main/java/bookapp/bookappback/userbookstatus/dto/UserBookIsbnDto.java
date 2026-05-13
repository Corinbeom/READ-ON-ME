package bookapp.bookappback.userbookstatus.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class UserBookIsbnDto {
    private String isbn;
    private String status;  // "COMPLETED" | "READING" | "TO_READ"
}
