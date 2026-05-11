package bookapp.bookappback.common.util;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.book.service.KakaoBookService;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.web.reactive.function.client.WebClient;
import java.util.Map;

@Component
@Slf4j
public class DataLoader implements CommandLineRunner {

    private final KakaoBookService kakaoBookService;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final WebClient.Builder webClientBuilder;
    private final String aiBaseUrl;

    public DataLoader(
            KakaoBookService kakaoBookService,
            BookRepository bookRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            WebClient.Builder webClientBuilder,
            @Value("${ai.base-url}") String aiBaseUrl
    ) {
        this.kakaoBookService = kakaoBookService;
        this.bookRepository = bookRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.webClientBuilder = webClientBuilder;
        this.aiBaseUrl = aiBaseUrl;
    }

    @Override
    public void run(String... args) throws Exception {

        if (userRepository.findByEmail("test@test.com").isEmpty()) {
            User testuser = new User();
            testuser.setEmail("test@test.com");
            testuser.setPassword(passwordEncoder.encode("1111"));
            testuser.setNickname("tester");
            testuser.setBirthYear(2000);
            testuser.setCreatedAt(LocalDateTime.now());
            userRepository.save(testuser);
            log.info("테스트 유저 'test@test.com 생성 완료");
        }

        if (bookRepository.count() > 0) {
            log.info("===== [DataLoader] DB에 도서 데이터 존재. 도서 시딩·임베딩·코퍼스 구축 스킵. =====");
            return;
        }

        log.info("===== 📚 초기 인기 도서 데이터 로드 시작 =====");

        List<String> initialTitles = List.of(
                "미움받을 용기", "해리포터와 마법사의 돌", "나의 라임 오렌지나무", "1984", "어린 왕자",
                "사피엔스", "총, 균, 쇠", "노르웨이의 숲", "인간 실격", "달러구트 꿈 백화점",
                "불편한 편의점", "그릿", "죽고 싶지만 떡볶이는 먹고 싶어", "보통의 존재", "미생",
                "죽음에 관하여", "이기적 유전자", "지금, 이 순간을 살아라", "연금술사", "어둠의 왼손"
        );

        for (String title : initialTitles) {
            try {
                KakaoBookSearchResponse response = kakaoBookService.searchBooks(title).block();
                if (response == null || response.getDocuments().isEmpty()) continue;

                KakaoBookDto dto = response.getDocuments().get(0);
                String[] isbns = dto.getIsbn().split(" ");
                String isbn13 = isbns.length > 1 ? isbns[1] : isbns[0];

                boolean exists = bookRepository.findByIsbn13(isbn13).stream().findFirst().isPresent();
                if (!exists) {
                    Book saved = bookRepository.save(Book.fromKakaoApiResponse(dto));
                    triggerEmbedding(saved);
                }
            } catch (Exception e) {
                log.error("❌ [{}] 도서 저장 중 오류 발생: {}", title, e.getMessage());
            }
        }

        log.info("===== ✅ 초기 인기 도서 데이터 로드 완료 =====");

        // =====================================
        // 🚀 AI 도서 데이터 구축 요청 (FastAPI)
        // =====================================
        log.info("===== 🚀 AI 기반 도서 데이터 구축 요청 시작 =====");

        List<String> keywords = List.of(
                "소설", "문학", "철학", "심리", "SF", "판타지", "경제", "역사", "시집"
        );

        WebClient webClient = webClientBuilder.baseUrl(aiBaseUrl).build();

        webClient.post()
                .uri("/api/books/fetch-and-filter")
                .bodyValue(Map.of("keywords", keywords))
                .retrieve()
                .bodyToMono(String.class)
                .doOnSuccess(response -> log.info("✅ FastAPI 응답: {}", response))
                .doOnError(error -> log.error("❌ FastAPI 요청 실패: {}", error.getMessage()))
                .subscribe();

        log.info("===== ✉️ FastAPI에 데이터 구축 요청을 비동기적으로 전송했습니다. =====");
    }

    private void triggerEmbedding(Book book) {
        try {
            WebClient client = webClientBuilder.baseUrl(aiBaseUrl).build();
            Map<String, Object> body = Map.of(
                    "title", book.getTitle(),
                    "contents", book.getContents() == null ? "" : book.getContents(),
                    "isbn", book.getIsbn13(),
                    "authors", book.getAuthors() == null ? new String[0] : book.getAuthors().split(","),
                    "publisher", book.getPublisher() == null ? "" : book.getPublisher(),
                    "thumbnail", book.getThumbnail() == null ? "" : book.getThumbnail()
            );

            client.post()
                    .uri("/api/books/embed-single")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .doOnSuccess(res -> log.info("초기 데이터 임베딩 성공: {}", book.getIsbn13()))
                    .doOnError(err -> log.error("초기 데이터 임베딩 실패 [{}]: {}", book.getIsbn13(), err.getMessage()))
                    .subscribe();
        } catch (Exception e) {
            log.error("초기 데이터 임베딩 호출 중 오류 [{}]: {}", book.getIsbn13(), e.getMessage());
        }
    }
}
