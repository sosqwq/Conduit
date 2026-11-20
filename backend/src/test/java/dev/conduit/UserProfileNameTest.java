package dev.conduit;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UserProfileNameTest extends ApiTest {
    private String profilePath(String name) {
        return "/profiles/" + URLEncoder.encode(name, StandardCharsets.UTF_8).replace("+", "%20");
    }

    @Test
    void registrationAndRenameRejectNamesThatCannotBeProfilePathSegments() throws Exception {
        String existing = "existing-" + UUID.randomUUID();
        String token = register(existing);
        for (String invalid : new String[]{".", "..", "a/b", "a\\b", "a;b", "a%b", "a\tb", "a\u007fb", "   ", "\u00a0"}) {
            var registration = Map.of("user", Map.of("username", invalid, "email", UUID.randomUUID() + "@example.test",
                    "password", "password123"));
            assertThat(request("POST", "/users", null, registration, 422).at("/errors/username/0").isString()).isTrue();
            assertThat(request("PUT", "/user", token, Map.of("user", Map.of("username", invalid)), 422)
                    .at("/errors/username/0").isString()).isTrue();
        }
        assertThat(request("GET", "/user", token, null, 200).at("/user/username").stringValue()).isEqualTo(existing);
    }

    @Test
    void unicodeAndOrdinaryPunctuationRoundTripThroughPublicProfiles() throws Exception {
        String viewer = register("viewer-" + UUID.randomUUID());
        for (String prefix : new String[]{"小林.读书-", "Amélie-", "two words-", "why?yes#-"}) {
            String name = prefix + UUID.randomUUID();
            var registration = Map.of("user", Map.of("username", name, "email", UUID.randomUUID() + "@example.test",
                    "password", "password123"));
            request("POST", "/users", null, registration, 201);
            assertThat(request("GET", profilePath(name), null, null, 200).at("/profile/username").stringValue()).isEqualTo(name);
            assertThat(request("POST", profilePath(name) + "/follow", viewer, null, 200)
                    .at("/profile/following").booleanValue()).isTrue();
        }
    }

    @Test
    void oldAccountsWithAnUnaddressableNameCanLoginAndChooseANewName() throws Exception {
        String original = "legacy-" + UUID.randomUUID();
        register(original);
        jdbc.sql("UPDATE users SET username = ? WHERE username = ?").params(original + "/old", original).update();
        String token = request("POST", "/users/login", null, Map.of("user", Map.of(
                "email", original + "@example.test", "password", "password123")), 200).at("/user/token").stringValue();
        request("PUT", "/user", token, Map.of("user", Map.of("bio", "still here")), 200);
        String newName = "读者." + original;
        var updated = request("PUT", "/user", token, Map.of("user", Map.of("username", newName)), 200);
        assertThat(updated.at("/user/username").stringValue()).isEqualTo(newName);
        assertThat(request("GET", profilePath(newName), null, null, 200).at("/profile/bio").stringValue()).isEqualTo("still here");
    }
}
