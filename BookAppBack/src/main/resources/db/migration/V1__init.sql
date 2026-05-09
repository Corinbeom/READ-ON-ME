-- ============================================================
-- V1__init.sql
-- READ-ON-ME 초기 스키마
-- ============================================================

CREATE TABLE IF NOT EXISTS users
(
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE  NOT NULL,
    password      VARCHAR(255)         NOT NULL,
    nickname      VARCHAR(255) UNIQUE  NOT NULL,
    profile_image VARCHAR(255),
    created_at    TIMESTAMP            NOT NULL
);

CREATE TABLE IF NOT EXISTS books
(
    id            BIGSERIAL PRIMARY KEY,
    isbn13        VARCHAR(255) UNIQUE  NOT NULL,
    isbn10        VARCHAR(255),
    title         VARCHAR(255)         NOT NULL,
    group_title   VARCHAR(255),
    contents      TEXT,
    authors       VARCHAR(255),
    translators   VARCHAR(255),
    publisher     VARCHAR(255),
    price         INTEGER,
    sale_price    INTEGER,
    thumbnail     TEXT,
    publish_date  DATE,
    url           VARCHAR(255),
    average_rating DOUBLE PRECISION    DEFAULT 0.0,
    embedded      BOOLEAN              NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_book_status
(
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users (id),
    book_id    BIGINT       NOT NULL REFERENCES books (id),
    status     VARCHAR(50)  NOT NULL,
    updated_at TIMESTAMP,
    UNIQUE (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS book_review
(
    id         BIGSERIAL PRIMARY KEY,
    book_id    BIGINT           NOT NULL REFERENCES books (id),
    user_id    BIGINT           NOT NULL REFERENCES users (id),
    rating     DOUBLE PRECISION,
    comment    VARCHAR(1000),
    like_count INTEGER          DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_like
(
    id        BIGSERIAL PRIMARY KEY,
    user_id   BIGINT NOT NULL REFERENCES users (id),
    review_id BIGINT NOT NULL REFERENCES book_review (id),
    UNIQUE (user_id, review_id)
);

CREATE TABLE IF NOT EXISTS notifications
(
    id          BIGSERIAL PRIMARY KEY,
    receiver_id BIGINT       NOT NULL REFERENCES users (id),
    sender_id   BIGINT       REFERENCES users (id),
    review_id   BIGINT       REFERENCES book_review (id),
    type        VARCHAR(50)  NOT NULL,
    message     VARCHAR(255) NOT NULL,
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP    NOT NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_book_status_user_id  ON user_book_status (user_id);
CREATE INDEX IF NOT EXISTS idx_user_book_status_book_id  ON user_book_status (book_id);
CREATE INDEX IF NOT EXISTS idx_book_review_book_id       ON book_review (book_id);
CREATE INDEX IF NOT EXISTS idx_book_review_user_id       ON book_review (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_receiver_id ON notifications (receiver_id);
CREATE INDEX IF NOT EXISTS idx_books_embedded            ON books (embedded) WHERE embedded = FALSE;
