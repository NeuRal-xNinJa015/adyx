/**
 * ADYX Backend — Hardened WebSocket Relay Server
 * 
 * Features:
 *   - Auth, room creation/joining, message relay, typing, end_session
 *   - Key exchange relay (passes ECDH public keys between peers)
 *   - Rate limiting (5 rooms/min, 60 msgs/min per device)
 *   - Ping/pong heartbeat (30s) — kills stale connections
 *   - Room TTL auto-cleanup (10 min inactivity)
 *   - Graceful shutdown (SIGTERM/SIGINT)
 *   - HTTP health check endpoint (GET /health)
 *   - Environment variable support (PORT)
 */

import { WebSocketServer } from 'ws';
import { randomBytes } from 'crypto';
import { createServer } from 'http';

const PORT = parseInt(process.env.PORT || '8443', 10);
const HEARTBEAT_INTERVAL = 30000;       // 30s ping/pong
const ROOM_TTL = 10 * 60 * 1000;        // 10 min idle TTL
const RATE_LIMIT_ROOMS = 5;              // max rooms per minute
const RATE_LIMIT_MESSAGES = 60;          // max messages per minute
const MAX_PAYLOAD_SIZE = 64 * 1024;      // 64KB max message payload
const MAX_DEVICE_ID_LEN = 32;
const VALID_TYPES = new Set(['auth', 'create_room', 'join_room', 'key_exchange', 'message', 'typing', 'end_session', 'presence']);

// ── State ──
const connections = new Map();   // deviceId → { ws, alive, roomRateWindow, msgRateWindow }
const rooms = new Map();         // roomCode → { creator, members, lastActivity }

function generateRoomCode() {
    return randomBytes(3).toString('hex');
}

function timestamp() {
    return new Date().toISOString().slice(11, 23);
}

function log(tag, ...args) {
    console.log(`[${timestamp()}] [${tag}]`, ...args);
}

// ── Validators ──
function isValidDeviceId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= MAX_DEVICE_ID_LEN && /^[a-zA-Z0-9_-]+$/.test(id);
}

function isValidRoomCode(code) {
    return typeof code === 'string' && /^[a-f0-9]{6}$/.test(code);
}

// ── Safe Send (crash-proof) ──
function safeSend(ws, data) {
    try {
        if (ws.readyState === 1) {
            ws.send(typeof data === 'string' ? data : JSON.stringify(data));
            return true;
        }
    } catch (err) {
        log('SEND_ERR', err.message);
    }
    return false;
}

// ── Rate Limiter ──
function checkRate(connInfo, type) {
    const now = Date.now();
    const window = type === 'room' ? connInfo.roomRateWindow : connInfo.msgRateWindow;
    const limit = type === 'room' ? RATE_LIMIT_ROOMS : RATE_LIMIT_MESSAGES;

    // Remove entries older than 60s
    while (window.length > 0 && window[0] < now - 60000) {
        window.shift();
    }

    if (window.length >= limit) return false;
    window.push(now);
    return true;
}

// ── HTTP Server (health check) ──
const httpServer = createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            uptime: process.uptime(),
            connections: connections.size,
            rooms: rooms.size
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocketServer({ server: httpServer });

// ── Heartbeat ──
const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
        const info = [...connections.values()].find(c => c.ws === ws);
        if (info && !info.alive) {
            log('HEARTBEAT', `Terminating stale connection: ${info.deviceId || 'unknown'}`);
            ws.terminate();
            return;
        }
        if (info) info.alive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);

// ── Room TTL Cleanup ──
const roomCleanup = setInterval(() => {
    const now = Date.now();
    for (const [roomCode, room] of rooms.entries()) {
        if (now - room.lastActivity > ROOM_TTL) {
            log('CLEANUP', `Room ${roomCode} expired (idle for ${Math.round((now - room.lastActivity) / 1000)}s)`);
            room.members.forEach(m => {
                safeSend(m.ws, { type: 'session_ended', roomCode, reason: 'Room expired due to inactivity' });
            });
            rooms.delete(roomCode);
        }
    }
}, 60000); // check every minute

