package dev.conduit;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

class ArticleApiTest extends ApiTest {
    private String name() {
        return "writer_" + UUID.randomUUID().toString().replace("-", "");
    }

    private Map<String, Object> fields(String title) {
        return Map.of("title", title, "description", "Short introduction", "body", "**Source**",
                "tagList", List.of("second", "first", "second"));
    }

    private JsonNode create(String token, String title) throws Exception {
        var result = request("POST", "/articles", token, Map.of("article", fields(title)), 201);
        assertThat(result.propertyNames()).containsExactly("article");
        return result.get("article");
    }

    @Test
    void detailUsesPublicAuthorFieldsAndKeepsTagOrderAndTimestamps() throws Exception {
        String author = name();
        String token = register(author);
        String viewer = register(name());
        request("POST", "/profiles/" + author + "/follow", viewer, null, 200);
        var created = create(token, "Café Companion");
        String slug = created.get("slug").stringValue();
        assertThat(slug).startsWith("cafe-companion-");
        var article = request("GET", "/articles/" + slug, null, null, 200).get("article");
        assertThat(article).isEqualTo(created);
        assertThat(article.propertyNames()).containsExactlyInAnyOrder("slug", "title", "description", "body",
                "tagList", "createdAt", "updatedAt", "favorited", "favoritesCount", "author");
        assertThat(article.get("tagList")).isEqualTo(json.valueToTree(List.of("second", "first")));
        assertThat(article.get("favorited").booleanValue()).isFalse();
        assertThat(article.get("favoritesCount").asInt()).isZero();
        assertThat(article.get("author").propertyNames()).containsExactlyInAnyOrder("username", "image", "bio", "following");
        assertThat(article.at("/author/username").stringValue()).isEqualTo(author);
        assertThat(article.at("/author/following").booleanValue()).isFalse();
        assertThat(request("GET", "/articles/" + slug, viewer, null, 200)
                .at("/article/author/following").booleanValue()).isTrue();
    }

    @Test
    void titlesCanRepeatAndRenamesMoveOnlyThatArticle() throws Exception {
        String token = register(name());
        var first = create(token, "Daily notes");
        String old = first.get("slug").stringValue();
        var second = create(token, "Daily notes");
        assertThat(second.get("slug").stringValue()).isNotEqualTo(old);
        String path = "/articles/" + old;
        var edited = request("PUT", path, token, Map.of("article", Map.of("body", "Updated")), 200).get("article");
        assertThat(edited.get("slug").stringValue()).isEqualTo(old);
        assertThat(edited.get("createdAt")).isEqualTo(first.get("createdAt"));
        assertThat(edited.get("updatedAt")).isNotEqualTo(first.get("updatedAt"));
        assertThat(edited.get("tagList")).isEqualTo(first.get("tagList"));
        var renamed = request("PUT", path, token, Map.of("article", Map.of(
                "title", "Field guide", "tagList", List.of())), 200).get("article");
        String next = renamed.get("slug").stringValue();
        assertThat(next).startsWith("field-guide-").isNotEqualTo(old);
        assertThat(renamed.get("tagList").size()).isZero();
        request("GET", path, null, null, 404);
        assertThat(request("GET", "/articles/" + next, null, null, 200).get("article")).isEqualTo(renamed);
        assertThat(request("DELETE", "/articles/" + next, token, null, 204).isNull()).isTrue();
        assertThat(request("GET", "/articles/" + next, null, null, 404).at("/errors/article/0").stringValue())
                .isEqualTo("not found");
        request("GET", "/articles/" + second.get("slug").stringValue(), null, null, 200);
    }

    @Test
    void authenticatedNonAuthorsCannotEditOrDelete() throws Exception {
        String owner = register(name());
        String stranger = register(name());
        var article = create(owner, "Permissions");
        String path = "/articles/" + article.get("slug").stringValue();
        var update = Map.of("article", Map.of("body", "Changed"));
        for (var method : List.of("PUT", "DELETE")) {
            Object body = method.equals("PUT") ? update : null;
            assertThat(request(method, path, null, body, 401).at("/errors/token/0").stringValue()).isEqualTo("is missing");
            assertThat(request(method, path, stranger, body, 403).at("/errors/article/0").stringValue()).isEqualTo("forbidden");
            request(method, "/articles/missing-" + UUID.randomUUID(), owner, body, 404);
        }
        request("POST", "/articles", null, Map.of("article", fields("Unauthorized")), 401);
        assertThat(request("GET", path, null, null, 200).get("article")).isEqualTo(article);
    }

    @Test
    void invalidPatchesPreserveExistingArticleAndTags() throws Exception {
        String token = register(name());
        for (String field : List.of("title", "description", "body")) {
            var invalid = new HashMap<>(fields("Validation"));
            invalid.put(field, " ");
            assertThat(request("POST", "/articles", token, Map.of("article", invalid), 422)
                    .at("/errors/" + field + "/0").stringValue()).isEqualTo("can't be blank");
        }
        var original = create(token, "Validation");
        String path = "/articles/" + original.get("slug").stringValue();
        var patch = new HashMap<String, Object>();
        patch.put("title", "Proposed name");
        patch.put("tagList", null);
        request("PUT", path, token, Map.of("article", patch), 422);
        patch.put("tagList", List.of("new", " "));
        request("PUT", path, token, Map.of("article", patch), 422);
        assertThat(request("GET", path, null, null, 200).get("article")).isEqualTo(original);
    }
}
