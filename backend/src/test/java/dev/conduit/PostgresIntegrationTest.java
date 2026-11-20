package dev.conduit;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class PostgresIntegrationTest {
    @DynamicPropertySource
    static void registerDatabase(DynamicPropertyRegistry properties) {
        String url = System.getenv("CONDUIT_TEST_DB_URL");
        if (url != null && !url.isBlank()) {
            if (!url.startsWith("jdbc:postgresql://")) {
                throw new IllegalArgumentException("CONDUIT_TEST_DB_URL must identify a PostgreSQL test database");
            }
            properties.add("spring.datasource.url", () -> url);
            properties.add("spring.datasource.username", () -> System.getenv("CONDUIT_TEST_DB_USERNAME"));
            properties.add("spring.datasource.password", () -> System.getenv("CONDUIT_TEST_DB_PASSWORD"));
            return;
        }
        properties.add("spring.datasource.url", ContainerDatabase.INSTANCE::getJdbcUrl);
        properties.add("spring.datasource.username", ContainerDatabase.INSTANCE::getUsername);
        properties.add("spring.datasource.password", ContainerDatabase.INSTANCE::getPassword);
    }

    private static class ContainerDatabase {
        private static final PostgreSQLContainer INSTANCE = start();

        private static PostgreSQLContainer start() {
            PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");
            postgres.start();
            return postgres;
        }
    }
}
