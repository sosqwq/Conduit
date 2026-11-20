package dev.conduit.user;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import tools.jackson.databind.JsonNode;

final class UserForms {
    private UserForms() {}

    // Dot segments are normalized by browsers. Encoded separators, semicolons and percent signs
    // are rejected by the HTTP stack. Keep ordinary Unicode names, including internal spaces.
    private static final String PROFILE_SEGMENT = "(?!\\.{1,2}\\z)(?!\\p{Z}+\\z)[^/\\\\;%\\p{Cc}]*";

    record Registration(@NotBlank(message = "can't be blank") @Size(max = 100, message = "is too long")
                        @Pattern(regexp = PROFILE_SEGMENT, message = "cannot be used in a profile URL") String username,
                        @NotBlank(message = "can't be blank") @Email(message = "is invalid")
                        @Size(max = 254, message = "is too long") String email,
                        @NotBlank(message = "can't be blank") String password) {
        Registration {
            username = username == null ? null : username.strip();
            email = normalizeEmail(email);
        }
    }

    record Login(@NotBlank(message = "can't be blank") @Email(message = "is invalid")
                 @Size(max = 254, message = "is too long") String email,
                 @NotBlank(message = "can't be blank") String password) {
        Login {
            email = normalizeEmail(email);
        }
    }

    record RegisterRequest(@NotNull(message = "can't be blank") @Valid Registration user) {}
    record LoginRequest(@NotNull(message = "can't be blank") @Valid Login user) {}
    record UpdateRequest(@NotNull(message = "can't be blank") JsonNode user) {}
    record UserResponse(String username, String email, String bio, String image, String token) {}
    record Envelope(UserResponse user) {}

    private static String normalizeEmail(String email) {
        return email == null ? null : email.strip().toLowerCase(Locale.ROOT);
    }
}
