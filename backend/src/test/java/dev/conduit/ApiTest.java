package dev.conduit;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

public abstract class ApiTest extends PostgresIntegrationTest {
    private final HttpClient client = HttpClient.newHttpClient();
    protected final JsonMapper json = JsonMapper.shared();

    protected JsonNode request(String method, String path, String token, Object body, int expected) throws Exception {
        var uri = URI.create("http://localhost:" + port + "/api" + path);
        var builder = HttpRequest.newBuilder(uri);
        if (token != null) {
            builder.header("Authorization", "Token " + token);
        }
        var publisher = HttpRequest.BodyPublishers.noBody();
        if (body != null) {
            builder.header("Content-Type", "application/json");
            publisher = HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body));
        }
        var response = client.send(builder.method(method, publisher).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as("%s %s: %s", method, path, response.body()).isEqualTo(expected);
        return response.body().isBlank() ? json.nullNode() : json.readTree(response.body());
    }

    protected String register(String username) throws Exception {
        return request("POST", "/users", null, Map.of("user", Map.of(
                "username", username, "email", username + "@example.test", "password", "password123")), 201)
                .at("/user/token").stringValue();
    }
}
