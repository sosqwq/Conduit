package dev.conduit;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BootstrapTest extends PostgresIntegrationTest {
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

    @Test
    void deletingAnArticleRemovesCommentsAndLinksButPreservesAuthorAndTags() {
        transaction.executeWithoutResult(status -> {
            String seed = UUID.randomUUID().toString();
            long user = jdbc.sql("INSERT INTO users(email, username, password_hash) VALUES (?, ?, ?) RETURNING id")
                    .params(seed + "@test.invalid", seed, "fixture").query(Long.class).single();
            long article = jdbc.sql("""
                    INSERT INTO articles(author_id, slug, title, description, body)
                    VALUES (?, ?, 'Title', 'Description', 'Body') RETURNING id
                    """).params(user, seed).query(Long.class).single();
            long tag = jdbc.sql("INSERT INTO tags(name) VALUES (?) RETURNING id").param(seed).query(Long.class).single();
            jdbc.sql("INSERT INTO comments(article_id, author_id, body) VALUES (?, ?, 'Hello')")
                    .params(article, user).update();
            jdbc.sql("INSERT INTO favorites(user_id, article_id) VALUES (?, ?)").params(user, article).update();
            jdbc.sql("INSERT INTO article_tags(article_id, tag_id, position) VALUES (?, ?, 0)")
                    .params(article, tag).update();

            assertThat(jdbc.sql("DELETE FROM articles WHERE id = ?").param(article).update()).isEqualTo(1);
            assertThat(jdbc.sql("SELECT count(*) FROM comments WHERE article_id = ?")
                    .param(article).query(Long.class).single()).isZero();
            assertThat(jdbc.sql("SELECT count(*) FROM favorites WHERE article_id = ?")
                    .param(article).query(Long.class).single()).isZero();
            assertThat(jdbc.sql("SELECT count(*) FROM article_tags WHERE article_id = ?")
                    .param(article).query(Long.class).single()).isZero();
            assertThat(jdbc.sql("SELECT count(*) FROM users WHERE id = ?")
                    .param(user).query(Long.class).single()).isOne();
            assertThat(jdbc.sql("SELECT count(*) FROM tags WHERE id = ?")
                    .param(tag).query(Long.class).single()).isOne();
            status.setRollbackOnly();
        });
    }
}
