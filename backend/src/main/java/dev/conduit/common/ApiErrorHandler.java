package dev.conduit.common;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiErrorHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<?> api(ApiException error) {
        return ResponseEntity.status(error.status()).body(Map.of("errors", error.errors()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> problems(MethodArgumentNotValidException failure) {
        Map<String, List<String>> fields = new TreeMap<>();
        for (var error : failure.getBindingResult().getFieldErrors()) {
            String field = error.getField().substring(error.getField().lastIndexOf('.') + 1);
            fields.computeIfAbsent(field, ignored -> new ArrayList<>()).add(error.getDefaultMessage());
        }
        return api(new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, fields));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<?> invalidBody() {
        return api(new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "body", "is invalid"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict(DataIntegrityViolationException failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation) {
                String field = switch (String.valueOf(violation.getConstraintName())) {
                    case "users_email_key" -> "email";
                    case "users_username_key" -> "username";
                    default -> null;
                };
                if (field != null) {
                    return api(new ApiException(HttpStatus.CONFLICT, field, "has already been taken"));
                }
            }
        }
        throw failure;
    }
}
