ALTER TABLE ai_search_jobs
    ADD COLUMN client_submit_ms integer,
    ADD COLUMN client_signal_ms integer,
    ADD COLUMN client_fetch_start_ms integer,
    ADD COLUMN client_fetch_end_ms integer,
    ADD COLUMN client_display_ms integer;
