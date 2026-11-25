-- Applies to the bibliographic facts in this batch. Descriptions use the existing editorial policy.
INSERT INTO corpus_use_policy (provider, version, evidence_ref, checked_on, uses, active)
VALUES ('CHUNGNAM_HOLDINGS_BIB', '2026-11-24',
        '충청남도 충남도서관 도서 정보 목록의 서명·저자. 이용허락범위 제한 없음. https://www.data.go.kr/data/15119625/fileData.do',
        DATE '2026-11-24', ARRAY['store','display','publish_derivative','external_ai','store_embedding','commercial'], TRUE)
ON CONFLICT (provider, version) DO NOTHING;
