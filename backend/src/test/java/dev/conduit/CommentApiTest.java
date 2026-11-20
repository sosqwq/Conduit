package dev.conduit;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CommentApiTest extends ApiTest {
    private String article(String token) throws Exception {
        return request("POST", "/articles", token, Map.of("article", Map.of(
                "title", "Discussion " + UUID.randomUUID(), "description", "intro", "body", "article")), 201)
                .at("/article/slug").stringValue();
    }

    private String path(String slug) {
        return "/articles/" + slug + "/comments";
    }

    @Test
    void chronologicalCommentsShowTheAuthorsPublicProfileForEachViewer() throws Exception {
        String seed = UUID.randomUUID().toString();
        String reader = register("reader-" + seed);
        String writerName = "writer-" + seed;
        String writer = register(writerName);
        String slug = article(reader);
        request("POST", "/profiles/" + writerName + "/follow", reader, null, 200);
        var first = request("POST", path(slug), reader, Map.of("comment", Map.of("body", "First")), 201).get("comment");
        var second = request("POST", path(slug), writer, Map.of("comment", Map.of("body", "Second")), 201).get("comment");
        assertThat(second.propertyNames()).containsExactlyInAnyOrder("id", "body", "createdAt", "updatedAt", "author");
        assertThat(second.at("/author").propertyNames()).containsExactlyInAnyOrder("username", "bio", "image", "following");
        assertThat(second.at("/author/username").stringValue()).isEqualTo(writerName);
        assertThat(second.get("body").stringValue()).isEqualTo("Second");
        assertThat(second.get("createdAt").stringValue()).isEqualTo(second.get("updatedAt").stringValue());

        var signedIn = request("GET", path(slug), reader, null, 200).get("comments");
        assertThat(signedIn.size()).isEqualTo(2);
        assertThat(signedIn.get(0).get("id")).isEqualTo(second.get("id"));
        assertThat(signedIn.get(1).get("id")).isEqualTo(first.get("id"));
        assertThat(signedIn.get(0).at("/author/following").booleanValue()).isTrue();
        assertThat(signedIn.get(1).at("/author/following").booleanValue()).isFalse();
        assertThat(request("GET", path(slug), null, null, 200).at("/comments/0/author/following").booleanValue()).isFalse();
    }

    @Test
    void aCommentCanOnlyBeDeletedByItsAuthorUnderItsOwnArticle() throws Exception {
        String seed = UUID.randomUUID().toString();
        String owner = register("owner-" + seed);
        String writer = register("guest-" + seed);
        String slug = article(owner);
        String other = article(writer);
        long id = request("POST", path(slug), writer, Map.of("comment", Map.of("body", "Guest reply")), 201)
                .at("/comment/id").longValue();

        assertThat(request("DELETE", path(slug) + "/" + id, owner, null, 403).at("/errors/comment/0").stringValue())
                .isEqualTo("forbidden");
        assertThat(request("DELETE", path(other) + "/" + id, writer, null, 404).at("/errors/comment/0").stringValue())
                .isEqualTo("not found");
        assertThat(request("GET", path(slug), null, null, 200).at("/comments/0/id").longValue()).isEqualTo(id);
        request("DELETE", path(slug) + "/" + id, writer, null, 204);
        assertThat(request("GET", path(slug), null, null, 200).get("comments").isEmpty()).isTrue();

        long cascaded = request("POST", path(slug), owner, Map.of("comment", Map.of("body", "Last reply")), 201)
                .at("/comment/id").longValue();
        request("DELETE", "/articles/" + slug, owner, null, 204);
        assertThat(jdbc.sql("SELECT count(*) FROM comments WHERE id = ?").param(cascaded).query(Long.class).single()).isZero();
    }

    @Test
    void missingAuthArticleCommentAndBlankInputHaveDistinctErrors() throws Exception {
        String token = register("error-" + UUID.randomUUID());
        String missing = path("absent-" + UUID.randomUUID());
        var valid = Map.of("comment", Map.of("body", "reply"));
        request("POST", missing, null, valid, 401);
        request("DELETE", missing + "/1", null, null, 401);
        assertThat(request("GET", missing, null, null, 404).at("/errors/article/0").stringValue()).isEqualTo("not found");
        assertThat(request("POST", missing, token, valid, 404).at("/errors/article/0").stringValue()).isEqualTo("not found");
        assertThat(request("DELETE", missing + "/1", token, null, 404).at("/errors/article/0").stringValue()).isEqualTo("not found");
        String existing = path(article(token));
        assertThat(request("DELETE", existing + "/1", token, null, 404).at("/errors/comment/0").stringValue()).isEqualTo("not found");
        assertThat(request("POST", existing, token, Map.of("comment", Map.of("body", "  ")), 422).at("/errors/body/0").stringValue())
                .isEqualTo("can't be blank");
    }
}
