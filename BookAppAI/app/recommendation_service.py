import httpx
from collections import Counter

SPRING_BOOT_URL = "http://localhost:8080"

async def fetch_user_libraries() -> dict[int, list[int]]:
    """
    Spring Boot 서버에서 모든 사용자의 라이브러리 데이터를 가져옵니다.
    데이터 형식: {user_id: [book_id, ...]}
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{SPRING_BOOT_URL}/api/library/all")
            response.raise_for_status()
            # JSON의 키가 문자열이므로, 정수형 user_id로 변환합니다.
            return {int(k): v for k, v in response.json().items()}
        except httpx.RequestError as exc:
            print(f"An error occurred while requesting {exc.request.url!r}: {exc}")
            return {}

def calculate_jaccard_similarity(set1: set, set2: set) -> float:
    """두 세트 간의 자카드 유사도를 계산합니다."""
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union != 0 else 0

async def get_recommendations(target_user_id: int, top_k_neighbors: int = 5, num_recommendations: int = 10) -> list[int]:
    """
    사용자 기반 협업 필터링을 사용하여 도서를 추천합니다.
    """
    # 1. 모든 사용자의 독서 기록 데이터 가져오기
    all_libraries = await fetch_user_libraries()
    if not all_libraries or target_user_id not in all_libraries:
        return []

    target_user_books = set(all_libraries[target_user_id])

    # 2. 다른 모든 사용자와의 유사도 계산
    similarities = []
    for user_id, books in all_libraries.items():
        if user_id == target_user_id:
            continue
        similarity = calculate_jaccard_similarity(target_user_books, set(books))
        if similarity > 0:
            similarities.append((user_id, similarity))

    # 유사도 기준으로 상위 K명의 이웃 정렬
    similarities.sort(key=lambda x: x[1], reverse=True)
    neighbors = similarities[:top_k_neighbors]

    if not neighbors:
        return []

    # 3. 이웃 사용자들의 책 목록 취합
    recommendation_pool = []
    for neighbor_id, _ in neighbors:
        recommendation_pool.extend(all_libraries[neighbor_id])

    # 4. 추천 목록 생성
    # 이웃들이 읽은 책 중에서, 대상 사용자가 아직 읽지 않은 책을 추려냅니다.
    # 가장 많은 이웃이 읽은 순서대로 정렬합니다.
    book_counts = Counter(recommendation_pool)
    recommendations = []
    for book_id, count in book_counts.most_common():
        if book_id not in target_user_books:
            recommendations.append(book_id)

    return recommendations[:num_recommendations]
