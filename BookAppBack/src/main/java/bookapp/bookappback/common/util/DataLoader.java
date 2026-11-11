package bookapp.bookappback.common.util;

import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** Development login fixture. Book collection is an explicit AI ingestion job. */
@Component
@Profile("dev")
@RequiredArgsConstructor
public class DataLoader implements CommandLineRunner {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        if (userRepository.findByEmail("test@test.com").isPresent()) return;
        User user = new User();
        user.setEmail("test@test.com");
        user.setPassword(passwordEncoder.encode("1111"));
        user.setNickname("tester");
        user.setBirthYear(2000);
        user.setCreatedAt(LocalDateTime.now());
        userRepository.save(user);
    }
}
