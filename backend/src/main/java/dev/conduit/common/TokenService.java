package dev.conduit.common;

import java.time.Duration;
import java.time.Instant;
import javax.crypto.SecretKey;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
    private static final String ISSUER = "conduit";
    private static final Duration LIFETIME = Duration.ofDays(7);
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;

    public TokenService(SecretKey key) {
        encoder = NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build();
        var verifier = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        verifier.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtIssuerValidator(ISSUER), new JwtTimestampValidator(Duration.ZERO)));
        decoder = verifier;
    }

    public String issue(long userId) {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder()
                .issuer(ISSUER).subject(Long.toString(userId))
                .issuedAt(now).expiresAt(now.plus(LIFETIME)).build();
        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public long verify(String token) {
        Jwt jwt = decoder.decode(token);
        if (jwt.getExpiresAt() == null) {
            throw new BadJwtException("Missing expiration");
        }
        try {
            long id = Long.parseLong(jwt.getSubject());
            if (id > 0) {
                return id;
            }
        } catch (NumberFormatException invalidSubject) {
            throw new BadJwtException("Invalid subject", invalidSubject);
        }
        throw new BadJwtException("Invalid subject");
    }
}
