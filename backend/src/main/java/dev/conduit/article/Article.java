package dev.conduit.article;

import dev.conduit.user.User;
import jakarta.persistence.*;
import java.text.Normalizer;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import org.springframework.data.domain.Persistable;

@Entity
@Table(name = "articles")
public class Article implements Persistable<Long> {
    @Id
    Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    User author;
    @Column(nullable = false, unique = true, length = 320)
    String slug;
    @Column(nullable = false)
    String title;
    @Column(nullable = false, columnDefinition = "text")
    String description;
    @Column(nullable = false, columnDefinition = "text")
    String body;
    @Column(name = "created_at", nullable = false, updatable = false)
    Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    Instant updatedAt;

    protected Article() {}

    Article(long id, User author, String title, String description, String body) {
        this.id = id;
        this.author = author;
        this.title = title;
        this.description = description;
        this.body = body;
    }

    @Override
    public Long getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return createdAt == null;
    }

    @PrePersist
    void initialize() {
        slug = stem(title) + "-" + id;
        createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        updatedAt = createdAt;
    }

    void revise(String newTitle, String newDescription, String newBody) {
        if (!title.equals(newTitle)) {
            String stem = stem(newTitle);
            String candidate = stem + "-" + id;
            // Case, accents and punctuation may normalize to the same URL.
            slug = candidate.equals(slug) ? stem + "-edit-" + id : candidate;
        }
        title = newTitle;
        description = newDescription;
        body = newBody;
        updatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
    }

    private static String stem(String title) {
        String prefix = Normalizer.normalize(title, Normalizer.Form.NFKD).toLowerCase(Locale.ROOT)
                .replaceAll("\\p{M}+", "").replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (prefix.length() > 255) {
            prefix = prefix.substring(0, 255).replaceFirst("-$", "");
        }
        return prefix.isEmpty() ? "article" : prefix;
    }
}
