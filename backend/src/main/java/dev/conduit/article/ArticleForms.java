package dev.conduit.article;

import dev.conduit.common.ApiException;
import jakarta.validation.constraints.NotNull;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;

final class ArticleForms {
    private ArticleForms() {}
    record Request(@NotNull(message = "can't be blank") JsonNode article) {}
    record Response(ArticleView article) {}

    record Changes(String title, String description, String body, List<String> tagList) {
        static Changes read(JsonNode data, Article current) {
            if (!data.isObject()) {
                throw invalid("article", "is invalid");
            }
            String title = text(data, "title", current == null ? null : current.title);
            if (title.codePointCount(0, title.length()) > 255) {
                throw invalid("title", "is too long");
            }
            String description = text(data, "description", current == null ? null : current.description);
            String body = text(data, "body", current == null ? null : current.body);
            return new Changes(title, description, body, tags(data));
        }

        private static String text(JsonNode data, String field, String fallback) {
            JsonNode value = data.get(field);
            if (value == null && fallback != null) return fallback;
            if (value != null && !value.isNull() && !value.isString()) throw invalid(field, "is invalid");
            if (value == null || value.isNull() || value.stringValue().isBlank()) throw invalid(field, "can't be blank");
            return value.stringValue();
        }

        private static List<String> tags(JsonNode data) {
            JsonNode list = data.get("tagList");
            if (list == null) return null;
            if (!list.isArray()) throw invalid("tagList", "is invalid");
            var result = new ArrayList<String>();
            for (JsonNode tag : list) {
                if (!tag.isString()) throw invalid("tagList", "is invalid");
                result.add(tag.stringValue());
            }
            return result;
        }
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, field, message);
    }
}
