package bookapp.bookappback.book.repository;

import bookapp.bookappback.book.entity.CatalogFieldObservation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogFieldObservationRepository extends JpaRepository<CatalogFieldObservation, Long> {
}
