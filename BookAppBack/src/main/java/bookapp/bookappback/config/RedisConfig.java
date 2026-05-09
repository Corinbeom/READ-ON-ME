package bookapp.bookappback.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.Map;

@Configuration
public class RedisConfig {

    private static final Logger log = LoggerFactory.getLogger(RedisConfig.class);

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory cf) {
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer()))
                .entryTtl(Duration.ofHours(6));

        // 캐시별 TTL 개별 설정
        Map<String, RedisCacheConfiguration> cacheConfigs = Map.of(
            // 카카오 검색 결과: 책 목록은 자주 변하지 않으므로 6시간 유지
            "bookSearchCache", defaultConfig.entryTtl(Duration.ofHours(6)),
            // 인기 도서: 1시간마다 갱신하여 최신 트렌드 반영
            "popularBooksCache", defaultConfig.entryTtl(Duration.ofHours(1))
        );

        log.info("Redis CacheManager initialized. default TTL=6h, popularBooksCache TTL=1h");
        return RedisCacheManager.RedisCacheManagerBuilder
                .fromConnectionFactory(cf)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigs)
                .build();
    }

    @PostConstruct
    public void checkRedisConnection() {
        log.info("RedisConfig initialized.");
    }
}
