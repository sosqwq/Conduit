package dev.conduit.common;

import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductionConfigTest {
    private MockEnvironment production() {
        var environment = new MockEnvironment().withProperty("spring.profiles.active", "prod");
        ConfigDataEnvironmentPostProcessor.applyTo(environment);
        return environment;
    }

    @Test
    void productionCannotResolveDatabaseSettingsWithoutDeploymentValues() {
        var environment = production();
        for (String property : new String[]{"url", "username", "password"}) {
            assertThatThrownBy(() -> environment.getRequiredProperty("spring.datasource." + property))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        environment.setProperty("DATABASE_URL", "jdbc:postgresql://db/conduit");
        environment.setProperty("DATABASE_USERNAME", "writer");
        environment.setProperty("DATABASE_PASSWORD", "provisioned-for-test");
        assertThat(environment.getRequiredProperty("spring.datasource.url")).isEqualTo("jdbc:postgresql://db/conduit");
        assertThat(environment.getRequiredProperty("spring.datasource.username")).isEqualTo("writer");
        assertThat(environment.getRequiredProperty("spring.datasource.password")).isEqualTo("provisioned-for-test");
    }

    @Test
    void wildcardPatternsPathsAndUserInfoCannotBecomeAllowedOrigins() {
        for (String invalid : new String[]{"*", "https://*.example", "https://example/a", "https://name@example",
                "https://example?debug", "https://example#frag", "https://example:65536", "https://example,"}) {
            assertThatThrownBy(() -> CorsConfig.parseOrigins(invalid)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void productionRequiresAConfiguredSigningKeyOfAtLeast256Bits() throws Exception {
        var environment = production();
        var config = new SecurityConfig();
        assertThatThrownBy(() -> config.jwtSigningKey(environment)).hasMessageContaining("CONDUIT_JWT_SECRET");
        environment.setProperty("CONDUIT_JWT_SECRET", Base64.getEncoder().encodeToString(new byte[16]));
        assertThatThrownBy(() -> config.jwtSigningKey(environment)).hasMessageContaining("32 bytes");
        environment.setProperty("CONDUIT_JWT_SECRET", Base64.getEncoder().encodeToString(new byte[32]));
        assertThat(config.jwtSigningKey(environment).getEncoded()).hasSize(32);
    }
}
