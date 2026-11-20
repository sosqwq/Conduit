package dev.conduit.article;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.NativeQuery;
import org.springframework.data.jpa.repository.Query;

public interface ArticleRepository extends JpaRepository<Article, Long> {
    @NativeQuery("SELECT nextval(pg_get_serial_sequence('articles', 'id'))")
    long nextId();

    @EntityGraph(attributePaths = "author")
    Optional<Article> findBySlug(String slug);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Article a where a.slug = :slug")
    Optional<Article> lockBySlug(String slug);

    interface FavoriteStats {
        long getTotal();
        boolean getFavorited();
    }

    @NativeQuery("""
            SELECT count(*) AS total, coalesce(bool_or(user_id = :viewerId), false) AS favorited
            FROM favorites WHERE article_id = :articleId
            """)
    FavoriteStats favorites(long articleId, Long viewerId);
}
