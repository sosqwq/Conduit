package dev.conduit;

import dev.conduit.common.TokenService;
import java.time.Instant;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TokenTest {
    private SecretKey key;
    private TokenService tokens;

    @BeforeEach
    void createKey() throws Exception {
        var generator = KeyGenerator.getInstance("HmacSHA256");
        generator.init(256);
        key = generator.generateKey();
        tokens = new TokenService(key);
    }

    @Test
    void issuedTokensCarryTheImmutableUserId() {
        assertThat(tokens.verify(tokens.issue(27))).isEqualTo(27);
    }

    @Test
    void anotherKeyCannotAuthenticateAnAccount() throws Exception {
        String token = tokens.issue(27);
        createKey();
        assertThatThrownBy(() -> tokens.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void expiredTokensAreRejected() {
        String token = sign("conduit", Instant.now().minusSeconds(3600));
        assertThatThrownBy(() -> tokens.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void tokensWithoutAnExpirationAreRejected() {
        String token = sign("conduit", null);
        assertThatThrownBy(() -> tokens.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void anotherIssuerCannotAuthenticateAnAccount() {
        String token = sign("unrelated", Instant.now().plusSeconds(3600));
        assertThatThrownBy(() -> tokens.verify(token)).isInstanceOf(JwtException.class);
    }

    private String sign(String issuer, Instant expiration) {
        var claims = JwtClaimsSet.builder().issuer(issuer).subject("27");
        if (expiration != null) {
            claims.expiresAt(expiration);
        }
        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        return NimbusJwtEncoder.withSecretKey(key).build()
                .encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
    }
}
