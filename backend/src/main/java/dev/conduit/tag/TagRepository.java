package dev.conduit.tag;

import java.sql.Types;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class TagRepository {
    private final JdbcClient jdbc;

    TagRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<String> all() {
        return jdbc.sql("SELECT name FROM tags ORDER BY name").query(String.class).list();
    }

    List<String> forArticle(long articleId) {
        return jdbc.sql("""
                SELECT t.name FROM article_tags a JOIN tags t ON t.id = a.tag_id
                WHERE a.article_id = :articleId ORDER BY a.position
                """).param("articleId", articleId).query(String.class).list();
    }

    void clearLinks(long articleId) {
        jdbc.sql("DELETE FROM article_tags WHERE article_id = :articleId")
                .param("articleId", articleId).update();
    }

    void addLinks(long articleId, String[] names) {
        // All transactions acquire unique tag names in the same order, including when article orders differ.
        jdbc.sql("""
                INSERT INTO tags(name)
                SELECT n FROM unnest(CAST(:names AS text[])) AS input(n) ORDER BY n
                ON CONFLICT (name) DO NOTHING
                """).param("names", names, Types.ARRAY).update();
        jdbc.sql("""
                INSERT INTO article_tags(article_id, tag_id, position)
                SELECT :articleId, t.id, input.ordinal - 1
                FROM unnest(CAST(:names AS text[])) WITH ORDINALITY AS input(name, ordinal)
                JOIN tags t ON t.name = input.name
                """).param("articleId", articleId).param("names", names, Types.ARRAY).update();
    }
}
