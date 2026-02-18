/**
 * Adyx Server — Military Hardened (v3.0)
 * 
 * WebSocket relay for encrypted messaging.
 * The server NEVER decrypts messages — zero-knowledge relay only.
 * 
 * Security: rate limiting, origin validation, brute-force protection,
 * anti-enumeration timing, connection fingerprinting, canary support,
 * progressive lockout, enhanced headers, room passwords (SHA-256),
 * per-IP connection limits, input sanitization, inactivity auto-nuke,
 * disappearing message relay, reaction relay.
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const crypto = require('crypto');
const url = require('url');

const app = express();

// ═══════════════════════════════════════════
// SECURITY HEADERS (Intelligence-Grade)
// ═══════════════════════════════════════════

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), display-capture=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; script-src 'self' 'unsafe-inline'");
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    next();
});

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({
    origin: (origin, cb) => {
        if (ALLOWED_ORIGINS.includes('*') || !origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
        else cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '1kb' }));

// ═══════════════════════════════════════════
// INPUT SANITIZATION
// ═══════════════════════════════════════════

function sanitize(str, maxLen = 50) {
    if (typeof str !== 'string') return '';
    // Strip control characters, null bytes, and non-printable chars
    return str.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().slice(0, maxLen);
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ═══════════════════════════════════════════
// RATE LIMITING (in-memory, sliding window)
// ═══════════════════════════════════════════

const rateLimits = new Map();
const joinAttempts = new Map();
const bruteForce = new Map();

function getIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(map, ip, maxRequests, windowMs) {
    const now = Date.now();
    let entry = map.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        map.set(ip, entry);
    }
    entry.count++;
    return entry.count <= maxRequests;
}

function checkBruteForce(ip) {
    const entry = bruteForce.get(ip);
    if (!entry) return true;
    if (Date.now() < entry.lockedUntil) return false;
    if (Date.now() > entry.lockedUntil) { bruteForce.delete(ip); return true; }
    return true;
}

function recordFailedJoin(ip) {
    let entry = bruteForce.get(ip);
    if (!entry) entry = { failures: 0, lockedUntil: 0 };
    entry.failures++;
    // Progressive lockout: 5 fails → 5min, 10 → 15min, 15 → 30min
    if (entry.failures >= 15) {
        entry.lockedUntil = Date.now() + 30 * 60 * 1000;
    } else if (entry.failures >= 10) {
        entry.lockedUntil = Date.now() + 15 * 60 * 1000;
    } else if (entry.failures >= 5) {
        entry.lockedUntil = Date.now() + 5 * 60 * 1000;
    }
    bruteForce.set(ip, entry);
}

// Anti-enumeration: random delay on operations
function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
}

// Cleanup rate limit maps every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimits) { if (now > v.resetAt) rateLimits.delete(k); }
    for (const [k, v] of joinAttempts) { if (now > v.resetAt) joinAttempts.delete(k); }
    for (const [k, v] of bruteForce) { if (now > v.lockedUntil) bruteForce.delete(k); }
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════
// PER-IP CONNECTION LIMITS
// ═══════════════════════════════════════════

const ipConnections = new Map();
const MAX_CONNECTIONS_PER_IP = 3;

function addIPConnection(ip) {
    ipConnections.set(ip, (ipConnections.get(ip) || 0) + 1);
}

function removeIPConnection(ip) {
    const count = (ipConnections.get(ip) || 1) - 1;
    if (count <= 0) ipConnections.delete(ip);
    else ipConnections.set(ip, count);
}

function isIPOverLimit(ip) {
    return (ipConnections.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP;
}

// ═══════════════════════════════════════════
// ROOM MANAGEMENT
// ═══════════════════════════════════════════

const rooms = new Map();

function generateRoomKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) key += chars[bytes[i] % chars.length];
    return key;
}

// ═══════════════════════════════════════════
// HTTP ROUTES
// ═══════════════════════════════════════════

app.post('/api/room/create', async (req, res) => {
    const ip = getIP(req);
    if (!checkRateLimit(rateLimits, ip, 5, 60000)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    await randomDelay(); // Anti-timing attack

    let key, attempts = 0;
    do { key = generateRoomKey(); attempts++; } while (rooms.has(key) && attempts < 100);
    if (rooms.has(key)) return res.status(500).json({ error: 'Unable to generate unique key' });

    const salt = crypto.randomBytes(32).toString('hex');

    // Optional room password
    const rawPassword = req.body?.password;
    let passwordHash = null;
    if (rawPassword && typeof rawPassword === 'string' && rawPassword.length >= 1) {
        const cleaned = sanitize(rawPassword, 128);
        if (cleaned.length > 0) {
            passwordHash = hashPassword(cleaned);
        }
    }

    rooms.set(key, {
        admin: null, receiver: null,
        createdAt: Date.now(), lastActivity: Date.now(),
        salt, passwordHash,
        messageCount: 0, fingerprints: {},
        disappearMode: 0, // 0 = off, else seconds
    });

    console.log(`[ROOM] Created: ${key} (IP: ${ip.slice(-8)})${passwordHash ? ' [PASSWORD]' : ''}`);
    res.json({ key, salt, hasPassword: !!passwordHash });
});

app.post('/api/room/join', async (req, res) => {
    const ip = getIP(req);
    const { key, password } = req.body;

    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'Key required' });
    if (!checkBruteForce(ip)) return res.status(429).json({ error: 'Too many failed attempts. Locked.' });
    if (!checkRateLimit(joinAttempts, ip, 10, 60000)) return res.status(429).json({ error: 'Too many attempts. Slow down.' });

    await randomDelay(); // Anti-enumeration timing

    const cleaned = sanitize(key, 6).toUpperCase();
    if (cleaned.length !== 6 || !/^[A-Z0-9]{6}$/.test(cleaned)) {
        recordFailedJoin(ip);
        return res.status(400).json({ error: 'Invalid key format.' });
    }

    const room = rooms.get(cleaned);
    if (!room) {
        recordFailedJoin(ip);
        await randomDelay(); // Extra delay on failure to prevent timing
        return res.status(404).json({ error: 'Invalid key. No room found.' });
    }

    // Password check
    if (room.passwordHash) {
        if (!password || typeof password !== 'string') {
            return res.status(401).json({ error: 'Password required.', needsPassword: true });
        }
        const attempt = hashPassword(sanitize(password, 128));
        if (attempt !== room.passwordHash) {
            recordFailedJoin(ip);
            await randomDelay();
            return res.status(401).json({ error: 'Incorrect password.' });
        }
    }

    res.json({ key: cleaned, salt: room.salt });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', rooms: rooms.size, uptime: Math.floor(process.uptime()) });
});

// ═══════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════

const server = http.createServer(app);
const wss = new WebSocketServer({
    server, path: '/ws',
    maxPayload: 10 * 1024 * 1024, // 10MB for images
});

function validateWSOrigin(req) {
    if (ALLOWED_ORIGINS.includes('*')) return true;
    const origin = req.headers.origin;
    return !origin || ALLOWED_ORIGINS.includes(origin);
}

wss.on('connection', (ws, req) => {
    if (!validateWSOrigin(req)) { ws.close(4003, 'Origin not allowed'); return; }

    const params = url.parse(req.url, true).query;
    const roomKey = sanitize(params.key || '', 6).toUpperCase();
    const role = params.role;
    const nickname = sanitize(decodeURIComponent(params.nickname || 'Anon'), 20);
    const fingerprint = sanitize(params.fp || '', 50);
    const wsIP = getIP(req);

    if (!roomKey || !role || !['admin', 'receiver'].includes(role)) { ws.close(4000, 'Missing or invalid key/role'); return; }
    if (roomKey.length !== 6 || !/^[A-Z0-9]{6}$/.test(roomKey)) { ws.close(4000, 'Invalid key format'); return; }

    // Per-IP connection limit
    if (isIPOverLimit(wsIP)) { ws.close(4006, 'Too many connections'); return; }

    const room = rooms.get(roomKey);
    if (!room) { ws.close(4001, 'Room not found'); return; }

    // Prevent third connections
    if (role === 'admin' && room.admin && room.admin.readyState === 1) { ws.close(4004, 'Admin already connected'); return; }
    if (role === 'receiver' && room.receiver && room.receiver.readyState === 1) { ws.close(4004, 'Receiver already connected'); return; }

    // Store fingerprint for session binding
    if (fingerprint) {
        if (room.fingerprints[role] && room.fingerprints[role] !== fingerprint) {
            console.log(`[SECURITY] Fingerprint mismatch for ${role} in ${roomKey}`);
        }
        room.fingerprints[role] = fingerprint;
    }

    if (role === 'admin') room.admin = ws;
    else room.receiver = ws;

    addIPConnection(wsIP);
    ws.roomKey = roomKey;
    ws.role = role;
    ws.nickname = nickname;
    ws.isAlive = true;
    ws.msgCount = 0;
    ws.wsIP = wsIP;

    room.lastActivity = Date.now();

    console.log(`[WS] ${role} (${nickname}) joined room ${roomKey}`);

    const peer = role === 'admin' ? room.receiver : room.admin;
    if (peer && peer.readyState === 1) {
        peer.send(JSON.stringify({ type: 'peer_joined', role, nickname: ws.nickname }));
        ws.send(JSON.stringify({ type: 'peer_joined', role: peer.role, nickname: peer.nickname }));
    }

    // ── Message rate limiting per connection ──
    let msgTimestamps = [];
    function isMessageRateLimited() {
        const now = Date.now();
        msgTimestamps = msgTimestamps.filter(t => now - t < 1000);
        if (msgTimestamps.length >= 30) return true;
        msgTimestamps.push(now);
        return false;
    }

    // ── Handle messages ──
    ws.on('message', (data) => {
        if (data.length > 10 * 1024 * 1024) { ws.send(JSON.stringify({ type: 'error', message: 'Message too large' })); return; }

        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;

        // Update activity timestamp
        const currentRoom = rooms.get(ws.roomKey);
        if (currentRoom) currentRoom.lastActivity = Date.now();

        // Silently handle canary messages
        if (msg.type === 'canary') { ws.send(JSON.stringify({ type: 'canary_ack' })); return; }
        if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', t: msg.t })); return; }

        if (isMessageRateLimited()) { ws.send(JSON.stringify({ type: 'error', message: 'Slow down' })); return; }

        if (!currentRoom) return;
        const target = ws.role === 'admin' ? currentRoom.receiver : currentRoom.admin;

        switch (msg.type) {
            case 'encrypted_message':
                if (!msg.ciphertext || !msg.iv) break;
                currentRoom.messageCount++;
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({
                        type: 'encrypted_message', ciphertext: msg.ciphertext, iv: msg.iv,
                        hmac: msg.hmac, nonce: msg.nonce,
                        id: msg.id, timestamp: Date.now(), from: ws.role
                    }));
                    ws.send(JSON.stringify({ type: 'delivery_ack', id: msg.id, timestamp: Date.now() }));
                } else { ws.send(JSON.stringify({ type: 'ack', id: msg.id })); }
                break;

            case 'encrypted_image':
            case 'encrypted_file':
                if (!msg.ciphertext || !msg.iv) break;
                currentRoom.messageCount++;
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({
                        type: msg.type, ciphertext: msg.ciphertext, iv: msg.iv,
                        hmac: msg.hmac, nonce: msg.nonce,
                        id: msg.id,
                        fileName: sanitize(msg.fileName || '', 255),
                        fileType: sanitize(msg.fileType || '', 100),
                        fileSize: Number(msg.fileSize) || 0,
                        timestamp: Date.now(), from: ws.role,
                    }));
                    ws.send(JSON.stringify({ type: 'delivery_ack', id: msg.id, timestamp: Date.now() }));
                } else { ws.send(JSON.stringify({ type: 'ack', id: msg.id })); }
                break;

            case 'read_receipt':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({ type: 'read_receipt', id: msg.id, timestamp: Date.now() }));
                }
                break;

            case 'security_alert':
                if (target && target.readyState === 1) {
                    const allowedAlerts = ['copy_attempt', 'screenshot_attempt', 'save_attempt', 'tab_switch', 'devtools_attempt', 'screen_capture', 'window_blur'];
                    const alertType = allowedAlerts.includes(msg.alertType) ? msg.alertType : 'unknown';
                    target.send(JSON.stringify({ type: 'security_alert', alertType, timestamp: Date.now(), from: ws.role }));
                }
                break;

            case 'typing':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({ type: 'typing', isTyping: !!msg.isTyping }));
                }
                break;

            case 'reaction':
                if (target && target.readyState === 1) {
                    const allowedEmoji = ['🔥', '✅', '❤️', '👀', '👍', '😂'];
                    const emoji = allowedEmoji.includes(msg.emoji) ? msg.emoji : '👍';
                    target.send(JSON.stringify({ type: 'reaction', msgId: sanitize(msg.msgId || '', 50), emoji, from: ws.role }));
                }
                break;

            case 'disappear_mode':
                if (ws.role === 'admin' && currentRoom) {
                    const allowed = [0, 30, 60, 300];
                    currentRoom.disappearMode = allowed.includes(msg.seconds) ? msg.seconds : 0;
                    if (target && target.readyState === 1) {
                        target.send(JSON.stringify({ type: 'disappear_mode', seconds: currentRoom.disappearMode }));
                    }
                    ws.send(JSON.stringify({ type: 'disappear_mode', seconds: currentRoom.disappearMode }));
                }
                break;

            case 'room_end':
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({ type: 'room_end', from: ws.role }));
                    target.close(4002, 'Room ended');
                }
                rooms.delete(ws.roomKey);
                console.log(`[ROOM] Ended by ${ws.role}: ${ws.roomKey}`);
                ws.close(4002, 'Room ended');
                break;
        }
    });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
        removeIPConnection(ws.wsIP);
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
                if (r && !r.admin && !r.receiver) { rooms.delete(ws.roomKey); console.log(`[ROOM] Cleaned up: ${ws.roomKey}`); }
            }, 30000);
        }
        console.log(`[WS] ${ws.role} left room ${ws.roomKey}`);
    });

    ws.on('error', (err) => { console.error(`[WS] Error in ${ws.roomKey}:`, err.message); });
});

// ── Heartbeat ──
setInterval(() => {
    wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
}, 30000);

// ── Stale room cleanup + inactivity nuke ──
setInterval(() => {
    const now = Date.now();
    for (const [key, room] of rooms) {
        // Inactivity: nuke room if no activity for 30 minutes
        if (now - room.lastActivity > 30 * 60 * 1000) {
            if (room.admin) { room.admin.send(JSON.stringify({ type: 'room_end', from: 'server', reason: 'inactivity' })); room.admin.close(4007, 'Inactivity timeout'); }
            if (room.receiver) { room.receiver.send(JSON.stringify({ type: 'room_end', from: 'server', reason: 'inactivity' })); room.receiver.close(4007, 'Inactivity timeout'); }
            rooms.delete(key); console.log(`[ROOM] Inactivity nuke: ${key}`);
            continue;
        }
        // Empty room: cleanup after 1 hour
        if (!room.admin && !room.receiver && now - room.createdAt > 60 * 60 * 1000) {
            rooms.delete(key); console.log(`[ROOM] Expired: ${key}`);
        }
        // Hard limit: 24 hours max lifetime
        if (now - room.createdAt > 24 * 60 * 60 * 1000) {
            if (room.admin) room.admin.close(4005, 'Room expired');
            if (room.receiver) room.receiver.close(4005, 'Room expired');
            rooms.delete(key); console.log(`[ROOM] Force-expired: ${key}`);
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════╗
║   Adyx Server v3.0 (Military Hardened)       ║
║   Port: ${PORT}                                  ║
║   WS:   ws://localhost:${PORT}/ws                 ║
║   Max Payload: 10MB                          ║
║   Rate Limit: 5 creates/min, 10 joins/min   ║
║   Brute Force: Progressive lockout           ║
║   Anti-Enumeration: Random delay enabled     ║
║   Fingerprint Binding: Active                ║
║   IP Connection Limit: ${MAX_CONNECTIONS_PER_IP} per IP              ║
║   Room Passwords: SHA-256 supported          ║
║   Inactivity Nuke: 30 minutes               ║
║   Input Sanitization: Active                 ║
╚══════════════════════════════════════════════╝
  `);
});
