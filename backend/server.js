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
const MAX_PAYLOAD_SIZE = 256 * 1024;     // 256KB max message payload (increased for file chunks)
const MAX_DEVICE_ID_LEN = 32;
const MAX_FILE_SIZE = 50 * 1024 * 1024;  // 50MB max file (assembled)
const FILE_EXPIRY_MS = 10 * 60 * 1000;   // 10 min file expiry
const VALID_TYPES = new Set(['auth', 'create_room', 'join_room', 'key_exchange', 'message', 'typing', 'end_session', 'presence', 'file_upload', 'file_chunk', 'file_download', 'file_delete']);

// ── State ──
const connections = new Map();   // deviceId → { ws, alive, roomRateWindow, msgRateWindow }
const rooms = new Map();         // roomCode → { creator, members, lastActivity }
const fileStore = new Map();     // fileId → { chunks[], totalChunks, metadata, expiry, roomCode, senderId, receivedChunks }

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
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const httpServer = createServer((req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({
            status: 'ok',
            uptime: process.uptime(),
            connections: connections.size,
            rooms: rooms.size
        }));
    } else {
        res.writeHead(404, CORS_HEADERS);
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
            // Clean up files for this room
            for (const [fileId, file] of fileStore.entries()) {
                if (file.roomCode === roomCode) {
                    fileStore.delete(fileId);
                    log('FILE_CLEANUP', `File ${fileId} deleted (room expired)`);
                }
            }
        }
    }
    // Clean up expired files
    for (const [fileId, file] of fileStore.entries()) {
        if (file.expiry && now > file.expiry) {
            fileStore.delete(fileId);
            log('FILE_CLEANUP', `File ${fileId} expired`);
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
                // Clean up files for this room
                for (const [fileId, file] of fileStore.entries()) {
                    if (file.roomCode === roomCode) {
                        fileStore.delete(fileId);
                        log('FILE_CLEANUP', `File ${fileId} deleted (session ended)`);
                    }
                }
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

        // ── FILE UPLOAD (initiate file transfer) ──
        if (msg.type === 'file_upload') {
            if (!checkRate(connInfo, 'message')) {
                safeSend(ws, { type: 'error', error: 'Rate limit: too many uploads. Slow down.' });
                return;
            }
            const roomCode = msg.roomCode;
            const room = rooms.get(roomCode);
            if (!room) {
                safeSend(ws, { type: 'error', error: 'Room not found' });
                return;
            }

            const fileId = msg.fileId;
            if (!fileId || typeof fileId !== 'string') {
                safeSend(ws, { type: 'error', error: 'Missing file ID' });
                return;
            }

            // Initialize file storage
            fileStore.set(fileId, {
                chunks: [],
                totalChunks: msg.totalChunks || 1,
                metadata: msg.encryptedMetadata || null,
                thumbnail: msg.thumbnail || null,
                iv: msg.iv || null,
                hash: msg.hash || null,
                ephemeral: msg.ephemeral || null,
                displayCategory: msg.displayCategory || 'documents',
                expiry: Date.now() + FILE_EXPIRY_MS,
                roomCode,
                senderId: deviceId,
                receivedChunks: 0,
            });

            log('FILE', `Upload initiated: ${fileId} (${msg.totalChunks} chunks) by ${deviceId}`);
            safeSend(ws, { type: 'file_upload_ack', fileId, status: 'ready' });
            return;
        }

        // ── FILE CHUNK (receive a chunk of encrypted data) ──
        if (msg.type === 'file_chunk') {
            const fileId = msg.fileId;
            const file = fileStore.get(fileId);
            if (!file) {
                safeSend(ws, { type: 'error', error: 'File not found — upload first' });
                return;
            }
            if (file.senderId !== deviceId) {
                safeSend(ws, { type: 'error', error: 'Not authorized to upload chunks for this file' });
                return;
            }

            file.chunks.push(msg.data);
            file.receivedChunks++;

            // Check if all chunks received
            if (file.receivedChunks >= file.totalChunks) {
                log('FILE', `Upload complete: ${fileId} (${file.chunks.length} chunks)`);

                // Relay file notification to room peers
                const room = rooms.get(file.roomCode);
                if (room) {
                    room.lastActivity = Date.now();
                    room.members.forEach(member => {
                        if (member.deviceId !== deviceId) {
                            safeSend(member.ws, {
                                type: 'file_ready',
                                fileId,
                                from: deviceId,
                                deviceId,
                                totalChunks: file.totalChunks,
                                iv: file.iv,
                                hash: file.hash,
                                encryptedMetadata: file.metadata,
                                thumbnail: file.thumbnail,
                                ephemeral: file.ephemeral,
                                displayCategory: file.displayCategory,
                            });
                        }
                    });
                }

                safeSend(ws, { type: 'file_upload_complete', fileId });
            } else {
                safeSend(ws, { type: 'file_chunk_ack', fileId, received: file.receivedChunks });
            }
            return;
        }

        // ── FILE DOWNLOAD (request file chunks) ──
        if (msg.type === 'file_download') {
            const fileId = msg.fileId;
            const file = fileStore.get(fileId);
            if (!file) {
                safeSend(ws, { type: 'error', error: 'File not found or expired' });
                return;
            }

            // Verify requester is in the room
            const room = rooms.get(file.roomCode);
            if (!room || !room.members.some(m => m.deviceId === deviceId)) {
                safeSend(ws, { type: 'error', error: 'Not authorized to download this file' });
                return;
            }

            // Send file key through E2E channel (included in file_ready message)
            // Here we just send the encrypted chunks
            for (let i = 0; i < file.chunks.length; i++) {
                safeSend(ws, {
                    type: 'file_chunk_data',
                    fileId,
                    chunkIndex: i,
                    data: file.chunks[i],
                    totalChunks: file.chunks.length,
                });
            }
            log('FILE', `Download served: ${fileId} → ${deviceId}`);
            return;
        }

        // ── FILE DELETE (manual file deletion) ──
        if (msg.type === 'file_delete') {
            const fileId = msg.fileId;
            const file = fileStore.get(fileId);
            if (file && (file.senderId === deviceId || msg.reason === 'panic_wipe')) {
                fileStore.delete(fileId);
                log('FILE', `Deleted: ${fileId} by ${deviceId}`);

                // Notify peers
                const room = rooms.get(file.roomCode);
                if (room) {
                    room.members.forEach(member => {
                        if (member.deviceId !== deviceId) {
                            safeSend(member.ws, { type: 'file_deleted', fileId });
                        }
                    });
                }
            }
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
httpServer.listen(PORT, '0.0.0.0', () => {
    log('SERVER', `ADYX Backend running on port ${PORT}`);
    log('SERVER', `   WebSocket: ws://0.0.0.0:${PORT}`);
    log('SERVER', `   Health:    http://0.0.0.0:${PORT}/health`);
    log('SERVER', `   Heartbeat: ${HEARTBEAT_INTERVAL / 1000}s`);
    log('SERVER', `   Room TTL:  ${ROOM_TTL / 60000} min`);
});
