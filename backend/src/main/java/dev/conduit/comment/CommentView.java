package dev.conduit.comment;

import dev.conduit.profile.ProfileView;
import java.time.Instant;

public record CommentView(long id, Instant createdAt, Instant updatedAt, String body, ProfileView author) {}
