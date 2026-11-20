package dev.conduit;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProfileApiTest extends ApiTest {
    private String name() {
        return "profile_" + UUID.randomUUID().toString().replace("-", "");
    }

    @Test
    void viewingAProfileRevealsExactlyFourPublicFields() throws Exception {
        String target = name();
        String token = register(target);
        request("PUT", "/user", token, Map.of("user", Map.of("bio", "A writer", "image", "https://example.test/me")), 200);
        var data = request("GET", "/profiles/" + target, null, null, 200);
        assertThat(data.propertyNames()).containsExactly("profile");
        var profile = data.get("profile");
        assertThat(profile.propertyNames()).containsExactlyInAnyOrder("username", "bio", "image", "following");
        assertThat(profile.get("username").stringValue()).isEqualTo(target);
        assertThat(profile.get("bio").stringValue()).isEqualTo("A writer");
        assertThat(profile.get("image").stringValue()).isEqualTo("https://example.test/me");
        assertThat(profile.get("following").booleanValue()).isFalse();
    }

    @Test
    void followsAreDirectionalViewerSpecificAndIdempotent() throws Exception {
        String viewer = name();
        String viewerToken = register(viewer);
        String target = name();
        String targetToken = register(target);
        String path = "/profiles/" + target;
        for (int i = 0; i < 2; i++) {
            assertThat(request("POST", path + "/follow", viewerToken, null, 200).at("/profile/following").booleanValue()).isTrue();
        }
        assertThat(request("GET", path, viewerToken, null, 200).at("/profile/following").booleanValue()).isTrue();
        assertThat(request("GET", "/profiles/" + viewer, targetToken, null, 200).at("/profile/following").booleanValue()).isFalse();
        assertThat(request("GET", path, null, null, 200).at("/profile/following").booleanValue()).isFalse();
        for (int i = 0; i < 2; i++) {
            assertThat(request("DELETE", path + "/follow", viewerToken, null, 200).at("/profile/following").booleanValue()).isFalse();
        }
        assertThat(request("GET", path, viewerToken, null, 200).at("/profile/following").booleanValue()).isFalse();
    }

    @Test
    void missingUserAndSelfFollowReturnScopedErrors() throws Exception {
        String viewer = name();
        String token = register(viewer);
        String missing = "/profiles/" + name();
        assertThat(request("GET", missing, null, null, 404).at("/errors/profile/0").stringValue()).isEqualTo("not found");
        for (String method : new String[]{"POST", "DELETE"}) {
            assertThat(request(method, missing + "/follow", null, null, 401)
                    .at("/errors/token/0").stringValue()).isEqualTo("is missing");
            assertThat(request(method, missing + "/follow", token, null, 404)
                    .at("/errors/profile/0").stringValue()).isEqualTo("not found");
        }
        assertThat(request("POST", "/profiles/" + viewer + "/follow", token, null, 422)
                .at("/errors/profile/0").stringValue()).contains("yourself");
    }
}
