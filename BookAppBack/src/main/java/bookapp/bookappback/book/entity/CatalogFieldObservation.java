package bookapp.bookappback.book.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.HexFormat;

@Entity
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CatalogFieldObservation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String isbn;
    private String fieldName;
    private String provider;
    private String sourceRef;
    private String policyVersion;
    private LocalDate checkedOn;
    private String digest;

    public CatalogFieldObservation(String isbn, String field, String value) {
        this.isbn = isbn;
        this.fieldName = field;
        this.provider = "KAKAO";
        this.sourceRef = "https://dapi.kakao.com/v3/search/book?target=isbn&query=" + isbn;
        this.policyVersion = "catalog-display-2026-11-20";
        this.checkedOn = LocalDate.now();
        try {
            this.digest = HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
