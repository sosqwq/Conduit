package dev.conduit;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

class TagApiTest extends ApiTest {
    @Test
    void tagsArePublicAndIncludeTheStoredNames() throws Exception {
        String tag = "tag-" + UUID.randomUUID();
        jdbc.sql("INSERT INTO tags(name) VALUES (?)").param(tag).update();
        var result = request("GET", "/tags", null, null, 200);
        assertThat(result.propertyNames()).containsExactly("tags");
        assertThat(result.get("tags").isArray()).isTrue();
        assertThat(result.get("tags").values()).extracting(JsonNode::stringValue).containsOnlyOnce(tag);
    }

    @Test
    void simultaneousArticlesShareNamesWhileKeepingTheirOwnOrder() throws Exception {
        String seed = UUID.randomUUID().toString();
        String token = register("tag_" + seed);
        String first = "b-" + seed;
        String second = "a-" + seed;
        Callable<JsonNode> one = () -> create(token, "one-" + seed, List.of(first, second, first));
        Callable<JsonNode> two = () -> create(token, "two-" + seed, List.of(second, first));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var results = pool.invokeAll(List.of(one, two));
            var articleOne = results.get(0).get();
            var articleTwo = results.get(1).get();
            assertThat(articleOne.get("tagList").values()).extracting(JsonNode::stringValue).containsExactly(first, second);
            assertThat(articleTwo.get("tagList").values()).extracting(JsonNode::stringValue).containsExactly(second, first);
            request("PUT", "/articles/" + articleOne.get("slug").stringValue(), token,
                    Map.of("article", Map.of("tagList", List.of())), 200);
            var surviving = request("GET", "/articles/" + articleTwo.get("slug").stringValue(), null, null, 200);
            assertThat(surviving.at("/article/tagList").values()).extracting(JsonNode::stringValue).containsExactly(second, first);
            var tags = request("GET", "/tags", null, null, 200).get("tags");
            assertThat(tags.values()).extracting(JsonNode::stringValue).containsOnlyOnce(first, second);
        }
    }

    private JsonNode create(String token, String title, List<String> tags) throws Exception {
        var input = Map.of("article", Map.of("title", title, "description", "summary", "body", "body", "tagList", tags));
        return request("POST", "/articles", token, input, 201).get("article");
    }
}
