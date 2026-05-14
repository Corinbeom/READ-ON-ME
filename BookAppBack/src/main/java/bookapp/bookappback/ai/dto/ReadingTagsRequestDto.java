package bookapp.bookappback.ai.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class ReadingTagsRequestDto {
    private List<String> isbns;
    private int limit;
}
