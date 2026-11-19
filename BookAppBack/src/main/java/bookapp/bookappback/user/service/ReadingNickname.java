package bookapp.bookappback.user.service;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

final class ReadingNickname {
    static final int MAX_ATTEMPTS = 24;

    private static final List<String> DESCRIPTIONS = List.of(
            "새벽을 읽는", "문장을 줍는", "책장을 여는", "서재를 걷는", "시를 모으는", "글을 쓰는",
            "별을 세는", "달을 보는", "꿈을 꿰는", "쉼표를 찾는", "여백을 걷는", "책갈피 꽂는",
            "소설을 읽는", "동화를 읽는", "밤을 새우는", "이야기 듣는", "종이를 접는", "책을 고른",
            "기록하는", "탐험하는", "사색하는", "산책하는", "낭독하는", "책 읽는", "책 든", "기웃대는",
            "느긋한", "부지런한", "수줍은", "다정한", "조용한", "엉뚱한", "용감한", "당찬", "상냥한",
            "호기심 많은", "잠 못 드는", "꿈꾸는", "별난", "작은", "햇살 닮은", "달빛 닮은", "한가한",
            "싱그러운", "명랑한", "씩씩한", "은근한", "느린", "따뜻한", "고요한", "낯선", "비를 보는",
            "느리게 읽는", "함께 읽는", "귀를 기울인", "책장 곁의", "여행하는", "책 아끼는", "몰두하는");

    private static final List<String> CHARACTERS = List.of(
            "여우", "고양이", "펭귄", "수달", "토끼", "판다", "오리", "제비", "고래", "해달",
            "참새", "다람쥐", "두더지", "너구리", "사슴", "오소리", "올빼미", "부엉이", "코알라", "고라니",
            "물개", "반딧불", "종달새", "꿀벌", "나비", "라쿤", "양", "햄스터", "거북이", "개구리",
            "문어", "돌고래", "하마", "기러기", "타조", "백조", "알파카", "비둘기", "물총새", "까치",
            "캥거루", "오목눈", "책벌레", "독자", "사서", "시인", "작가", "낭독가", "여행자", "수집가",
            "탐험가", "관찰자", "기록가", "모험가", "책친구", "갈피", "안내자", "산책자", "새내기", "필경사");

    private static final List<String> OBJECTS = List.of(
            "책을", "시를", "글을", "꿈을", "별을", "달을", "봄을", "밤을", "빛을", "숲을",
            "문장을", "바람을", "하늘을", "노을을", "구름을", "기억을", "마음을", "시간을");
    private static final List<String> ACTIONS = List.of(
            "읽는", "찾는", "품는", "담는", "줍는", "엮는", "잇는", "듣는", "보는", "그린", "만난", "모은");

    private ReadingNickname() {}

    static String next() {
        var random = ThreadLocalRandom.current();
        int combinations = OBJECTS.size() * ACTIONS.size();
        int index = random.nextInt(combinations + DESCRIPTIONS.size());
        String description = index < combinations
                ? OBJECTS.get(index / ACTIONS.size()) + " " + ACTIONS.get(index % ACTIONS.size())
                : DESCRIPTIONS.get(index - combinations);
        return description + " " + CHARACTERS.get(random.nextInt(CHARACTERS.size()));
    }
}
