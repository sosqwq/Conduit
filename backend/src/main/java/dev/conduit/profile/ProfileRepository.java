package dev.conduit.profile;

import dev.conduit.user.User;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.NativeQuery;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

public interface ProfileRepository extends Repository<User, Long> {
    @Query("""
            select count(followed) > 0 from User viewer join viewer.followedUsers followed
            where viewer.id = :viewerId and followed.id = :targetId
            """)
    boolean isFollowing(long viewerId, long targetId);

    @Modifying
    @NativeQuery("""
            INSERT INTO follows (follower_id, followee_id) VALUES (:viewerId, :targetId)
            ON CONFLICT (follower_id, followee_id) DO NOTHING
            """)
    void follow(long viewerId, long targetId);

    @Modifying
    @NativeQuery("DELETE FROM follows WHERE follower_id = :viewerId AND followee_id = :targetId")
    void unfollow(long viewerId, long targetId);
}
