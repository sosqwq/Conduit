package dev.conduit.tag;

import dev.conduit.common.ApiException;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TagService {
    private final TagRepository tags;

    public TagService(TagRepository tags) {
        this.tags = tags;
    }

    @Transactional(readOnly = true)
    public List<String> all() {
        return tags.all();
    }

    @Transactional(readOnly = true)
    public List<String> forArticle(long articleId) {
        return tags.forArticle(articleId);
    }

    @Transactional
    public void replace(long articleId, List<String> tagNames) {
        if (tagNames == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "tagList", "is invalid");
        }
        var distinct = new LinkedHashSet<String>();
        for (String raw : tagNames) {
            if (raw == null || raw.isBlank()) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "tagList", "can't be blank");
            }
            String name = raw.strip();
            if (name.codePointCount(0, name.length()) > 100) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "tagList", "is too long");
            }
            distinct.add(name);
        }
        tags.clearLinks(articleId);
        if (!distinct.isEmpty()) {
            tags.addLinks(articleId, distinct.toArray(String[]::new));
        }
    }
}
