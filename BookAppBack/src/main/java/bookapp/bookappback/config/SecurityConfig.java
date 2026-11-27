package bookapp.bookappback.config;

import bookapp.bookappback.common.filter.RateLimitFilter;
import bookapp.bookappback.common.util.JwtUtil;
import bookapp.bookappback.operations.OperationsAccess;
import bookapp.bookappback.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.Http403ForbiddenEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
@EnableConfigurationProperties(OperationsAccess.class)
public class SecurityConfig {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;
    private final RateLimitFilter rateLimitFilter;
    private final OperationsAccess operationsAccess;

    

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authenticationConfiguration) throws Exception {
        return authenticationConfiguration.getAuthenticationManager();
    }

    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter() {
        return new JwtAuthenticationFilter(jwtUtil, userDetailsService);
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, error) -> {
                    if (Boolean.TRUE.equals(request.getAttribute(JwtAuthenticationFilter.EXPIRED_SESSION))) {
                        response.setStatus(401);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"code\":\"SESSION_EXPIRED\"}");
                    } else {
                        new Http403ForbiddenEntryPoint().commence(request, response, error);
                    }
                }))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll() // Allow preflight OPTIONS requests
                        .requestMatchers("/api/operations", "/api/operations/**")
                        .access((authentication, context) -> {
                            var current = authentication.get();
                            return new AuthorizationDecision(current.isAuthenticated() && operationsAccess.allows(current.getPrincipal()));
                        })
                        .requestMatchers("/api/users/signup", "/api/users/signin").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/users/kakao/start", "/api/users/kakao/exchange").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/feedback").permitAll()
                        .requestMatchers("/api/books/search", "/api/books/detail/**", "/api/books/popular", "/api/books/popular/naru", "/api/books/*/editions", "/api/books/test", "/api/books/details").permitAll() // 책 조회는 인증 없이 허용
                        .requestMatchers(HttpMethod.GET, "/api/ai/availability", "/api/books/reading-keyword-picks", "/api/books/daily-choices").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/books/*/reviews").permitAll() // 리뷰 조회는 인증 없이 허용
                        // 내부 추천용 API: Security는 열어두되 Controller에서 X-Internal-Token으로 2차 보호
                        .requestMatchers("/api/library/all").permitAll()
                        // Liveness/Readiness
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .anyRequest().authenticated() // 그 외 모든 요청은 인증 필요
                )
                .addFilterBefore(jwtAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(rateLimitFilter, JwtAuthenticationFilter.class)
                .headers(headers -> headers.frameOptions(frameOptions -> frameOptions.sameOrigin()))
                .build();
    }
}
