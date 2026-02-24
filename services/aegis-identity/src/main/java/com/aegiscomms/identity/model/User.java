package com.aegiscomms.identity.model;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * User entity — Certificate-based identity.
 * No phone numbers. No emails. No passwords.
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    @Column(name = "user_id", length = 64)
    private String userId;

    @Column(name = "display_name", nullable = false, length = 128)
    private String displayName;

    @Column(name = "clearance_level", length = 32)
    private String clearanceLevel = "standard";

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    @Column(name = "is_active")
    private boolean isActive = true;

    public User() {}

    public User(String userId, String displayName, String clearanceLevel) {
        this.userId = userId;
        this.displayName = displayName;
        this.clearanceLevel = clearanceLevel;
    }

    // Getters and setters
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getClearanceLevel() { return clearanceLevel; }
    public void setClearanceLevel(String clearanceLevel) { this.clearanceLevel = clearanceLevel; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }
}
