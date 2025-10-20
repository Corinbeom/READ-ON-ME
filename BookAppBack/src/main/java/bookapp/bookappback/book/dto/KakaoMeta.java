package bookapp.bookappback.book.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;
import java.util.Objects;

@Getter
@Setter
public class KakaoMeta {
    @JsonProperty("total_count")
    private int totalCount;
    
    @JsonProperty("pageable_count")
    private int pageableCount;
    
    @JsonProperty("is_end")
    private boolean isEnd;

    public KakaoMeta() {}

    public KakaoMeta(int totalCount, int pageableCount, boolean isEnd) {
        this.totalCount = totalCount;
        this.pageableCount = pageableCount;
        this.isEnd = isEnd;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        KakaoMeta kakaoMeta = (KakaoMeta) o;
        return totalCount == kakaoMeta.totalCount && 
               pageableCount == kakaoMeta.pageableCount && 
               isEnd == kakaoMeta.isEnd;
    }

    @Override
    public int hashCode() {
        return Objects.hash(totalCount, pageableCount, isEnd);
    }
}