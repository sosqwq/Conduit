package dev.conduit.article;

import dev.conduit.profile.ProfileView;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class ArticleListRepository {
    private final JdbcClient jdbc;
    private static final String FROM = " FROM articles a JOIN users u ON u.id = a.author_id ";
    private static final String SUMMARY_COLUMNS = """
            SELECT a.id, a.slug, a.title, a.description, a.created_at, a.updated_at,
                   u.username, u.bio, u.image,
                   EXISTS (SELECT FROM follows f WHERE f.followee_id = u.id AND f.follower_id = :viewer) AS following,
                   EXISTS (SELECT FROM favorites f WHERE f.article_id = a.id AND f.user_id = :viewer) AS favorited,
                   (SELECT count(*) FROM favorites f WHERE f.article_id = a.id) AS favorites_count
            """;

    ArticleListRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    record Filters(String tag, String author, String favorited, Long feedViewer) {}

    record Selection(String where, Map<String, Object> params) {
        static Selection matching(Filters filters) {
            var terms = new ArrayList<String>();
            var params = new HashMap<String, Object>();
            if (filters.tag() != null) {
                terms.add("""
                        EXISTS (SELECT FROM article_tags at JOIN tags t ON t.id = at.tag_id
                                WHERE at.article_id = a.id AND t.name = :tag)
                        """);
                params.put("tag", filters.tag());
            }
            if (filters.author() != null) {
                terms.add("u.username = :author");
                params.put("author", filters.author());
            }
            if (filters.favorited() != null) {
                terms.add("""
                        EXISTS (SELECT FROM favorites fav JOIN users fan ON fan.id = fav.user_id
                                WHERE fav.article_id = a.id AND fan.username = :favorited)
                        """);
                params.put("favorited", filters.favorited());
            }
            if (filters.feedViewer() != null) {
                terms.add("EXISTS (SELECT FROM follows f WHERE f.followee_id = u.id AND f.follower_id = :feedViewer)");
                params.put("feedViewer", filters.feedViewer());
            }
            return new Selection(terms.isEmpty() ? "" : " WHERE " + String.join(" AND ", terms), params);
        }
    }

    record Row(long id, String slug, String title, String description, Instant createdAt, Instant updatedAt,
               boolean favorited, long favoritesCount, ProfileView author) {
        ArticleSummary withTags(List<String> tags) {
            return new ArticleSummary(slug, title, description, tags, createdAt, updatedAt, favorited, favoritesCount, author);
        }
    }

    long count(Selection matches) {
        return jdbc.sql("SELECT count(*)" + FROM + matches.where())
                .params(matches.params()).query(Long.class).single();
    }

    List<Row> page(Selection matches, Long viewer, long limit, long offset) {
        return jdbc.sql(SUMMARY_COLUMNS + FROM + matches.where() + " ORDER BY a.created_at DESC, a.id DESC LIMIT :limit OFFSET :offset")
                .params(matches.params()).param("viewer", viewer, Types.BIGINT).param("limit", limit).param("offset", offset)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getString("slug"), rs.getString("title"),
                        rs.getString("description"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
                        rs.getBoolean("favorited"), rs.getLong("favorites_count"), new ProfileView(rs.getString("username"),
                        rs.getString("bio"), rs.getString("image"), rs.getBoolean("following")))).list();
    }
}
