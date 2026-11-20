package dev.conduit.article;

import dev.conduit.common.ApiException;
import dev.conduit.profile.ProfileRepository;
import dev.conduit.profile.ProfileView;
import dev.conduit.tag.TagService;
import dev.conduit.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

@Service
public class ArticleService {
    private final ArticleRepository articles;
    private final UserRepository users;
    private final ProfileRepository profiles;
    private final TagService tags;

    public ArticleService(ArticleRepository articles, UserRepository users, ProfileRepository profiles, TagService tags) {
        this.articles = articles;
        this.users = users;
        this.profiles = profiles;
        this.tags = tags;
    }

    @Transactional(readOnly = true)
    public ArticleView get(String slug, Long viewerId) {
        return view(articles.findBySlug(slug).orElseThrow(ArticleService::notFound), viewerId);
    }

    @Transactional
    public ArticleView create(JsonNode data, long authorId) {
        var changes = ArticleForms.Changes.read(data, null);
        var article = articles.saveAndFlush(new Article(articles.nextId(), users.getReferenceById(authorId),
                changes.title(), changes.description(), changes.body()));
        if (changes.tagList() != null) tags.replace(article.id, changes.tagList());
        return view(article, authorId);
    }

    @Transactional
    public ArticleView update(String slug, JsonNode data, long authorId) {
        Article article = owned(slug, authorId);
        var changes = ArticleForms.Changes.read(data, article);
        article.revise(changes.title(), changes.description(), changes.body());
        if (changes.tagList() != null) tags.replace(article.id, changes.tagList());
        return view(article, authorId);
    }

    @Transactional
    public void delete(String slug, long authorId) {
        articles.delete(owned(slug, authorId));
    }

    private Article owned(String slug, long authorId) {
        var article = articles.lockBySlug(slug).orElseThrow(ArticleService::notFound);
        if (article.author.getId() != authorId) {
            throw new ApiException(HttpStatus.FORBIDDEN, "article", "forbidden");
        }
        return article;
    }

    private ArticleView view(Article article, Long viewerId) {
        var stats = articles.favorites(article.id, viewerId);
        boolean following = viewerId != null && profiles.isFollowing(viewerId, article.author.getId());
        return new ArticleView(article.slug, article.title, article.description, article.body, tags.forArticle(article.id),
                article.createdAt, article.updatedAt, stats.getFavorited(), stats.getTotal(), ProfileView.of(article.author, following));
    }

    static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "article", "not found");
    }
}
