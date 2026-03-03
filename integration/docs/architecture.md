# Adyx Architecture

## System Architecture Overview

Adyx follows a **hybrid microservices** architecture with an Erlang real-time core (inspired by WhatsApp) and specialized microservices for identity, crypto, admin, and ML analytics.

## Design Principles

1. **Zero Trust** — Every request is authenticated via mTLS
2. **Zero Knowledge** — Server never sees plaintext messages
3. **Fail Safe** — Every layer fails safely and securely
4. **Defense in Depth** — Multiple overlapping security layers
5. **Minimal Privilege** — Components only access what they need

## Service Map

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| aegis-router | Erlang/OTP | 8443 (WSS) | Real-time message routing |
| aegis-identity | Java/Spring | 8081 (HTTPS), 9091 (gRPC) | PKI identity management |
| aegis-admin | Java/Spring | 8082 (HTTPS), 9092 (gRPC) | Admin & audit |
| aegis-crypto | Go | 9093 (gRPC) | Cryptographic operations |
| aegis-sentinel | Python/FastAPI | 8085 (HTTPS) | AI security analytics |
| aegis-web | React/Vite | 5173 (dev) | Web client |

## Infrastructure

| Service | Port | Purpose |
|---------|------|---------|
| Redis | 6379 | Message cache (short TTL) |
| Cassandra | 9042 | Encrypted blob storage |
| Kafka | 9092 | Event streaming |
| PostgreSQL | 5432 | Metadata storage |
| Vault | 8200 | Secrets management |

## Message Flow (E2E Encrypted)

```
Client A -> [Encrypt (Signal Protocol)] -> WebSocket -> Erlang Router -> WebSocket -> [Decrypt (Signal Protocol)] -> Client B
                                                          |
                                                    (stores encrypted
                                                     blob if offline)
```

The server only handles encrypted blobs. It cannot decrypt any message content.

## Security Layers

1. **Transport**: mTLS (mutual TLS) between all services
2. **Application**: Signal Protocol E2EE for all messages
3. **Storage**: AES-256-GCM encryption at rest
4. **Identity**: PKI certificates (no phone numbers)
5. **Access**: RBAC with multi-level clearance
6. **Monitoring**: AI-powered anomaly detection (no content access)
