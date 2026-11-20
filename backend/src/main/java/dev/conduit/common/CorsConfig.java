package dev.conduit.common;

import java.net.URI;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration(proxyBeanMethods = false)
class CorsConfig {
    @Bean
    UrlBasedCorsConfigurationSource apiCors(@Value("${CONDUIT_ALLOWED_ORIGINS:}") String configuredOrigins) {
        var policy = new CorsConfiguration();
        policy.setAllowedOrigins(parseOrigins(configuredOrigins));
        policy.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        policy.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        policy.setAllowCredentials(false);
        policy.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", policy);
        return source;
    }

    static List<String> parseOrigins(String value) {
        if (value.isBlank()) return List.of();
        return Arrays.stream(value.split(",", -1)).map(String::strip).map(origin -> {
            URI uri = URI.create(origin);
            if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                    || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getPort() > 65535
                    || !uri.getRawPath().isEmpty() || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || origin.contains("*") || origin.endsWith(":")) {
                throw new IllegalArgumentException("CONDUIT_ALLOWED_ORIGINS requires exact HTTP(S) origins");
            }
            return origin;
        }).distinct().toList();
    }
}
