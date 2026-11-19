WITH completed AS (
    SELECT CASE
               WHEN status = 'FAILED' OR result_outcome = 'DEGRADED_EMPTY' THEN 'error'
               WHEN result_outcome = 'NO_MATCH' THEN 'no_match'
               WHEN result_outcome = 'FALLBACK' THEN 'fallback'
               WHEN result_outcome = 'MODEL' THEN 'success'
               WHEN btrim(result_json) = '[]' THEN 'no_match'
               WHEN result_json IS NOT NULL THEN 'success'
               ELSE 'error'
           END AS outcome,
           EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 AS total_ms
    FROM ai_search_jobs
    WHERE status IN ('SUCCEEDED', 'FAILED')
      AND completed_at >= LOCALTIMESTAMP - INTERVAL '24 hours'
)
SELECT count(*) AS completed_jobs,
       count(*) FILTER (WHERE outcome IN ('success', 'fallback')) AS with_results,
       count(*) FILTER (WHERE outcome = 'fallback') AS fallback_results,
       count(*) FILTER (WHERE outcome = 'no_match') AS no_match,
       count(*) FILTER (WHERE outcome = 'error') AS errors,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms)) AS p50_total_ms,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms)) AS p95_total_ms
FROM completed;
