package dev.conduit.comment;

import dev.conduit.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/articles/{slug}/comments")
public class CommentController {
    private final CommentService comments;

    public CommentController(CommentService comments) {
        this.comments = comments;
    }

    public record Input(@NotBlank(message = "can't be blank") String body) {}
    public record Request(@NotNull(message = "can't be blank") @Valid Input comment) {}
    public record Single(CommentView comment) {}
    public record Multiple(List<CommentView> comments) {}

    @GetMapping
    public Multiple list(@PathVariable String slug) {
        return new Multiple(comments.list(slug, CurrentUser.optionalId()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Single create(@PathVariable String slug, @Valid @RequestBody Request request) {
        return new Single(comments.create(slug, CurrentUser.requiredId(), request.comment().body()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String slug, @PathVariable long id) {
        comments.delete(slug, id, CurrentUser.requiredId());
    }
}
