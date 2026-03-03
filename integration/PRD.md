# 📄 Product Requirements Document (PRD)

**Product Name (Working):** Adyx — High-Assurance Secure Messaging Platform

## 1. Product Overview

Adyx is a mission-critical secure messaging platform designed for:

- Security agencies
- Government organizations
- Defense units
- High-trust enterprises

**Priorities:** End-to-End Encryption, Zero Trust Architecture, Minimal Metadata, Self-hosting capability, Survivability under compromise, Future cryptographic agility.

> This is not social media. This is sovereign communication infrastructure.

## 2. Core Objectives

1. Server must never access plaintext messages.
2. No phone-number identity.
3. Minimal metadata retention.
4. Device-bound cryptographic identity.
5. Resistance to insider threats.
6. Survivability under partial infrastructure compromise.
7. Support on-prem / air-gapped deployment.
8. Forward secrecy + break-in recovery.
9. Admin governance and auditability.
10. Post-quantum readiness.

## 3. Threat Model

System must assume: Nation-state surveillance, Network MITM, Server compromise, Insider administrator abuse, Device theft, Supply-chain attacks, Traffic correlation, Future quantum adversaries.

> Design principle: Every layer must fail safely.

## 4. Identity Architecture (PKI-Based)

Each user/device receives: Organization-issued certificate, Hardware-backed keypair, Device fingerprint.

Components: Certificate Authority (offline root + online intermediate), Device registry, Revocation service (OCSP), Hardware attestation.

No OTP login. No SIM dependency.

## 5. Cryptographic Architecture

**Mandatory:** Signal Protocol (Double Ratchet), X25519 (key exchange), Ed25519 (signatures), AES-256-GCM (message encryption), HKDF + SHA-512.

**Properties:** Forward secrecy, Break-in recovery, Per-message keys, Client-side encryption only.

**Future:** Hybrid Post-Quantum (Kyber + X25519), Crypto agility engine (hot-swappable algorithms).

## 6. Message Flow

1. Sender encrypts locally.
2. Encrypted blob sent to server.
3. Server stores temporarily.
4. Receiver downloads blob.
5. Receiver decrypts locally.

Server acts only as courier.

## 7. Metadata Minimization

Techniques: Sealed sender, Relay routing, Constant-size packets, Dummy traffic, Message batching.

Goal: resist traffic analysis.

## 8. Backend Architecture (Hybrid Model)

### Erlang Core (Realtime Spine)

TCP/WebSocket connections, Presence tracking, Message routing, Delivery acknowledgements, Offline queues.

### Java / Go Microservices

Identity service, Crypto service, Group coordination, Policy engine, Admin API, Audit service.

Communication via gRPC. Event Layer: Kafka / Pulsar.

### Storage

- Messages: Redis (short TTL), Cassandra (encrypted blobs)
- Media: Object storage, Client-side encrypted, Expiring signed URLs

## 9. Client Security

Secure enclave key storage, Root/jailbreak detection, Certificate pinning, Screenshot blocking, Clipboard control, Encrypted local database, Panic wipe (instant key destruction).

## 10. Advanced Security Controls

Remote wipe, Device kill switch, Burn-after-read messages, Geo-fenced login, Compartmentalized groups, Hardware-backed keys, Multi-level clearance (MLS).

## 11. Zero Trust Infrastructure

Mutual TLS everywhere, Service mesh (Istio), Vault for secrets, HSM for CA keys.

## 12–16. Security Policies

- Insider Threat Controls (dual-control, immutable audit logs, privilege separation)
- Supply Chain Security (reproducible builds, binary signing, SBOM)
- Key Lifecycle Management (generation → destruction)
- Disaster Cryptography (Shamir sharing, dead-man switches)
- Traffic & Timing Protection (constant-time crypto, uniform packets)

## 17. Federation

Multiple organizations communicate via separate CAs, trust agreements, isolated namespaces.

## 18. AI Security Layer (Optional)

Python ML services: Login anomaly detection, Insider behavior analysis, Traffic pattern alerts. No message content access.

## 19. Deployment

On-prem, Private cloud, Air-gapped networks using Kubernetes, Terraform, Active-active regions.

## 20–21. Compliance & DevSecOps

FIPS 140-3, ISO 27001, SOC 2, NIST PQ roadmap. Static analysis, dependency scanning, code signing, pen testing, red team simulation.

## 22. Development Phases

| Phase | Features |
|-------|----------|
| **Phase 1 (MVP)** | PKI identity, Signal E2EE, Erlang routing core, Java backend, 1:1 chat |
| **Phase 2** | Groups, Media, Admin console |
| **Phase 3** | Hardware keys, On-prem deployment, Audit system |
| **Phase 4** | Post-quantum crypto, Traffic obfuscation, Automated incident response |
