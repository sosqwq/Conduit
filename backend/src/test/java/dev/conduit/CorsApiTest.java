package dev.conduit;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.util.TestPropertyValues;
import org.springframework.context.ConfigurableApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;

class CorsApiTest extends PostgresIntegrationTest {
    private final HttpClient client = HttpClient.newHttpClient();
    private ConfigurableApplicationContext application;

    @Override
    protected void customize(ConfigurableApplicationContext context) {
        application = context;
        TestPropertyValues.of("CONDUIT_ALLOWED_ORIGINS=https://blog.example, https://editor.example:8443")
                .applyTo(context.getEnvironment());
    }

    private HttpResponse<String> preflight(String origin, String method) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/user"))
                .header("Origin", origin)
                .header("Access-Control-Request-Method", method)
                .header("Access-Control-Request-Headers", "Authorization, Content-Type")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void exactOriginsCanPreflightTokenWritesWithoutLoggingIn() throws Exception {
        for (String origin : new String[]{"https://blog.example", "https://editor.example:8443"}) {
            var result = preflight(origin, "PUT");
            assertThat(result.statusCode()).isEqualTo(200);
            assertThat(result.headers().firstValue("Access-Control-Allow-Origin")).hasValue(origin);
            assertThat(result.headers().firstValue("Access-Control-Allow-Methods").orElseThrow()).contains("PUT");
            assertThat(result.headers().firstValue("Access-Control-Allow-Headers").orElseThrow().toLowerCase())
                    .contains("authorization", "content-type");
            assertThat(result.headers().firstValue("Access-Control-Allow-Credentials")).isEmpty();
        }
    }

    @Test
    void rejectsOtherOriginsAndUnlistedMethods() throws Exception {
        for (String origin : new String[]{"https://blog.example.attacker.test", "http://blog.example", "https://editor.example"}) {
            var result = preflight(origin, "PUT");
            assertThat(result.statusCode()).isEqualTo(403);
            assertThat(result.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
        }
        assertThat(preflight("https://blog.example", "PATCH").statusCode()).isEqualTo(403);
    }

    @Test
    void onlyTheJwtFilterCanAuthenticateUsers() {
        assertThat(application.getBeansOfType(org.springframework.security.core.userdetails.UserDetailsService.class))
                .as("No generated in-memory account").isEmpty();
    }
}
