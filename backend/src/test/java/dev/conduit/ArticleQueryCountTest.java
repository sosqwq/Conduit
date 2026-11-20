package dev.conduit;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.ConfigurableApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;

class ArticleQueryCountTest extends ApiTest {
    private final JdbcExecutionCounter counter = new JdbcExecutionCounter();

    @Override
    protected void customize(ConfigurableApplicationContext context) {
        context.getBeanFactory().addBeanPostProcessor(counter);
    }

    @Test
    void pagesWithEightDifferentAuthorsUseTheSameNumberOfQueriesAsOneArticle() throws Exception {
        String tag = "measure-" + UUID.randomUUID();
        String viewer = "reader-" + tag;
        String token = register(viewer);
        for (int i = 0; i < 8; i++) {
            String author = "writer-" + i + "-" + tag;
            String authorToken = register(author);
            request("POST", "/profiles/" + author + "/follow", token, null, 200);
            var input = Map.of("article", Map.of("title", "Entry " + i, "description", "summary", "body", "markdown",
                    "tagList", List.of(tag, "topic-" + i)));
            String slug = request("POST", "/articles", authorToken, input, 201).at("/article/slug").stringValue();
            jdbc.sql("""
                    INSERT INTO favorites(user_id, article_id)
                    SELECT u.id, a.id FROM users u, articles a WHERE u.username = ? AND a.slug = ?
                    """).params(viewer, slug).update();
        }

        checkWidths("/articles?tag=" + tag + "&", null, 3);
        checkWidths("/articles?tag=" + tag + "&", token, 4);
        checkWidths("/articles/feed?", token, 4);
    }

    private void checkWidths(String path, String token, int budget) throws Exception {
        long one = measure(path, token, 1);
        long eight = measure(path, token, 8);
        assertThat(one).as("%s statements for a one-article page", path).isBetween(1L, (long) budget);
        assertThat(eight).as("%s statements for eight distinct authors", path).isEqualTo(one);
    }

    private long measure(String path, String token, int width) throws Exception {
        long before = counter.total();
        var result = request("GET", path + "limit=" + width, token, null, 200);
        long queries = counter.total() - before;
        assertThat(result.get("articlesCount").intValue()).isEqualTo(8);
        assertThat(result.get("articles").size()).isEqualTo(width);
        for (var row : result.get("articles")) {
            assertThat(row.get("tagList").size()).isEqualTo(2);
            assertThat(row.has("body")).isFalse();
            assertThat(row.get("favoritesCount").intValue()).isEqualTo(1);
            assertThat(row.get("favorited").booleanValue()).isEqualTo(token != null);
            assertThat(row.at("/author/following").booleanValue()).isEqualTo(token != null);
        }
        return queries;
    }
}
