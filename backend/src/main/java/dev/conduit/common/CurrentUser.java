package dev.conduit.common;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;

public final class CurrentUser {
    private CurrentUser() {}

    public static Long optionalId() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof Long id ? id : null;
    }

    public static long requiredId() {
        Long id = optionalId();
        if (id == null) {
            throw new AuthenticationCredentialsNotFoundException("Missing token");
        }
        return id;
    }
}
