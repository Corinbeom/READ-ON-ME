package bookapp.bookappback.ai.service;

import bookapp.bookappback.ai.entity.AiSearchJob;
import bookapp.bookappback.ai.repository.AiSearchJobRepository;
import bookapp.bookappback.book.dto.KakaoBookDto;
import bookapp.bookappback.book.dto.KakaoBookSearchResponse;
import bookapp.bookappback.book.dto.LibraryBookDto;
import bookapp.bookappback.book.entity.PopularNaruBook;
import bookapp.bookappback.book.repository.BookRepository;
import bookapp.bookappback.book.repository.PopularNaruBookRepository;
import bookapp.bookappback.book.service.KakaoSearchCacheService;
import bookapp.bookappback.book.service.LibraryApiService;
import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.web.reactive.function.client.WebClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GalpiMaintenanceTest {
    @TestConfiguration
    static class Offline {
        @Bean AtomicInteger externalRequests() { return new AtomicInteger(); }
        @Bean WebClientCustomizer trapExternalRequests(AtomicInteger requests) {
            return builder -> builder.exchangeFunction(request -> {
                requests.incrementAndGet();
                return Mono.error(new AssertionError("Unexpected external request"));
            });
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired BookRepository books;
    @Autowired AiSearchJobRepository jobs;
    @Autowired AiSearchJobService worker;
    @Autowired PopularNaruBookRepository rankings;
    @Autowired JdbcTemplate jdbc;
    @Autowired AtomicInteger externalRequests;
    @MockBean KakaoSearchCacheService kakao;
    @MockBean LibraryApiService naru;

    @Test
    void detailLibraryAndReviewWorkWhileSearchAndRetriesStayClosed() throws Exception {
        var owner = users.save(new User("quarantine@example.com", "unused", "quarantine", null, null));
        var principal = new UserDetailsImpl(owner);
        String isbn = "9780306406157";
        var doc = new KakaoBookDto();
        doc.setIsbn(isbn);
        doc.setTitle("BLOCKED_KAKAO_TEST");
        when(kakao.searchBookByIsbn(isbn)).thenReturn(new KakaoBookSearchResponse(null, List.of(doc)));
        var detail = mvc.perform(get("/api/books/detail/" + isbn)).andExpect(status().isOk()).andReturn();
        long id = mapper.readTree(detail.getResponse().getContentAsByteArray()).get("id").asLong();
        mvc.perform(post("/api/library/" + id).with(user(principal)).param("status", "READING"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/books/" + id + "/review").with(user(principal)).contentType("application/json")
                .content("{\"comment\":\"읽었어요\",\"rating\":4}")).andExpect(status().isCreated());
        var oldJob = new AiSearchJob();
        oldJob.setId(UUID.randomUUID());
        oldJob.setUserId(owner.getId());
        oldJob.setIdempotencyKey("quarantine");
        oldJob.setQuery("test");
        oldJob.setStatus("QUEUED");
        oldJob.setCreatedAt(LocalDateTime.now());
        oldJob.setExpiresAt(LocalDateTime.now().plusDays(1));
        jobs.saveAndFlush(oldJob);
        long count = jobs.count();
        for (String endpoint : List.of("/api/ai/search", "/api/ai/jobs")) {
            mvc.perform(post(endpoint).with(user(principal)).contentType("application/json").content("{\"query\":\"test\"}"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.code").value("AI_SEARCH_MAINTENANCE"));
        }
        assertEquals(count, jobs.count());
        for (int restart = 0; restart < 2; restart++) {
            worker.recover();
            worker.dispatch();
            assertEquals("FAILED", jobs.findById(oldJob.getId()).orElseThrow().getStatus());
            mvc.perform(get("/api/ai/jobs/" + oldJob.getId()).with(user(principal)))
                    .andExpect(jsonPath("$.data.error_code").value("AI_SEARCH_MAINTENANCE"));
        }
        assertFalse(books.findById(id).orElseThrow().isEmbedded());
        assertEquals(0, externalRequests.get());
    }

    @Test
    void rankingsKeepLegacyCoverForAuditAndNeverSerializeIt() throws Exception {
        var legacy = PopularNaruBook.builder().ranking(1).ageGroup(30).fetchedAt(LocalDateTime.now())
                .isbn13("9780306406157").loanCount("12").build();
        rankings.saveAndFlush(legacy);
        String marker = "BLOCKED_NARU_COVER";
        jdbc.update("UPDATE popular_naru_books SET book_image_url = ? WHERE id = ?", marker, legacy.getId());
        var dto = mapper.readValue("{\"bookImageURL\":\"BLOCKED_NARU_COVER\",\"loan_count\":\"12\"}", LibraryBookDto.class);
        assertFalse(mapper.writeValueAsString(dto).contains(marker));
        mvc.perform(get("/api/books/popular/naru").param("ageGroup", "30"))
                .andExpect(jsonPath("$[0].source").value("도서관 정보나루"))
                .andExpect(jsonPath("$[0].loan_count").value("12"))
                .andExpect(jsonPath("$[0].bookImageURL").doesNotExist());
        rankings.replaceRanking(30, List.of(PopularNaruBook.builder().ranking(1).ageGroup(30)
                .loanCount("13").fetchedAt(LocalDateTime.now()).build()));
        assertEquals(marker, jdbc.queryForObject("SELECT book_image_url FROM popular_naru_books WHERE id = ?", String.class, legacy.getId()));
        assertEquals("13", rankings.findByAgeGroupAndArchivedFalseOrderByRankingAsc(30).get(0).getLoanCount());
    }
}
