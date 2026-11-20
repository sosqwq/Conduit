package dev.conduit.user;

import dev.conduit.common.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import static dev.conduit.user.UserForms.*;

@RestController
@RequestMapping("/api")
public class UserController {
    private final UserService users;

    public UserController(UserService users) {
        this.users = users;
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public Envelope register(@Valid @RequestBody RegisterRequest request) {
        return users.register(request.user());
    }

    @PostMapping("/users/login")
    public Envelope login(@Valid @RequestBody LoginRequest request) {
        return users.login(request.user());
    }

    @GetMapping("/user")
    public Envelope current() {
        return users.current(CurrentUser.requiredId());
    }

    @PutMapping("/user")
    public Envelope update(@Valid @RequestBody UpdateRequest request) {
        return users.update(CurrentUser.requiredId(), request.user());
    }
}
