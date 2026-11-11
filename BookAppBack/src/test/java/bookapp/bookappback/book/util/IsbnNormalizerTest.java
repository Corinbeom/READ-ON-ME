package bookapp.bookappback.book.util;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.entity.Book;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class IsbnNormalizerTest {

    @Test
    void convertsValidIsbn10WhenKakaoAlsoReturnsInvalidThirteenDigitValue() {
        assertEquals("9781127241347", IsbnNormalizer.toIsbn13("1127241346 1400000309490"));
        assertEquals("9781127221998", IsbnNormalizer.toIsbn13("112722199X 1400000290729"));
    }

    @Test
    void prefersValidIsbn13AndRejectsUnverifiableValues() {
        assertEquals("9791127241346", IsbnNormalizer.toIsbn13("1127241346 9791127241346"));
        assertThrows(IllegalArgumentException.class, () -> IsbnNormalizer.toIsbn13("1400000309490"));
    }

    @Test
    void convertsCanonical978IsbnBackToValidIsbn10() {
        assertEquals("1127241346", IsbnNormalizer.toIsbn10("9781127241347"));
        assertEquals("112722199X", IsbnNormalizer.toIsbn10("9781127221998"));
        assertEquals(null, IsbnNormalizer.toIsbn10("1400000309490"));
    }

    @Test
    void kakaoBookEntityStoresCanonicalIsbn() {
        KakaoBookDto dto = new KakaoBookDto();
        dto.setTitle("플랫랜드");
        dto.setIsbn("1127241346 1400000309490");

        Book book = Book.fromKakaoApiResponse(dto);

        assertEquals("1127241346", book.getIsbn10());
        assertEquals("9781127241347", book.getIsbn13());
    }
}
