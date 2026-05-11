package bookapp.bookappback.book.repository;

import bookapp.bookappback.book.entity.PopularNaruBook;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface PopularNaruBookRepository extends JpaRepository<PopularNaruBook, Long> {

    List<PopularNaruBook> findByAgeGroupOrderByRankingAsc(Integer ageGroup);

    @Transactional
    void deleteByAgeGroup(Integer ageGroup);
}
