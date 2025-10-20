
package bookapp.bookappback.review.controller;

import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.entity.Book;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.review.dto.ReviewRequest;
import bookapp.bookappback.review.entity.BookReview;
import bookapp.bookappback.review.repository.BookReviewRepository;
import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BookReviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private BookRepository bookRepository;

    @Autowired
    private BookReviewRepository bookReviewRepository;

    private User testUser;
    private Book testBook;

    @BeforeEach
    void setup() {
        testUser = userRepository.save(new User("testuser@example.com", "password123", "테스트유저", null));

        KakaoBookDto kakaoBookDto = new KakaoBookDto();
        kakaoBookDto.setTitle("테스트 책");
        kakaoBookDto.setAuthors(java.util.List.of("테스트 저자"));
        kakaoBookDto.setPublisher("테스트 출판사");
        kakaoBookDto.setIsbn("9781234567890");
        kakaoBookDto.setDatetime("2024-01-01T00:00:00.000+09:00");
        kakaoBookDto.setContents("테스트 콘텐츠");
        kakaoBookDto.setPrice(10000);
        kakaoBookDto.setSalePrice(9000);
        kakaoBookDto.setThumbnail("http://example.com/thumbnail.jpg");
        kakaoBookDto.setUrl("http://example.com/book");

        testBook = bookRepository.save(Book.fromKakaoApiResponse(kakaoBookDto));
        
        // testBook.getId()가 null이 아닌지 여기서 한번 더 확인합니다.
        assertNotNull(testBook.getId(), "DB에 책이 저장되고 ID가 생성되어야 합니다.");
    }

    @Test
    @DisplayName("리뷰 작성 성공 테스트")
    void createReviewSuccessTest() throws Exception {
        // given
        // 1. 수동으로 인증 객체 생성
        UserDetailsImpl userDetails = new UserDetailsImpl(testUser);
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities());

        // 2. SecurityContext에 인증 객체 설정
        SecurityContextHolder.getContext().setAuthentication(authentication);

        ReviewRequest reviewRequest = new ReviewRequest();
        reviewRequest.setComment("정말 재미있는 책입니다!");
        reviewRequest.setRating(5.0);
        String jsonRequest = objectMapper.writeValueAsString(reviewRequest);

        // when & then
        mockMvc.perform(post("/api/books/" + testBook.getId() + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonRequest))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("리뷰 작성 실패 - 인증 없음")
    void createReview_unauthorized() throws Exception {
        ReviewRequest reviewRequest = new ReviewRequest();
        reviewRequest.setComment("인증 없이 작성 시도");
        reviewRequest.setRating(4.0);

        mockMvc.perform(post("/api/books/" + testBook.getId() + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reviewRequest)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("리뷰 작성 실패 - 존재하지 않는 책")
    void createReview_bookNotFound() throws Exception {
        UserDetailsImpl userDetails = new UserDetailsImpl(testUser);
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(authentication);

        ReviewRequest reviewRequest = new ReviewRequest();
        reviewRequest.setComment("없는 책 리뷰 작성 시도");
        reviewRequest.setRating(5.0);

        mockMvc.perform(post("/api/books/99999/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reviewRequest)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("책에 대한 리뷰 목록 조회 성공")
    void getReviewsByBook_success() throws Exception {
        // given: 리뷰 데이터 하나 생성
        UserDetailsImpl userDetails = new UserDetailsImpl(testUser);
        BookReview review = new BookReview();
        review.setBook(testBook);
        review.setUser(testUser);
        review.setComment("테스트 리뷰입니다");
        review.setRating(4.5);
        bookReviewRepository.save(review);

        // when & then
        mockMvc.perform(get("/api/books/" + testBook.getId() + "/reviews")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].comment").value("테스트 리뷰입니다"));
    }

    @DisplayName("리뷰 목록 조회 실패 - 리뷰 없음")
    void getReviewsByBook_notFound() throws Exception {
        mockMvc.perform(get("/api/books/" + testBook.getId() + "/reviews")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("REVIEW_NOT_FOUND"));
    }
}
