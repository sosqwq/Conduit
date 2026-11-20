package dev.conduit.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 254)
    String email;
    @Column(nullable = false, length = 100)
    String username;
    @Column(name = "password_hash", nullable = false)
    String passwordHash;
    String bio;
    String image;
    @Column(name = "updated_at", insertable = false)
    Instant updatedAt;

    protected User() {}

    User(String username, String email, String passwordHash) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getBio() { return bio; }
    public String getImage() { return image; }
}
