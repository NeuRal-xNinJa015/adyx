package com.aegiscomms.admin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * AegisComms Admin Service
 * 
 * Provides governance, administration, and audit capabilities.
 * Admins are treated as adversaries — all actions are logged
 * and sensitive operations require dual-control approval.
 * 
 * Core responsibilities:
 * - User account management (invite-only)
 * - Role-based access control (RBAC) administration
 * - Immutable audit log management
 * - Remote wipe / device kill switch
 * - Group/channel management
 * - Policy engine configuration
 * - Classification level management (Confidential/Secret/Top Secret)
 * - Emergency key rotation authority
 * 
 * Insider threat controls:
 * - Dual-control for sensitive actions
 * - Just-in-time admin access
 * - Behavioral analytics integration
 * - Privilege separation enforcement
 */
@SpringBootApplication
public class AdminServiceApp {

    private static final Logger log = LoggerFactory.getLogger(AdminServiceApp.class);

    public static void main(String[] args) {
        log.info("=== AegisComms Admin Service Starting ===");
        log.info("  Governance & Audit | Insider Threat Controls");
        log.info("  Dual-control enforcement active");
        
        SpringApplication.run(AdminServiceApp.class, args);
        
        log.info("=== Admin Service ONLINE ===");
    }
}
