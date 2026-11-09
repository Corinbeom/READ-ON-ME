package bookapp.bookappback.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AiSearchRequestDto {
    @NotBlank(message = "검색어를 입력해주세요")
    @Size(max = 500, message = "검색어는 500자 이하로 입력해주세요")
    private String query;
}
