
package bookapp.bookappback.user.repository;

import bookapp.bookappback.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    // UserService에서 사용할 Optional<User> 반환 타입
    Optional<User> findByEmail(String email);

    // 기존에 있던 다른 메소드들
    boolean existsByEmail(String email);

    Optional<User> findByNickname(String nickname);
}
