package com.aegiscomms.identity.model;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Device entity — Each physical device has its own cryptographic identity.
 * A user can have multiple devices, each with unique key pairs.
 */
@Entity
@Table(name = "devices")
public class Device {

    @Id
    @Column(name = "device_id", length = 64)
    private String deviceId;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(name = "device_name", length = 128)
    private String deviceName;

    @Lob
    @Column(name = "public_key", nullable = false)
    private byte[] publicKey;           // X25519

    @Lob
    @Column(name = "signing_public_key", nullable = false)
    private byte[] signingPublicKey;    // Ed25519

    @Lob
    @Column(name = "certificate")
    private byte[] certificate;         // X.509 DER

    @Column(name = "device_fingerprint", nullable = false, length = 128)
    private String deviceFingerprint;

    @Column(name = "is_active")
    private boolean isActive = true;

    @Column(name = "registered_at")
    private Instant registeredAt = Instant.now();

    @Column(name = "last_seen")
    private Instant lastSeen = Instant.now();

    public Device() {}

    // Getters and setters
    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getDeviceName() { return deviceName; }
    public void setDeviceName(String deviceName) { this.deviceName = deviceName; }

    public byte[] getPublicKey() { return publicKey; }
    public void setPublicKey(byte[] publicKey) { this.publicKey = publicKey; }

    public byte[] getSigningPublicKey() { return signingPublicKey; }
    public void setSigningPublicKey(byte[] signingPublicKey) { this.signingPublicKey = signingPublicKey; }

    public byte[] getCertificate() { return certificate; }
    public void setCertificate(byte[] certificate) { this.certificate = certificate; }

    public String getDeviceFingerprint() { return deviceFingerprint; }
    public void setDeviceFingerprint(String deviceFingerprint) { this.deviceFingerprint = deviceFingerprint; }

    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }

    public Instant getRegisteredAt() { return registeredAt; }
    public Instant getLastSeen() { return lastSeen; }
    public void setLastSeen(Instant lastSeen) { this.lastSeen = lastSeen; }
}
