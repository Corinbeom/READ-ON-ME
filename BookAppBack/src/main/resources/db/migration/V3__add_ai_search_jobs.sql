ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_year INTEGER;

CREATE TABLE ai_search_jobs (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id),
    idempotency_key VARCHAR(100) NOT NULL,
    query TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    result_json TEXT,
    error_code VARCHAR(40),
    created_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_ai_search_job_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE INDEX idx_ai_search_jobs_queue ON ai_search_jobs (status, created_at) WHERE status = 'QUEUED';
CREATE INDEX idx_ai_search_jobs_user_recent ON ai_search_jobs (user_id, created_at DESC);
CREATE INDEX idx_ai_search_jobs_expires ON ai_search_jobs (expires_at);
