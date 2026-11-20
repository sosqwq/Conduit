package dev.conduit;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

class FavoriteApiTest extends ApiTest {
    private String name() {
        return "fan_" + UUID.randomUUID().toString().replace("-", "");
    }

    private String publish(String author) throws Exception {
        return request("POST", "/articles", author, Map.of("article", Map.of(
                "title", "Shared article", "description", "Intro", "body", "Markdown")), 201)
                .at("/article/slug").stringValue();
    }

    @Test
    void favoriteResponsesReflectTheViewerAndPublicListsReflectCurrentCounts() throws Exception {
        String author = register(name());
        String username = name(), first = register(username), second = register(name());
        String slug = publish(author), path = "/articles/" + slug;
        var favorited = request("POST", path + "/favorite", first, null, 200).get("article");
        assertThat(favorited.get("favorited").booleanValue()).isTrue();
        assertThat(favorited.get("favoritesCount").asInt()).isOne();
        assertThat(favorited.get("body").stringValue()).isEqualTo("Markdown");
        var other = request("GET", path, second, null, 200).get("article");
        assertThat(other.get("favorited").booleanValue()).isFalse();
        assertThat(other.get("favoritesCount").asInt()).isOne();
        assertThat(request("POST", path + "/favorite", second, null, 200).at("/article/favoritesCount").asInt()).isEqualTo(2);

        var list = request("GET", "/articles?favorited=" + username, null, null, 200);
        assertThat(list.get("articlesCount").asInt()).isOne();
        assertThat(list.at("/articles/0/slug").stringValue()).isEqualTo(slug);
        assertThat(list.at("/articles/0/favorited").booleanValue()).isFalse();
        assertThat(list.at("/articles/0/favoritesCount").asInt()).isEqualTo(2);
        assertThat(request("GET", "/articles?favorited=" + username, first, null, 200)
                .at("/articles/0/favorited").booleanValue()).isTrue();

        var removed = request("DELETE", path + "/favorite", first, null, 200).get("article");
        assertThat(removed.get("favorited").booleanValue()).isFalse();
        assertThat(removed.get("favoritesCount").asInt()).isOne();
        assertThat(request("GET", "/articles?favorited=" + username, null, null, 200).get("articlesCount").asInt()).isZero();
        assertThat(request("GET", path, second, null, 200).at("/article/favorited").booleanValue()).isTrue();
    }

    @Test
    void concurrentRetriesSetTheSameRelationshipOnce() throws Exception {
        String reader = register(name());
        String slug = publish(reader);
        String path = "/articles/" + slug + "/favorite";
        for (String method : List.of("POST", "DELETE")) {
            boolean desired = method.equals("POST");
            var start = new CountDownLatch(1);
            Callable<JsonNode> change = () -> {
                start.await();
                return request(method, path, reader, null, 200).get("article");
            };
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                var a = executor.submit(change);
                var b = executor.submit(change);
                var c = executor.submit(change);
                start.countDown();
                for (var reply : List.of(a, b, c)) {
                    var article = reply.get();
                    assertThat(article.get("favorited").booleanValue()).isEqualTo(desired);
                    assertThat(article.get("favoritesCount").asInt()).isEqualTo(desired ? 1 : 0);
                }
            }
        }
        assertThat(request("GET", "/articles/" + slug, reader, null, 200).at("/article/favoritesCount").asInt()).isZero();
    }

    @Test
    void missingAuthenticationAndMissingArticlesReturnScopedErrors() throws Exception {
        String token = register(name());
        String missing = "/articles/unknown-" + UUID.randomUUID() + "/favorite";
        for (String method : List.of("POST", "DELETE")) {
            assertThat(request(method, missing, null, null, 401).at("/errors/token/0").stringValue()).isEqualTo("is missing");
            assertThat(request(method, missing, token, null, 404).at("/errors/article/0").stringValue()).isEqualTo("not found");
        }
    }
}
