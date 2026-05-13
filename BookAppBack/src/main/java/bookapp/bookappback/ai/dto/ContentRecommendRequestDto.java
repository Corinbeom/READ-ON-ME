package bookapp.bookappback.ai.dto;

import bookapp.bookappback.userbookstatus.dto.UserBookIsbnDto;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class ContentRecommendRequestDto {
    private List<UserBookIsbnDto> userBooks;
    private int limit;
}
