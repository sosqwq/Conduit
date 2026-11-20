package dev.conduit.article;

import dev.conduit.common.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/articles")
public class ArticleController {
    private final ArticleService articles;

    public ArticleController(ArticleService articles) {
        this.articles = articles;
    }

    @GetMapping("/{slug}")
    public ArticleForms.Response get(@PathVariable String slug) {
        return new ArticleForms.Response(articles.get(slug, CurrentUser.optionalId()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ArticleForms.Response create(@Valid @RequestBody ArticleForms.Request request) {
        return new ArticleForms.Response(articles.create(request.article(), CurrentUser.requiredId()));
    }

    @PutMapping("/{slug}")
    public ArticleForms.Response update(@PathVariable String slug, @Valid @RequestBody ArticleForms.Request request) {
        return new ArticleForms.Response(articles.update(slug, request.article(), CurrentUser.requiredId()));
    }

    @DeleteMapping("/{slug}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String slug) {
        articles.delete(slug, CurrentUser.requiredId());
    }
}
