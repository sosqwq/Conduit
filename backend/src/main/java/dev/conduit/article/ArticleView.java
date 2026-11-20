package dev.conduit.article;

import dev.conduit.profile.ProfileView;
import java.time.Instant;
import java.util.List;

public record ArticleView(String slug, String title, String description, String body, List<String> tagList,
                          Instant createdAt, Instant updatedAt, boolean favorited, long favoritesCount,
                          ProfileView author) {}
