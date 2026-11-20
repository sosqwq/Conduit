package dev.conduit.common;

import dev.conduit.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.filter.OncePerRequestFilter;

final class TokenFilter extends OncePerRequestFilter {
    private final TokenService tokens;
    private final UserRepository users;

    TokenFilter(TokenService tokens, UserRepository users) {
        this.tokens = tokens;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws IOException, ServletException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null) {
            if (!header.startsWith("Token ") || header.substring(6).isBlank()) {
                reject(response, false);
                return;
            }
            try {
                long id = tokens.verify(header.substring(6));
                if (!users.existsById(id)) {
                    reject(response, false);
                    return;
                }
                var context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(id, null, List.of()));
                SecurityContextHolder.setContext(context);
            } catch (JwtException invalid) {
                reject(response, false);
                return;
            }
        }
        chain.doFilter(request, response);
    }

    static void reject(HttpServletResponse response, boolean missing) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(missing
                ? "{\"errors\":{\"token\":[\"is missing\"]}}"
                : "{\"errors\":{\"token\":[\"is invalid\"]}}");
    }
}
