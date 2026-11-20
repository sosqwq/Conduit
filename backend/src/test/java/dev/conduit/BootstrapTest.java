package dev.conduit;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

class BootstrapTest extends PostgresIntegrationTest {
    @LocalServerPort int port;
    @Autowired JdbcClient jdbc;

    @Test
    void healthIsPublicAndReportsAWorkingDatabase() throws Exception {
        var endpoint = URI.create("http://localhost:" + port + "/api/health");
        var response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(endpoint).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("content-type")).hasValue("application/json");
        assertThat(response.body()).isEqualTo("{\"status\":\"UP\"}");
    }

    @Test
    void flywayCreatesAllSevenTablesInPostgres() {
        assertThat(jdbc.sql("SELECT version()").query(String.class).single()).startsWith("PostgreSQL");
        var tables = jdbc.sql("""
                SELECT tablename FROM pg_tables
                WHERE schemaname = current_schema() AND tablename <> 'flyway_schema_history'
                """).query(String.class).list();
        assertThat(tables).containsExactlyInAnyOrder(
                "users", "articles", "comments", "tags", "follows", "favorites", "article_tags");
        assertThat(jdbc.sql("""
                SELECT success FROM flyway_schema_history WHERE version = '1'
                """).query(Boolean.class).single()).isTrue();
    }
}
