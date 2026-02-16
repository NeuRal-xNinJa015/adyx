/**
 * Adyx Server
 * 
 * WebSocket relay for encrypted messaging.
 * The server NEVER decrypts messages. It only relays encrypted blobs.
 * Security-first: copy/screenshot alerts, delivery receipts, image relay.
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const crypto = require('crypto');
const url = require('url');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// ═══════════════════════════════════════════
// ROOM MANAGEMENT
// ═══════════════════════════════════════════

const rooms = new Map();

function generateRoomKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
        key += chars[bytes[i] % chars.length];
    }
    return key;
}

// ═══════════════════════════════════════════
// HTTP ROUTES
// ═══════════════════════════════════════════

app.post('/api/room/create', (req, res) => {
    let key;
    let attempts = 0;
    do {
        key = generateRoomKey();
        attempts++;
    } while (rooms.has(key) && attempts < 100);

    if (rooms.has(key)) {
        return res.status(500).json({ error: 'Unable to generate unique key' });
    }

    const salt = crypto.randomBytes(16).toString('hex');

    rooms.set(key, {
        admin: null,
        receiver: null,
        createdAt: Date.now(),
        salt,
    });

    console.log(`[ROOM] Created: ${key}`);
    res.json({ key, salt });
});

app.post('/api/room/join', (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'Key required' });

    const room = rooms.get(key.toUpperCase());
    if (!room) {
        return res.status(404).json({ error: 'Invalid key. No room found.' });
    }

    res.json({ key: key.toUpperCase(), salt: room.salt });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', rooms: rooms.size, uptime: process.uptime() });
});

// ═══════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════

const server = http.createServer(app);
const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 10 * 1024 * 1024, // 10MB for images
});

wss.on('connection', (ws, req) => {
    const params = url.parse(req.url, true).query;
    const roomKey = params.key?.toUpperCase();
    const role = params.role;
    const nickname = decodeURIComponent(params.nickname || 'Anon');

    if (!roomKey || !role) {
        ws.close(4000, 'Missing key or role');
        return;
    }

    const room = rooms.get(roomKey);
    if (!room) {
        ws.close(4001, 'Room not found');
        return;
    }

    if (role === 'admin') {
        room.admin = ws;
    } else {
        room.receiver = ws;
    }

    ws.roomKey = roomKey;
    ws.role = role;
    ws.nickname = nickname;
    ws.isAlive = true;

    console.log(`[WS] ${role} (${nickname}) joined room ${roomKey}`);

    const peer = role === 'admin' ? room.receiver : room.admin;
    if (peer && peer.readyState === 1) {
        peer.send(JSON.stringify({ type: 'peer_joined', role, nickname: ws.nickname }));
        ws.send(JSON.stringify({ type: 'peer_joined', role: peer.role, nickname: peer.nickname }));
    }

    // ── Handle messages ──
    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch {
            return;
        }

        const currentRoom = rooms.get(ws.roomKey);
        if (!currentRoom) return;

        const target = ws.role === 'admin' ? currentRoom.receiver : currentRoom.admin;

        switch (msg.type) {
            // Text message relay
            case 'encrypted_message':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({
                        type: 'encrypted_message',
                        ciphertext: msg.ciphertext,
                        iv: msg.iv,
                        id: msg.id,
                        timestamp: Date.now(),
                        from: ws.role,
                    }));
                    // Tell sender: message delivered to peer
                    ws.send(JSON.stringify({ type: 'delivery_ack', id: msg.id, timestamp: Date.now() }));
                } else {
                    // Peer not connected, just ack sent
                    ws.send(JSON.stringify({ type: 'ack', id: msg.id }));
                }
                break;

            // Image relay (encrypted base64 blob)
            case 'encrypted_image':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({
                        type: 'encrypted_image',
                        ciphertext: msg.ciphertext,
                        iv: msg.iv,
                        id: msg.id,
                        fileName: msg.fileName,
                        fileType: msg.fileType,
                        fileSize: msg.fileSize,
                        timestamp: Date.now(),
                        from: ws.role,
                    }));
                    ws.send(JSON.stringify({ type: 'delivery_ack', id: msg.id, timestamp: Date.now() }));
                } else {
                    ws.send(JSON.stringify({ type: 'ack', id: msg.id }));
                }
                break;

            // File/document relay
            case 'encrypted_file':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({
                        type: 'encrypted_file',
                        ciphertext: msg.ciphertext,
                        iv: msg.iv,
                        id: msg.id,
                        fileName: msg.fileName,
                        fileType: msg.fileType,
                        fileSize: msg.fileSize,
                        timestamp: Date.now(),
                        from: ws.role,
                    }));
                    ws.send(JSON.stringify({ type: 'delivery_ack', id: msg.id, timestamp: Date.now() }));
                } else {
                    ws.send(JSON.stringify({ type: 'ack', id: msg.id }));
                }
                break;

            // Read receipt from peer
            case 'read_receipt':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({
                        type: 'read_receipt',
                        id: msg.id,
                        timestamp: Date.now(),
                    }));
                }
                break;

            // Security alert: copy/screenshot attempt
            case 'security_alert':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({
                        type: 'security_alert',
                        alertType: msg.alertType, // 'copy_attempt', 'screenshot_attempt', 'save_attempt'
                        timestamp: Date.now(),
                        from: ws.role,
                    }));
                }
                break;

            // Typing indicator
            case 'typing':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({ type: 'typing', isTyping: msg.isTyping }));
                }
                break;

            // Room end — one user ends, both get kicked
            case 'room_end':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({ type: 'room_end', from: ws.role }));
                    target.close(4002, 'Room ended');
                }
                // Delete room immediately
                rooms.delete(ws.roomKey);
                console.log(`[ROOM] Ended by ${ws.role}: ${ws.roomKey}`);
                ws.close(4002, 'Room ended');
                break;
        }
    });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
        const currentRoom = rooms.get(ws.roomKey);
        if (!currentRoom) return;

        const target = ws.role === 'admin' ? currentRoom.receiver : currentRoom.admin;
        if (target && target.readyState === 1) {
            target.send(JSON.stringify({ type: 'peer_left', role: ws.role, nickname: ws.nickname }));
        }

        if (ws.role === 'admin') currentRoom.admin = null;
        else currentRoom.receiver = null;

        if (!currentRoom.admin && !currentRoom.receiver) {
            setTimeout(() => {
                const r = rooms.get(ws.roomKey);
                if (r && !r.admin && !r.receiver) {
                    rooms.delete(ws.roomKey);
                    console.log(`[ROOM] Cleaned up: ${ws.roomKey}`);
                }
            }, 60000);
        }

        console.log(`[WS] ${ws.role} left room ${ws.roomKey}`);
    });

    ws.on('error', (err) => {
        console.error(`[WS] Error in ${ws.roomKey}:`, err.message);
    });
});

// ── Heartbeat ──
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// ── Stale room cleanup (24h) ──
setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, room] of rooms) {
        if (room.createdAt < cutoff && !room.admin && !room.receiver) {
            rooms.delete(key);
            console.log(`[ROOM] Expired: ${key}`);
        }
    }
}, 60 * 60 * 1000);

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║   Adyx Server                          ║
║   Port: ${PORT}                           ║
║   WS:   ws://localhost:${PORT}/ws          ║
║   Max Payload: 10MB                    ║
╚════════════════════════════════════════╝
  `);
});
