package dev.conduit.profile;

import dev.conduit.common.ApiException;
import dev.conduit.user.User;
import dev.conduit.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {
    private final UserRepository users;
    private final ProfileRepository follows;

    public ProfileService(UserRepository users, ProfileRepository follows) {
        this.users = users;
        this.follows = follows;
    }

    @Transactional(readOnly = true)
    public ProfileView read(String username, Long viewerId) {
        User target = findUser(username);
        boolean following = viewerId != null && follows.isFollowing(viewerId, target.getId());
        return ProfileView.of(target, following);
    }

    @Transactional
    public ProfileView follow(String username, long viewerId) {
        User target = findUser(username);
        if (target.getId() == viewerId) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "profile", "cannot follow yourself");
        }
        follows.follow(viewerId, target.getId());
        return ProfileView.of(target, true);
    }

    @Transactional
    public ProfileView unfollow(String username, long viewerId) {
        User target = findUser(username);
        follows.unfollow(viewerId, target.getId());
        return ProfileView.of(target, false);
    }

    private User findUser(String username) {
        return users.findByUsername(username)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "profile", "not found"));
    }
}
