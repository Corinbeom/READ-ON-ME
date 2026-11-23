-- Reviewed scopes apply to the corresponding fields in fields.json.
BEGIN;
INSERT INTO corpus_use_policy (provider, version, evidence_ref, checked_on, uses, active)
SELECT provider, '2026-11-23', evidence, DATE '2026-11-23',
       ARRAY['store','display','publish_derivative','external_ai','store_embedding','commercial'], TRUE
FROM (VALUES
    ('NLK_RECOMMENDATION_BIB', '국립중앙도서관 추천목록의 서명·저자명 서지 사실. https://www.data.go.kr/data/15064371/openapi.do'),
    ('NLK_PRESS_TEXT', '국립중앙도서관 보도자료 중 각 source_ref에 제1유형 표시가 있는 본문. 출처표시 포함. https://www.kogl.or.kr/info/licenseType1.do'),
    ('NLCY_LIBRARIAN_CSV', '국립어린이청소년도서관 사서추천도서 CSV의 서명·저자와 사서 작성 추천글. 이용허락범위 제한 없음. https://www.data.go.kr/data/15151124/fileData.do')
) AS policies(provider, evidence)
ON CONFLICT (provider, version) DO NOTHING;
COMMIT;
