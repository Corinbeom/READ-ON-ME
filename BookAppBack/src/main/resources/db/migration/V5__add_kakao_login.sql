ALTER TABLE users
    ADD COLUMN kakao_id BIGINT UNIQUE,
    ALTER COLUMN email DROP NOT NULL,
    ALTER COLUMN password DROP NOT NULL,
    ADD CONSTRAINT users_login_credentials_check
        CHECK (kakao_id IS NOT NULL OR (email IS NOT NULL AND password IS NOT NULL));
