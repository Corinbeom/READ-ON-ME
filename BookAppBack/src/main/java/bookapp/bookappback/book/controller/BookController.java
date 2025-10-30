package bookapp.bookappback.book.controller;

import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.service.BookService;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService bookService;

    @Autowired
    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    // ✅ 카카오 API를 통한 책 검색
    @GetMapping("/search")
    public ResponseEntity<KakaoBookSearchResponse> searchBooks(
            @RequestParam String query,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "accuracy") String sort,
            @RequestParam(required = false) String target
    ) {
        KakaoBookSearchResponse response = bookService.searchBooksFromKakao(query, page, size, sort, target);
        return ResponseEntity.ok(response);
    }

    // ✅ ISBN으로 특정 책 상세 정보 조회
    @GetMapping("/detail/{isbn}")
    public ResponseEntity<Book> getBookDetail(@PathVariable String isbn) {
        Book book = bookService.getBookByIsbn(isbn);
        return ResponseEntity.ok(book);
    }

    @GetMapping("/{isbn}/editions")
    public ResponseEntity<List<Book>> getBookEditions(@PathVariable String isbn) {
        List<Book> editions = bookService.getBookEditions(isbn);
        return ResponseEntity.ok(editions);
    }

    // ✅ 인기 도서 조회
    @GetMapping("/popular")
    @Operation(summary = "메인화면 인기책", description = "메인화면에 인기 책을 렌더링해주는 메소드.")
    public ResponseEntity<List<Book>> getPopularBooks() {
        List<Book> books = bookService.getPopularBooks(20);
        return ResponseEntity.ok(books);
    }

    // ✅ 테스트용 엔드포인트
    @GetMapping("/test")
    public Map<String, String> test() {
        Map<String, String> response = new HashMap<>();
        response.put("message", "Book API가 정상 작동합니다! 📚");
        response.put("endpoints", "/api/books/search?query=미움받을용기");
        return response;
    }

    @PostMapping("/details")
    public ResponseEntity<List<Book>> getBookDetailsByIds(@RequestBody List<Long> ids) {
        List<Book> books = bookService.getBooksByIds(ids);
        return ResponseEntity.ok(books);
    }
}
