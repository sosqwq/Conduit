package dev.conduit.comment;

import dev.conduit.common.ApiException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommentService {
    private final CommentRepository comments;

    public CommentService(CommentRepository comments) {
        this.comments = comments;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<CommentView> list(String slug, Long viewerId) {
        return comments.list(articleId(slug, false), viewerId);
    }

    @Transactional
    public CommentView create(String slug, long viewerId, String body) {
        return comments.insert(articleId(slug, true), viewerId, body);
    }

    @Transactional
    public void delete(String slug, long id, long viewerId) {
        long articleId = articleId(slug, true);
        long author = comments.lockAuthor(articleId, id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "comment", "not found"));
        if (author != viewerId) {
            throw new ApiException(HttpStatus.FORBIDDEN, "comment", "forbidden");
        }
        comments.delete(articleId, id);
    }

    private long articleId(String slug, boolean lock) {
        return comments.articleId(slug, lock)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "article", "not found"));
    }
}
