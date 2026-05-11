-- ============================================================
-- V2__add_popular_naru_books.sql
-- 도서관 정보나루 인기 대출 도서 배치 저장 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS popular_naru_books
(
    id               BIGSERIAL PRIMARY KEY,
    age_group        INTEGER       NOT NULL,
    ranking          INTEGER       NOT NULL,
    book_name        VARCHAR(500),
    authors          VARCHAR(500),
    publisher        VARCHAR(255),
    publication_year VARCHAR(50),
    isbn13           VARCHAR(20),
    class_nm         VARCHAR(100),
    book_image_url   VARCHAR(1000),
    loan_count       VARCHAR(20),
    fetched_at       TIMESTAMP     NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_popular_naru_age_group ON popular_naru_books (age_group);
CREATE INDEX IF NOT EXISTS idx_popular_naru_age_ranking ON popular_naru_books (age_group, ranking);
