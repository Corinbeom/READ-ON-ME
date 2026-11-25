package bookapp.bookappback.config;

import org.springframework.boot.task.ThreadPoolTaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
public class SchedulingConfig {
    @Bean
    @Primary
    ThreadPoolTaskScheduler taskScheduler(ThreadPoolTaskSchedulerBuilder builder) {
        return builder.build();
    }

    @Bean
    ThreadPoolTaskScheduler popularBookScheduler(ThreadPoolTaskSchedulerBuilder builder) {
        // Serialize cover and ranking refreshes without occupying the recommendation dispatcher.
        return builder.poolSize(1).threadNamePrefix("popular-books-").build();
    }
}
