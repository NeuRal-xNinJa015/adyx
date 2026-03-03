# Adyx Threat Model

## Adversaries

| Adversary | Capability | Mitigation |
|-----------|-----------|------------|
| Nation-state | Full network surveillance, compute power | E2EE, metadata minimization, traffic obfuscation |
| MITM attacker | Network interception | mTLS, certificate pinning |
| Compromised server | Access to all server data | Zero-knowledge design, E2EE |
| Insider admin | Full admin access | Dual-control, audit logs, privilege separation |
| Device thief | Physical device access | Secure enclave, panic wipe, device kill switch |
| Supply chain | Malicious updates | Reproducible builds, binary signing, SBOM |
| Traffic analyst | Network flow observation | Dummy traffic, constant-size packets, batching |
| Quantum adversary | Future quantum computer | Post-quantum readiness (Kyber + X25519) |

## Trust Boundaries

1. **Client ↔ Server**: Messages encrypted before leaving client
2. **Service ↔ Service**: mTLS for all internal communication
3. **Service ↔ Database**: Encrypted at rest, minimal metadata
4. **Admin ↔ System**: Dual-control, just-in-time access, immutable logs

## Security Invariants

- Server NEVER accesses plaintext message content
- No single admin can perform sensitive operations alone
- All cryptographic keys have defined lifecycles ending in destruction (not deletion)
- System remains secure even if any single component is compromised
