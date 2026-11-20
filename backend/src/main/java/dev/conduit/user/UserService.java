package dev.conduit.user;

import dev.conduit.common.ApiException;
import dev.conduit.common.TokenService;
import jakarta.validation.Validator;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import static dev.conduit.user.UserForms.*;

@Service
public class UserService {
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final Validator validator;
    private final String dummyHash;

    public UserService(UserRepository users, PasswordEncoder passwords, TokenService tokens, Validator validator) {
        this.users = users;
        this.passwords = passwords;
        this.tokens = tokens;
        this.validator = validator;
        this.dummyHash = passwords.encode("timing comparison for unknown accounts");
    }

    @Transactional
    public Envelope register(Registration input) {
        String hash = encodePassword(input.password());
        User user = users.saveAndFlush(new User(input.username(), input.email(), hash));
        return response(user);
    }

    @Transactional(readOnly = true)
    public Envelope login(Login input) {
        User user = users.findByEmail(input.email()).orElse(null);
        boolean valid = input.password().getBytes(StandardCharsets.UTF_8).length <= 72
                && passwords.matches(input.password(), user == null ? dummyHash : user.passwordHash);
        if (!valid || user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "credentials", "invalid");
        }
        return response(user);
    }

    @Transactional(readOnly = true)
    public Envelope current(long id) {
        return response(users.findById(id).orElseThrow(UserService::missingUser));
    }

    @Transactional
    public Envelope update(long id, JsonNode changes) {
        if (!changes.isObject()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "user", "is invalid");
        }
        User user = users.findForUpdate(id).orElseThrow(UserService::missingUser);
        var fields = new Registration(
                field(changes, "username", user.username), field(changes, "email", user.email),
                field(changes, "password", null));
        validateChanges(changes, fields);
        user.username = fields.username();
        user.email = fields.email();
        if (changes.has("password")) {
            user.passwordHash = encodePassword(fields.password());
        }
        user.bio = nullableText(field(changes, "bio", user.bio));
        user.image = nullableText(field(changes, "image", user.image));
        user.updatedAt = Instant.now();
        return response(users.saveAndFlush(user));
    }

    private void validateChanges(JsonNode changes, Registration fields) {
        Map<String, List<String>> errors = new TreeMap<>();
        for (String property : List.of("username", "email", "password")) {
            if (changes.has(property)) {
                for (var error : validator.validateProperty(fields, property)) {
                    errors.computeIfAbsent(property, ignored -> new ArrayList<>()).add(error.getMessage());
                }
            }
        }
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, errors);
        }
    }

    private String encodePassword(String password) {
        if (password.codePointCount(0, password.length()) < 8) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "password", "is too short");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "password", "is too long");
        }
        return passwords.encode(password);
    }

    private static String field(JsonNode changes, String name, String original) {
        if (!changes.has(name)) {
            return original;
        }
        var value = changes.get(name);
        if (value.isNull()) {
            return null;
        }
        if (!value.isString()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, name, "is invalid");
        }
        return value.stringValue();
    }

    private static String nullableText(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static ApiException missingUser() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "token", "is invalid");
    }

    private Envelope response(User user) {
        return new Envelope(new UserResponse(user.username, user.email, user.bio, user.image, tokens.issue(user.getId())));
    }
}
