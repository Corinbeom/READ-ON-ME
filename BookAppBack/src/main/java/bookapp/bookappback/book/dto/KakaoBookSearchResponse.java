package bookapp.bookappback.book.dto;

import lombok.Getter;
import lombok.Setter;
import java.util.List;
import java.util.Objects;

@Getter
@Setter
public class KakaoBookSearchResponse {
    private KakaoMeta meta;
    private List<KakaoBookDto> documents;

    public KakaoBookSearchResponse() {}

    public KakaoBookSearchResponse(KakaoMeta meta, List<KakaoBookDto> documents) {
        this.meta = meta;
        this.documents = documents;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        KakaoBookSearchResponse that = (KakaoBookSearchResponse) o;
        return Objects.equals(meta, that.meta) && Objects.equals(documents, that.documents);
    }

    @Override
    public int hashCode() {
        return Objects.hash(meta, documents);
    }
}