// ── WebSocket Handler ──
wss.on('connection', (ws) => {
    let deviceId = null;
    let authenticated = false;
    let connInfo = null;

    log('WS', 'New connection');

    ws.on('pong', () => {
        if (connInfo) connInfo.alive = true;
    });

    ws.on('message', (raw) => {
        // Reject oversized raw messages early
        if (raw.length > MAX_PAYLOAD_SIZE) {
            safeSend(ws, { type: 'error', error: 'Message too large' });
            return;
        }

        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            safeSend(ws, { type: 'error', message: 'Invalid JSON' });
            return;
        }

        // Reject unknown message types
        if (!msg.type || !VALID_TYPES.has(msg.type)) {
            safeSend(ws, { type: 'error', error: 'Unknown message type' });
            return;
        }

        // ── AUTH ──
        if (msg.type === 'auth') {
            if (!isValidDeviceId(msg.deviceId)) {
                safeSend(ws, { type: 'error', error: 'Invalid device ID' });
                return;
            }
            deviceId = msg.deviceId;
            authenticated = true;
            connInfo = {
                ws,
                deviceId,
                alive: true,
                roomRateWindow: [],
                msgRateWindow: []
            };
            connections.set(deviceId, connInfo);
            log('AUTH', `Device authenticated: ${deviceId}`);
            safeSend(ws, { type: 'auth_ok', deviceId, status: 'authenticated' });
            return;
        }

        if (!authenticated) {
            safeSend(ws, { type: 'error', message: 'Not authenticated. Send auth message first.' });
            return;
        }

        // ── CREATE ROOM ──
        if (msg.type === 'create_room') {
            if (!checkRate(connInfo, 'room')) {
                safeSend(ws, { type: 'error', error: 'Rate limit: too many rooms created. Wait a moment.' });
                return;
            }
            const roomCode = generateRoomCode();
            rooms.set(roomCode, {
                creator: deviceId,
                members: [{ deviceId, ws }],
                lastActivity: Date.now()
            });
            log('ROOM', `Room ${roomCode} created by ${deviceId}`);
            safeSend(ws, { type: 'room_created', roomCode });
            return;
        }

        // ── JOIN ROOM ──
        if (msg.type === 'join_room') {
            const roomCode = msg.roomCode;
            if (!isValidRoomCode(roomCode)) {
                safeSend(ws, { type: 'error', error: 'Invalid room code format' });
                return;
            }
            const room = rooms.get(roomCode);
            if (!room) {
                safeSend(ws, { type: 'error', error: 'Room not found' });
                return;
            }
            if (room.members.some(m => m.deviceId === deviceId)) {
                safeSend(ws, { type: 'error', error: 'Already in this room' });
                return;
            }
            if (room.members.length >= 2) {
                safeSend(ws, { type: 'error', error: 'Room is full' });
                return;
            }

            room.members.push({ deviceId, ws });
            room.lastActivity = Date.now();
            log('ROOM', `${deviceId} joined room ${roomCode}`);

            safeSend(ws, { type: 'room_joined', roomCode });

            // Notify existing members
            room.members.forEach(member => {
                if (member.deviceId !== deviceId) {
                    safeSend(member.ws, { type: 'peer_joined', deviceId, roomCode });
                }
            });
            // Notify joiner about existing peers
            room.members.forEach(member => {
                if (member.deviceId !== deviceId) {
                    safeSend(ws, { type: 'peer_joined', deviceId: member.deviceId, roomCode });
                }
            });
            return;
        }

        // ── KEY EXCHANGE (relay public keys between peers) ──
        if (msg.type === 'key_exchange') {
            const roomCode = msg.roomCode;
            if (!msg.publicKey || typeof msg.publicKey !== 'string') return;
            const room = rooms.get(roomCode);
            if (room) {
                room.lastActivity = Date.now();
                room.members.forEach(member => {
                    if (member.deviceId !== deviceId) {
                        safeSend(member.ws, { type: 'key_exchange', publicKey: msg.publicKey, deviceId, roomCode });
                    }
                });
                log('E2E', `Key exchange relayed in room ${roomCode}`);
            }
            return;
        }

        // ── MESSAGE ──
        if (msg.type === 'message') {
            if (!checkRate(connInfo, 'message')) {
                safeSend(ws, { type: 'error', error: 'Rate limit: sending too fast. Slow down.' });
                return;
            }
            const roomCode = msg.roomCode;
            if (!msg.payload) {
                safeSend(ws, { type: 'error', error: 'Empty message' });
                return;
            }
            const room = rooms.get(roomCode);
            const messageId = msg.messageId || randomBytes(4).toString('hex');

            if (!room) {
                safeSend(ws, { type: 'error', error: 'Room not found' });
                return;
            }

            room.lastActivity = Date.now();
            let delivered = false;
            room.members.forEach(member => {
                if (member.deviceId !== deviceId) {
                    const sent = safeSend(member.ws, {
                        type: 'message',
                        from: deviceId,
                        deviceId,
                        payload: msg.payload,
                        iv: msg.iv || null,
                        encrypted: msg.encrypted || false,
                        messageId
                    });
                    if (sent) delivered = true;
                }
            });

            safeSend(ws, { type: 'ack', messageId, status: delivered ? 'delivered' : 'queued' });
            return;
        }

        // ── TYPING ──
        if (msg.type === 'typing') {
            const roomCode = msg.roomCode;
            const room = rooms.get(roomCode);
            if (room) {
                room.members.forEach(member => {
                    if (member.deviceId !== deviceId) {
                        safeSend(member.ws, { type: 'typing', deviceId });
                    }
                });
            }
            return;
        }

        // ── END SESSION ──
        if (msg.type === 'end_session') {
            const roomCode = msg.roomCode;
            const room = rooms.get(roomCode);
            if (room) {
                room.members.forEach(member => {
                    if (member.deviceId !== deviceId) {
                        safeSend(member.ws, { type: 'session_ended', roomCode, reason: 'Peer ended the session' });
                    }
                });
                rooms.delete(roomCode);
                log('SESSION', `Room ${roomCode} ended by ${deviceId}`);
            }
            safeSend(ws, { type: 'session_ended', roomCode, reason: 'You ended the session' });
            return;
        }

        // ── PRESENCE ──
        if (msg.type === 'presence') {
            log('PRESENCE', `${deviceId} → ${msg.status}`);
            return;
        }
    });

    ws.on('close', () => {
        log('WS', `Device ${deviceId} disconnected`);
        if (deviceId) {
            connections.delete(deviceId);
            for (const [roomCode, room] of rooms.entries()) {
                const idx = room.members.findIndex(m => m.deviceId === deviceId);
                if (idx !== -1) {
                    room.members.splice(idx, 1);
                    room.members.forEach(member => {
                        safeSend(member.ws, { type: 'peer_left', deviceId });
                    });
                    if (room.members.length === 0) {
                        rooms.delete(roomCode);
                        log('CLEANUP', `Room ${roomCode} deleted (empty)`);
                    }
                }
            }
        }
    });

    ws.on('error', (err) => {
        log('ERROR', `${deviceId}: ${err.message}`);
    });
});

// ── Graceful Shutdown ──
function shutdown(signal) {
    log('SERVER', `${signal} received — shutting down gracefully`);

    clearInterval(heartbeat);
    clearInterval(roomCleanup);

    // Close all WebSocket connections
    wss.clients.forEach(ws => {
        safeSend(ws, { type: 'session_ended', reason: 'Server shutting down' });
        try { ws.close(1001, 'Server shutting down'); } catch (_) { /* ignore */ }
    });

    httpServer.close(() => {
        log('SERVER', 'HTTP server closed');
        process.exit(0);
    });

    // Force exit after 5s
    setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ──
httpServer.listen(PORT, () => {
    log('SERVER', `⚡ ADYX Backend running on port ${PORT}`);
    log('SERVER', `   WebSocket: ws://localhost:${PORT}`);
    log('SERVER', `   Health:    http://localhost:${PORT}/health`);
    log('SERVER', `   Heartbeat: ${HEARTBEAT_INTERVAL / 1000}s`);
    log('SERVER', `   Room TTL:  ${ROOM_TTL / 60000} min`);
});
