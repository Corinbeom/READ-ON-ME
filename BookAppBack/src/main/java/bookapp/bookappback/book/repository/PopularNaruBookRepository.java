package bookapp.bookappback.book.repository;

import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import bookapp.bookappback.book.entity.PopularNaruBook;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface PopularNaruBookRepository extends JpaRepository<PopularNaruBook, Long> {

    List<PopularNaruBook> findByAgeGroupAndArchivedFalseOrderByRankingAsc(Integer ageGroup);

    @Modifying
    @Query(value = """
            UPDATE popular_naru_books SET archived = true
            WHERE age_group = :ageGroup AND archived = false AND book_image_url IS NOT NULL
            """, nativeQuery = true)
    void archiveLegacyCovers(@Param("ageGroup") Integer ageGroup);

    void deleteByAgeGroupAndArchivedFalse(Integer ageGroup);

    @Transactional
    default void replaceRanking(Integer ageGroup, List<PopularNaruBook> books) {
        archiveLegacyCovers(ageGroup);
        deleteByAgeGroupAndArchivedFalse(ageGroup);
        saveAll(books);
    }
}
