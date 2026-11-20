package dev.conduit;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.util.TestPropertyValues;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public abstract class PostgresIntegrationTest {
    private ConfigurableApplicationContext context;
    protected int port;
    protected JdbcClient jdbc;
    protected TransactionTemplate transaction;

    @BeforeAll
    void startApplication() {
        TestPropertyValues database = databaseProperties();
        context = new SpringApplicationBuilder(ConduitApplication.class)
                .initializers(c -> database.and("server.port=0").applyTo(c.getEnvironment()))
                .run();
        port = context.getEnvironment().getRequiredProperty("local.server.port", Integer.class);
        jdbc = context.getBean(JdbcClient.class);
        transaction = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
    }

    @AfterAll
    void stopApplication() {
        if (context != null) {
            context.close();
        }
    }

    private static TestPropertyValues databaseProperties() {
        String url = System.getenv("CONDUIT_TEST_DB_URL");
        if (url != null && !url.isBlank()) {
            if (!url.startsWith("jdbc:postgresql://")) {
                throw new IllegalArgumentException("CONDUIT_TEST_DB_URL must identify a PostgreSQL test database");
            }
            return TestPropertyValues.of(
                    "spring.datasource.url=" + url,
                    "spring.datasource.username=" + System.getenv("CONDUIT_TEST_DB_USERNAME"),
                    "spring.datasource.password=" + System.getenv("CONDUIT_TEST_DB_PASSWORD"));
        }
        var postgres = ContainerDatabase.INSTANCE;
        return TestPropertyValues.of(
                "spring.datasource.url=" + postgres.getJdbcUrl(),
                "spring.datasource.username=" + postgres.getUsername(),
                "spring.datasource.password=" + postgres.getPassword());
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
