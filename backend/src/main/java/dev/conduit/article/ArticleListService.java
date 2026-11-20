package dev.conduit.article;

import dev.conduit.tag.TagService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ArticleListService {
    private final ArticleListRepository articles;
    private final TagService tags;

    public ArticleListService(ArticleListRepository articles, TagService tags) {
        this.articles = articles;
        this.tags = tags;
    }

    public record Page(List<ArticleSummary> articles, long articlesCount) {}

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page page(ArticleListRepository.Filters filters, Long viewer, long limit, long offset) {
        var matches = ArticleListRepository.Selection.matching(filters);
        long total = articles.count(matches);
        if (offset >= total) return new Page(List.of(), total);
        var rows = articles.page(matches, viewer, limit, offset);
        var tagLists = tags.forArticles(rows.stream().map(ArticleListRepository.Row::id).toList());
        var summaries = rows.stream().map(row -> row.withTags(tagLists.getOrDefault(row.id(), List.of()))).toList();
        return new Page(summaries, total);
    }
}
