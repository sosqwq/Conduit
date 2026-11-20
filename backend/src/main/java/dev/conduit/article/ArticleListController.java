package dev.conduit.article;

import dev.conduit.common.ApiException;
import dev.conduit.common.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/articles")
public class ArticleListController {
    private final ArticleListService lists;

    public ArticleListController(ArticleListService lists) {
        this.lists = lists;
    }

    @GetMapping
    public ArticleListService.Page all(@RequestParam(required = false) String tag,
            @RequestParam(required = false) String author, @RequestParam(required = false) String favorited,
            @RequestParam(defaultValue = "20") String limit, @RequestParam(defaultValue = "0") String offset) {
        var filters = new ArticleListRepository.Filters(tag, author, favorited, null);
        return lists.page(filters, CurrentUser.optionalId(), number("limit", limit, 1), number("offset", offset, 0));
    }

    @GetMapping("/feed")
    public ArticleListService.Page feed(@RequestParam(defaultValue = "20") String limit,
            @RequestParam(defaultValue = "0") String offset) {
        long viewer = CurrentUser.requiredId();
        var filters = new ArticleListRepository.Filters(null, null, null, viewer);
        return lists.page(filters, viewer, number("limit", limit, 1), number("offset", offset, 0));
    }

    private static long number(String field, String raw, long minimum) {
        try {
            long value = Long.parseLong(raw);
            if (value >= minimum) return value;
        } catch (NumberFormatException invalid) {
            // Values outside the numeric range receive the same field-level error.
        }
        throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, field, "must be an integer of at least " + minimum);
    }
}
