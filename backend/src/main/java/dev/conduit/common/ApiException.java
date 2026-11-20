package dev.conduit.common;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final Map<String, List<String>> errors;

    public ApiException(HttpStatus status, String field, String message) {
        this(status, Map.of(field, List.of(message)));
    }

    public ApiException(HttpStatus status, Map<String, List<String>> errors) {
        this.status = status;
        this.errors = Map.copyOf(errors);
    }

    public HttpStatus status() {
        return status;
    }

    public Map<String, List<String>> errors() {
        return errors;
    }
}
