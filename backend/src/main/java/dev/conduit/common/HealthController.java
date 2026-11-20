package dev.conduit.common;

import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final JdbcClient jdbc;

    public HealthController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, String>> health() {
        try {
            jdbc.sql("SELECT 1").query(Integer.class).single();
            return ResponseEntity.ok(Map.of("status", "UP"));
        } catch (DataAccessException unavailable) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("status", "DOWN"));
        }
    }
}
