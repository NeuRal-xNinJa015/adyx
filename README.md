# 🛡️ ADYX — Anonymous Communication Protocol

**End-to-end encrypted, zero-trace messaging platform.**

> No login. No email. No phone number. Just conversations that vanish.

---

## Project Structure

```
adyx/
├── frontend/          # React + Vite — Web client
├── backend/           # Node.js — WebSocket relay server
├── integration/       # Proto, docs, Docker, infra
│   ├── proto/         # gRPC / Protobuf definitions
│   ├── docs/          # Architecture & threat model
│   ├── infra/         # Docker & Kubernetes configs
│   ├── docker-compose.yml
│   └── PRD.md
└── README.md
```

## Quick Start

```bash
# 1. Install dependencies
cd frontend && npm install
cd ../backend && npm install

# 2. Start backend (WebSocket server on port 8443)
cd backend && npm start

# 3. Start frontend (Vite dev server on port 5173)
cd frontend && npm run dev
```

Open **<http://localhost:5173>** → Create Room → Share the code → Chat anonymously.

## Features

- 🔐 **256-bit AES-GCM Encryption** — End-to-end, client-side only
- 🕵️ **Zero Trace** — Nothing stored on the server. Ever.
- ⚡ **Peer-to-Peer** — Direct message routing, no middleman
- 🪪 **No Login** — No email, no password, no identity
- 🚀 **Instant** — Connect in under 1 second

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 19 + Vite + Framer Motion |
| Backend | Node.js WebSocket Server |
| Encryption | Web Crypto API (ECDH P-256 + AES-256-GCM) |
| Protocol | JSON over WebSocket |

## License

Proprietary — All Rights Reserved
