package dev.conduit;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UserApiTest extends ApiTest {
    private String username() {
        return "u" + UUID.randomUUID().toString().replace("-", "");
    }

    @Test
    void registrationLoginAndCurrentUserExposeOnlyFiveFields() throws Exception {
        String name = username();
        String email = name + "@example.test";
        String password = "new-password";
        var user = request("POST", "/users", null, Map.of("user", Map.of(
                "username", name, "email", email.toUpperCase(java.util.Locale.ROOT), "password", password)), 201).get("user");
        assertThat(user.propertyNames()).containsExactlyInAnyOrder("username", "email", "token", "bio", "image");
        assertThat(user.get("email").stringValue()).isEqualTo(email);
        assertThat(user.get("bio").isNull()).isTrue();
        assertThat(user.get("image").isNull()).isTrue();
        assertThat(jdbc.sql("SELECT password_hash FROM users WHERE email=?")
                .param(email).query(String.class).single()).startsWith("$2").doesNotContain(password);
        String token = request("POST", "/users/login", null, Map.of("user", Map.of(
                "email", email, "password", password)), 200).at("/user/token").stringValue();
        assertThat(token.split("\\.")).hasSize(3);
        assertThat(request("GET", "/user", token, null, 200).at("/user/username").stringValue()).isEqualTo(name);
        var denied = request("POST", "/users/login", null, Map.of("user", Map.of(
                "email", email, "password", "not correct")), 401);
        assertThat(denied.at("/errors/credentials/0").stringValue()).isEqualTo("invalid");
    }

    @Test
    void duplicateAndInvalidFieldsHaveFieldScopedErrors() throws Exception {
        String name = username();
        String token = register(name);
        String other = username();
        register(other);
        for (String key : new String[]{"email", "username"}) {
            var duplicate = Map.of("email", (key.equals("email") ? name : username()) + "@example.test",
                    "username", key.equals("username") ? name : username(), "password", "password123");
            assertThat(request("POST", "/users", null, Map.of("user", duplicate), 409)
                    .at("/errors/" + key + "/0").stringValue()).isEqualTo("has already been taken");
            assertThat(request("PUT", "/user", token,
                    Map.of("user", Map.of(key, key.equals("email") ? other + "@example.test" : other)), 409)
                    .at("/errors/" + key + "/0").stringValue()).isEqualTo("has already been taken");
        }
        var failures = request("POST", "/users", null, Map.of("user", Map.of(
                "username", "", "email", "invalid", "password", "")), 422).get("errors");
        assertThat(failures.at("/email/0").stringValue()).isEqualTo("is invalid");
        assertThat(failures.at("/password/0").stringValue()).isEqualTo("can't be blank");
        assertThat(failures.at("/username/0").stringValue()).isEqualTo("can't be blank");
        assertThat(request("GET", "/user", null, null, 401).at("/errors/token/0").stringValue()).isEqualTo("is missing");
        request("PUT", "/user", null, Map.of("user", Map.of()), 401);
    }

    @Test
    void malformedCredentialsAndTokensForDeletedUsersAreRejected() throws Exception {
        String name = username();
        String token = register(name);
        assertThat(request("GET", "/user", "broken.token", null, 401)
                .at("/errors/token/0").stringValue()).isEqualTo("is invalid");
        jdbc.sql("DELETE FROM users WHERE username = ?").param(name).update();
        assertThat(request("GET", "/user", token, null, 401)
                .at("/errors/token/0").stringValue()).isEqualTo("is invalid");
    }

    @Test
    void patchDistinguishesOmissionFromNullAndChecksTheNewPassword() throws Exception {
        String name = username();
        String token = register(name);
        String newName = username();
        request("PUT", "/user", token, Map.of("user", Map.of("bio", "here", "image", "https://example.test/a",
                "username", newName, "password", "new-password-123")), 200);
        var reset = new LinkedHashMap<String, String>();
        reset.put("bio", null);
        var updated = request("PUT", "/user", token, Map.of("user", reset), 200).get("user");
        assertThat(updated.get("bio").isNull()).isTrue();
        assertThat(updated.get("image").stringValue()).isEqualTo("https://example.test/a");
        assertThat(updated.get("username").stringValue()).isEqualTo(newName);
        assertThat(request("PUT", "/user", token, Map.of("user", Map.of("image", "")), 200)
                .at("/user/image").isNull()).isTrue();
        reset.clear();
        reset.put("email", null);
        request("PUT", "/user", token, Map.of("user", reset), 422);
        request("PUT", "/user", token, Map.of("user", Map.of("password", "short")), 422);
        request("POST", "/users/login", null, Map.of("user", Map.of(
                "email", name + "@example.test", "password", "password123")), 401);
        request("POST", "/users/login", null, Map.of("user", Map.of(
                "email", name + "@example.test", "password", "new-password-123")), 200);
    }
}
