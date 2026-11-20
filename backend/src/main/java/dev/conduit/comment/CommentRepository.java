package dev.conduit.comment;

import dev.conduit.profile.ProfileView;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class CommentRepository {
    private static final String PROJECTION = """
            SELECT c.id, c.created_at, c.updated_at, c.body, u.username, u.bio, u.image,
                   EXISTS (SELECT FROM follows f WHERE f.follower_id = :viewer AND f.followee_id = u.id) AS following
            FROM comments c JOIN users u ON u.id = c.author_id
            """;
    private final JdbcClient jdbc;

    CommentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Long> articleId(String slug, boolean lock) {
        String sql = "SELECT id FROM articles WHERE slug = :slug" + (lock ? " FOR SHARE" : "");
        return jdbc.sql(sql).param("slug", slug).query(Long.class).optional();
    }

    List<CommentView> list(long articleId, Long viewer) {
        return jdbc.sql(PROJECTION + " WHERE c.article_id = :articleId ORDER BY c.created_at DESC, c.id DESC")
                .param("viewer", viewer, Types.BIGINT).param("articleId", articleId).query(this::map).list();
    }

    CommentView insert(long articleId, long author, String body) {
        long id = jdbc.sql("""
                INSERT INTO comments(article_id, author_id, body) VALUES (:article, :author, :body) RETURNING id
                """).param("article", articleId).param("author", author).param("body", body).query(Long.class).single();
        return jdbc.sql(PROJECTION + " WHERE c.id = :id").param("viewer", author)
                .param("id", id).query(this::map).single();
    }

    Optional<Long> lockAuthor(long articleId, long id) {
        return jdbc.sql("SELECT author_id FROM comments WHERE article_id = ? AND id = ? FOR UPDATE")
                .params(articleId, id).query(Long.class).optional();
    }

    void delete(long articleId, long id) {
        jdbc.sql("DELETE FROM comments WHERE article_id = ? AND id = ?").params(articleId, id).update();
    }

    private CommentView map(ResultSet row, int index) throws SQLException {
        var author = new ProfileView(row.getString("username"), row.getString("bio"),
                row.getString("image"), row.getBoolean("following"));
        return new CommentView(row.getLong("id"), row.getTimestamp("created_at").toInstant(),
                row.getTimestamp("updated_at").toInstant(), row.getString("body"), author);
    }
}
