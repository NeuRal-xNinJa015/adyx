package com.aegiscomms.identity.controller;

import com.aegiscomms.identity.model.Device;
import com.aegiscomms.identity.service.DeviceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * REST controller for device registration and identity management.
 * 
 * Endpoints:
 *   POST /api/devices/register  — Register a new device
 *   GET  /api/devices/{id}      — Get device info
 *   GET  /api/users/{id}/devices — List user's devices
 *   DELETE /api/devices/{id}    — Revoke a device
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*") // Dev only — restrict in production
public class DeviceController {

    private static final Logger log = LoggerFactory.getLogger(DeviceController.class);
    private final DeviceService deviceService;

    public DeviceController(DeviceService deviceService) {
        this.deviceService = deviceService;
    }

    /**
     * Register a new device.
     * Body: { userId, deviceName, publicKey (base64), signingPublicKey (base64), deviceFingerprint }
     */
    @PostMapping("/devices/register")
    public ResponseEntity<?> registerDevice(@RequestBody Map<String, String> body) {
        try {
            String userId = body.get("userId");
            String deviceName = body.getOrDefault("deviceName", "Unknown Device");
            byte[] publicKey = Base64.getDecoder().decode(body.get("publicKey"));
            byte[] signingPublicKey = Base64.getDecoder().decode(body.get("signingPublicKey"));
            String fingerprint = body.get("deviceFingerprint");

            Device device = deviceService.registerDevice(
                    userId, deviceName, publicKey, signingPublicKey, fingerprint);

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "deviceId", device.getDeviceId(),
                    "userId", device.getUserId(),
                    "certificate", Base64.getEncoder().encodeToString(device.getCertificate()),
                    "status", "registered"
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Device registration failed", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Registration failed"));
        }
    }

    /**
     * Get device info by ID.
     */
    @GetMapping("/devices/{deviceId}")
    public ResponseEntity<?> getDevice(@PathVariable String deviceId) {
        try {
            Device device = deviceService.getDevice(deviceId);
            return ResponseEntity.ok(Map.of(
                    "deviceId", device.getDeviceId(),
                    "userId", device.getUserId(),
                    "deviceName", device.getDeviceName() != null ? device.getDeviceName() : "",
                    "publicKey", Base64.getEncoder().encodeToString(device.getPublicKey()),
                    "signingPublicKey", Base64.getEncoder().encodeToString(device.getSigningPublicKey()),
                    "isActive", device.isActive()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * List all active devices for a user.
     */
    @GetMapping("/users/{userId}/devices")
    public ResponseEntity<?> getUserDevices(@PathVariable String userId) {
        List<Device> devices = deviceService.getUserDevices(userId);
        List<Map<String, Object>> result = devices.stream().map(d -> Map.<String, Object>of(
                "deviceId", d.getDeviceId(),
                "deviceName", d.getDeviceName() != null ? d.getDeviceName() : "",
                "publicKey", Base64.getEncoder().encodeToString(d.getPublicKey()),
                "isActive", d.isActive()
        )).toList();
        return ResponseEntity.ok(result);
    }

    /**
     * Revoke a device.
     */
    @DeleteMapping("/devices/{deviceId}")
    public ResponseEntity<?> revokeDevice(@PathVariable String deviceId) {
        try {
            deviceService.revokeDevice(deviceId);
            return ResponseEntity.ok(Map.of("status", "revoked", "deviceId", deviceId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Health check.
     */
    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
                "service", "aegis-identity",
                "status", "online",
                "ca", "active"
        ));
    }
}
