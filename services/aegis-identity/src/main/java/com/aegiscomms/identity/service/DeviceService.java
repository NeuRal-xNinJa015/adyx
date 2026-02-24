package com.aegiscomms.identity.service;

import com.aegiscomms.identity.crypto.CertificateAuthority;
import com.aegiscomms.identity.model.Device;
import com.aegiscomms.identity.model.User;
import com.aegiscomms.identity.repository.DeviceRepository;
import com.aegiscomms.identity.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.cert.X509Certificate;
import java.security.spec.X509EncodedKeySpec;
import java.util.List;
import java.util.UUID;

/**
 * Device registration and identity management service.
 * Handles device onboarding, certificate issuance, and device lookups.
 */
@Service
public class DeviceService {

    private static final Logger log = LoggerFactory.getLogger(DeviceService.class);
    private static final int MAX_DEVICES_PER_USER = 5;

    private final DeviceRepository deviceRepository;
    private final UserRepository userRepository;
    private final CertificateAuthority certificateAuthority;

    public DeviceService(DeviceRepository deviceRepository,
                         UserRepository userRepository,
                         CertificateAuthority certificateAuthority) {
        this.deviceRepository = deviceRepository;
        this.userRepository = userRepository;
        this.certificateAuthority = certificateAuthority;
    }

    /**
     * Register a new device for a user.
     * Generates a device ID, issues an X.509 certificate, and stores everything.
     */
    @Transactional
    public Device registerDevice(String userId, String deviceName,
                                  byte[] publicKey, byte[] signingPublicKey,
                                  String deviceFingerprint) throws Exception {
        // Ensure user exists
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        // Enforce device limit
        long activeDevices = deviceRepository.countByUserIdAndIsActive(userId, true);
        if (activeDevices >= MAX_DEVICES_PER_USER) {
            throw new IllegalStateException(
                    "Device limit reached (" + MAX_DEVICES_PER_USER + ") for user: " + userId);
        }

        // Generate device ID
        String deviceId = "dev-" + UUID.randomUUID().toString().substring(0, 12);

        // Issue X.509 certificate
        PublicKey javaPublicKey = KeyFactory.getInstance("EC")
                .generatePublic(new X509EncodedKeySpec(publicKey));
        X509Certificate certificate = certificateAuthority.issueDeviceCertificate(
                deviceId, userId, javaPublicKey);

        // Create device record
        Device device = new Device();
        device.setDeviceId(deviceId);
        device.setUserId(userId);
        device.setDeviceName(deviceName);
        device.setPublicKey(publicKey);
        device.setSigningPublicKey(signingPublicKey);
        device.setCertificate(certificate.getEncoded());
        device.setDeviceFingerprint(deviceFingerprint);

        deviceRepository.save(device);
        log.info("Device registered: {} for user {}", deviceId, userId);

        return device;
    }

    /**
     * Get a device by ID.
     */
    public Device getDevice(String deviceId) {
        return deviceRepository.findById(deviceId)
                .orElseThrow(() -> new IllegalArgumentException("Device not found: " + deviceId));
    }

    /**
     * List all active devices for a user.
     */
    public List<Device> getUserDevices(String userId) {
        return deviceRepository.findByUserIdAndIsActive(userId, true);
    }

    /**
     * Revoke a device — marks inactive and should trigger cert revocation (OCSP).
     */
    @Transactional
    public void revokeDevice(String deviceId) {
        Device device = getDevice(deviceId);
        device.setActive(false);
        deviceRepository.save(device);
        log.warn("Device REVOKED: {}", deviceId);
        // TODO: Update OCSP responder, notify connected routers
    }
}
