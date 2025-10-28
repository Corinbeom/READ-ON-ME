package bookapp.bookappback.common.util;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.book.service.KakaoBookService;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Component
public class DataLoader implements CommandLineRunner {

    private final KakaoBookService kakaoBookService;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public DataLoader(KakaoBookService kakaoBookService, BookRepository bookRepository, UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.kakaoBookService = kakaoBookService;
        this.bookRepository = bookRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) throws Exception {

        User testuser = new User();
        testuser.setEmail("test@test.com");
        testuser.setPassword(passwordEncoder.encode("1111"));
        testuser.setNickname("tester");
        testuser.setCreatedAt(LocalDateTime.now());
        userRepository.save(testuser);

        List<String> initialTitles = List.of(
                "미움받을 용기",
                "해리포터와 마법사의 돌",
                "나의 라임 오렌지나무",
                "1984",
                "어린 왕자",
                "사피엔스",
                "총, 균, 쇠",
                "노르웨이의 숲",
                "인간 실격",
                "달러구트 꿈 백화점",
                "불편한 편의점",
                "그릿",
                "죽고 싶지만 떡볶이는 먹고 싶어",
                "보통의 존재",
                "미생",
                "죽음에 관하여",
                "이기적 유전자",
                "지금, 이 순간을 살아라",
                "연금술사",
                "어둠의 왼손"
        );

        for (String title : initialTitles) {
            KakaoBookSearchResponse response = kakaoBookService.searchBooks(title).block();
            if (response == null || response.getDocuments().isEmpty()) continue;

            KakaoBookDto dto = response.getDocuments().get(0);

            // ISBN13 추출
            String[] isbns = dto.getIsbn().split(" ");
            String isbn13 = isbns.length > 1 ? isbns[1] : isbns[0];

            // 이미 DB에 존재하는지 확인
            boolean exists = bookRepository.findByIsbn13(isbn13).stream().findFirst().isPresent();
            if (!exists) {
                bookRepository.save(Book.fromKakaoApiResponse(dto));
            }
        }
    }
}
