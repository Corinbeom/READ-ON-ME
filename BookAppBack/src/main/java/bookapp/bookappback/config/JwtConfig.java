package bookapp.bookappback.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "jwt")
@Getter
@Setter
public class JwtConfig {
    
    private String secret = "";
    private Long expiration = 86400000L; // 24시간

    // Default constructor
    public JwtConfig() {}

    // Constructor with all fields
    public JwtConfig(String secret, Long expiration) {
        this.secret = secret;
        this.expiration = expiration;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        JwtConfig jwtConfig = (JwtConfig) o;
        return java.util.Objects.equals(secret, jwtConfig.secret) &&
               java.util.Objects.equals(expiration, jwtConfig.expiration);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(secret, expiration);
    }

    @Override
    public String toString() {
        return "JwtConfig{" +
                "secret='[PROTECTED]'" +
                ", expiration=" + expiration +
                '}';
    }
}