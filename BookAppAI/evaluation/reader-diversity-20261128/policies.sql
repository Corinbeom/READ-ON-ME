-- Only the printed title (including subtitle), author credit and catalog subject terms
-- in the two pinned public workbooks. No jacket copy, reviews, images or patron data.
INSERT INTO corpus_use_policy (provider,version,evidence_ref,checked_on,uses,active)
VALUES ('SEONGNAM_HOLDINGS_BIB','2026-11-28',
        '성남시 도서관 도서목록 2026-01-07. 이용허락범위 제한 없음. 서명·부제·저자 및 도서관 주제어에 한함. https://www.data.go.kr/data/3071094/fileData.do',
        DATE '2026-11-28',ARRAY['store','display','publish_derivative','external_ai','store_embedding','commercial'],TRUE)
ON CONFLICT (provider,version) DO NOTHING;
