package bookapp.bookappback;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableCaching
@EnableScheduling
@SpringBootApplication
public class BookAppBackApplication {

    public static void main(String[] args) {
        SpringApplication.run(BookAppBackApplication.class, args);
    }
}