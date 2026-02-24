package com.aegiscomms.identity;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * AegisComms Identity Service
 * 
 * Handles PKI-based identity management for the AegisComms platform.
 * No phone numbers. No SIM dependency. Certificate-based identity only.
 * 
 * Core responsibilities:
 * - Certificate Authority (CA) management
 * - Device registration and certificate issuance
 * - Certificate revocation (OCSP)
 * - Device fingerprint verification
 * - Hardware attestation validation
 * - RBAC (Role-Based Access Control)
 * 
 * Security principles:
 * - Offline root CA (keys stored in HSM)
 * - Online intermediate CA for device certs
 * - All identities are device-bound
 * - Multi-factor authentication (TOTP + client cert)
 * - Invite-only registration (admin creates accounts)
 */
@SpringBootApplication
public class IdentityServiceApp {

    private static final Logger log = LoggerFactory.getLogger(IdentityServiceApp.class);

    public static void main(String[] args) {
        log.info("=== AegisComms Identity Service Starting ===");
        log.info("  PKI-based identity | Zero phone dependency");
        log.info("  Certificate-bound device authentication");
        
        SpringApplication.run(IdentityServiceApp.class, args);
        
        log.info("=== Identity Service ONLINE ===");
    }
}
