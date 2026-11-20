package dev.conduit;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ArticleListApiTest extends ApiTest {
    private String name() {
        return "list_" + UUID.randomUUID().toString().replace("-", "");
    }

    private String publish(String author, String title, String... tags) throws Exception {
        return request("POST", "/articles", author, Map.of("article", Map.of("title", title, "body", "Content",
                "description", "Description", "tagList", List.of(tags))), 201).at("/article/slug").stringValue();
    }

    @Test
    void allFiltersIntersectAndResponsesAreSummariesForTheCurrentViewer() throws Exception {
        String writer = name(), reader = name(), tag = name();
        String writerToken = register(writer), readerToken = register(reader);
        String selected = publish(writerToken, "Selected", tag, "second");
        publish(writerToken, "Different tag", "second");
        publish(readerToken, "Other writer", tag);
        jdbc.sql("""
                INSERT INTO favorites(user_id, article_id)
                SELECT u.id, a.id FROM users u, articles a WHERE u.username = ? AND a.slug = ?
                """).params(reader, selected).update();
        request("POST", "/profiles/" + writer + "/follow", readerToken, null, 200);
        String path = "/articles?author=" + writer + "&tag=" + tag + "&favorited=" + reader;
        var page = request("GET", path, readerToken, null, 200);
        assertThat(page.propertyNames()).containsExactlyInAnyOrder("articles", "articlesCount");
        assertThat(page.get("articlesCount").asInt()).isOne();
        assertThat(page.get("articles").size()).isOne();
        var item = page.at("/articles/0");
        assertThat(item.propertyNames()).containsExactlyInAnyOrder("title", "slug", "description", "tagList",
                "createdAt", "updatedAt", "favorited", "favoritesCount", "author");
        assertThat(item.get("slug").stringValue()).isEqualTo(selected);
        assertThat(item.get("tagList")).isEqualTo(json.valueToTree(List.of(tag, "second")));
        assertThat(item.get("favoritesCount").asInt()).isOne();
        assertThat(item.get("favorited").booleanValue()).isTrue();
        assertThat(item.at("/author/following").booleanValue()).isTrue();
        assertThat(item.get("author").propertyNames()).containsExactlyInAnyOrder("username", "bio", "image", "following");
        var publicItem = request("GET", path, null, null, 200).at("/articles/0");
        assertThat(publicItem.get("favoritesCount").asInt()).isOne();
        assertThat(publicItem.get("favorited").booleanValue()).isFalse();
        assertThat(publicItem.at("/author/following").booleanValue()).isFalse();
        assertThat(request("GET", "/articles?tag=" + name(), null, null, 200).get("articlesCount").asInt()).isZero();
    }

    @Test
    void paginationCountsAllMatchesAndBreaksTimestampTiesByDescendingId() throws Exception {
        String writer = name();
        register(writer);
        jdbc.sql("""
                INSERT INTO articles(author_id, slug, title, description, body)
                SELECT u.id, u.username || '-' || n, 'Item', 'Description', 'Body'
                FROM users u CROSS JOIN generate_series(1, 21) n WHERE u.username = ? ORDER BY n
                """).param(writer).update();
        String path = "/articles?author=" + writer;
        var page = request("GET", path, null, null, 200);
        assertThat(page.get("articles").size()).isEqualTo(20);
        assertThat(page.get("articlesCount").asInt()).isEqualTo(21);
        assertThat(page.at("/articles/0/slug").stringValue()).isEqualTo(writer + "-21");
        assertThat(page.at("/articles/0/tagList").size()).isZero();
        var last = request("GET", path + "&offset=20&limit=1", null, null, 200);
        assertThat(last.get("articlesCount").asInt()).isEqualTo(21);
        assertThat(last.at("/articles/0/slug").stringValue()).isEqualTo(writer + "-1");
        var pastEnd = request("GET", path + "&offset=21", null, null, 200);
        assertThat(pastEnd.get("articles").size()).isZero();
        assertThat(pastEnd.get("articlesCount").asInt()).isEqualTo(21);
    }

    @Test
    void feedIsProtectedAndExcludesAuthorsOutsideTheViewerFollows() throws Exception {
        String reader = name(), writer = name();
        String readerToken = register(reader), writerToken = register(writer);
        publish(readerToken, "My article");
        publish(writerToken, "Writer first");
        String second = publish(writerToken, "Writer second");
        request("GET", "/articles/feed", null, null, 401);
        assertThat(request("GET", "/articles/feed", readerToken, null, 200).get("articlesCount").asInt()).isZero();
        request("POST", "/profiles/" + writer + "/follow", readerToken, null, 200);
        var page = request("GET", "/articles/feed?limit=1", readerToken, null, 200);
        assertThat(page.get("articlesCount").asInt()).isEqualTo(2);
        assertThat(page.get("articles").size()).isOne();
        assertThat(page.at("/articles/0/slug").stringValue()).isEqualTo(second);
        assertThat(page.at("/articles/0/author/following").booleanValue()).isTrue();
        var empty = request("GET", "/articles/feed?offset=9", readerToken, null, 200);
        assertThat(empty.get("articlesCount").asInt()).isEqualTo(2);
        assertThat(empty.get("articles").size()).isZero();
    }

    @Test
    void invalidPaginationReturnsFieldErrors() throws Exception {
        for (var invalid : List.of("limit=0", "limit=-1", "limit=abc", "offset=-1", "offset=abc")) {
            String field = invalid.substring(0, invalid.indexOf('='));
            var errors = request("GET", "/articles?" + invalid, null, null, 422).get("errors");
            assertThat(errors.get(field).isArray()).isTrue();
        }
    }
}
