package dev.conduit.profile;

import dev.conduit.common.CurrentUser;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profiles/{username}")
public class ProfileController {
    private final ProfileService profiles;

    public ProfileController(ProfileService profiles) {
        this.profiles = profiles;
    }

    public record Envelope(ProfileView profile) {}

    @GetMapping
    public Envelope read(@PathVariable String username) {
        return new Envelope(profiles.read(username, CurrentUser.optionalId()));
    }

    @PostMapping("/follow")
    public Envelope follow(@PathVariable String username) {
        return new Envelope(profiles.follow(username, CurrentUser.requiredId()));
    }

    @DeleteMapping("/follow")
    public Envelope unfollow(@PathVariable String username) {
        return new Envelope(profiles.unfollow(username, CurrentUser.requiredId()));
    }
}
