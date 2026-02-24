# 🛡️ AegisComms

**High-Assurance Secure Messaging Platform**

AegisComms is a sovereign, mission-critical messaging platform built for security agencies, government organizations, and defense units. It provides end-to-end encrypted communications with zero-trust architecture, minimal metadata retention, and post-quantum readiness.

> This is not social media. This is sovereign communication infrastructure.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                CLIENTS (Web / Desktop)               │
│  React UI │ Signal Protocol (E2EE) │ Local Encrypted │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket / mTLS
┌──────────────────────▼──────────────────────────────┐
│              ERLANG ROUTING CORE                     │
│  Connection Mgmt │ Presence │ Message Routing        │
│  Delivery ACKs   │ Offline Queues                    │
└──────────────────────┬──────────────────────────────┘
                       │ gRPC
┌──────────────────────▼──────────────────────────────┐
│              MICROSERVICES                           │
│  Identity (Java) │ Crypto (Go) │ Admin (Java)        │
│  Policy Engine   │ Audit       │ Sentinel (Python)   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              INFRASTRUCTURE                          │
│  Redis │ Cassandra │ Kafka │ Vault │ HSM             │
└─────────────────────────────────────────────────────┘
```

## Project Structure

```
aegiscomms/
├── services/
│   ├── aegis-router/       # Erlang — Real-time messaging spine
│   ├── aegis-identity/     # Java — PKI Identity & auth
│   ├── aegis-crypto/       # Go — Cryptographic operations
│   ├── aegis-admin/        # Java — Admin API & audit
│   └── aegis-sentinel/     # Python — AI security analytics
├── clients/
│   └── aegis-web/          # React + Vite — Web client
├── proto/                  # Shared gRPC definitions
├── infra/                  # Docker, K8s, Terraform
└── docs/                   # Architecture & specs
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Routing Core | **Erlang/OTP** | Real-time messaging, millions of connections |
| Identity | **Java / Spring Boot** | PKI, certificate management, auth |
| Crypto | **Go** | Signal Protocol, key management |
| Admin | **Java / Spring Boot** | Admin console, audit logging |
| Sentinel | **Python** | ML-based anomaly detection |
| Web Client | **React + Vite** | End-user messaging interface |
| Protocol | **gRPC + Protobuf** | Inter-service communication |
| Infra | **Docker, K8s, Terraform** | Deployment orchestration |

## Security Features

- 🔐 **Signal Protocol E2EE** — Double Ratchet, forward secrecy
- 🪪 **PKI Identity** — No phone numbers, certificate-based auth
- 🔒 **Zero Trust** — mTLS everywhere, service mesh
- 💀 **Panic Wipe** — Instant cryptographic destruction
- 🕵️ **Metadata Minimization** — Sealed sender, dummy traffic
- 🔮 **Post-Quantum Ready** — Kyber + X25519 hybrid

## Quick Start

```bash
# Start infrastructure
docker compose up -d

# Start Erlang router
cd services/aegis-router && rebar3 shell

# Start Identity service
cd services/aegis-identity && mvn spring-boot:run

# Start Crypto service
cd services/aegis-crypto && go run cmd/server/main.go

# Start Web client
cd clients/aegis-web && npm install && npm run dev
```

## Development Phases

- **Phase 1 (MVP):** PKI identity, Signal E2EE, Erlang routing, 1:1 chat
- **Phase 2:** Groups, media, admin console
- **Phase 3:** Hardware keys, on-prem, audit system
- **Phase 4:** Post-quantum crypto, traffic obfuscation

## License

Proprietary — All Rights Reserved
