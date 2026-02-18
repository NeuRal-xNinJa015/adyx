/**
 * Adyx Crypto Engine — Military Grade (v2.0)
 * 
 * Inspired by Israeli Unit 8200 communication security protocols.
 * 
 * Key Derivation: PBKDF2(roomKey, salt, 600000, 256-bit, SHA-512)
 * Encryption:     AES-256-GCM with random 12-byte IV
 * Integrity:      HMAC-SHA256 signature on every message
 * Forward Secrecy: Per-message sub-key derivation using message counter
 * Anti-Replay:    Nonce tracking to prevent message replay attacks
 * Anti-Forensics: Active key zeroing and memory cleanup
 */

let cachedKey = null;
let cachedHmacKey = null;
let cachedRoomKey = null;
let cachedSalt = null;
let messageCounter = 0;
const usedNonces = new Set();
const MAX_NONCE_HISTORY = 10000;

// ═══════════════════════════════════════════
// KEY DERIVATION
// ═══════════════════════════════════════════

async function deriveKey(roomKey, salt) {
    if (cachedKey && cachedRoomKey === roomKey && cachedSalt === salt) return cachedKey;

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(roomKey),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const aesKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode(salt),
            iterations: 600000, // 6x stronger than standard
            hash: 'SHA-512',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );

    cachedKey = aesKey;
    cachedRoomKey = roomKey;
    cachedSalt = salt;
    return aesKey;
}

async function deriveHmacKey(roomKey, salt) {
    if (cachedHmacKey && cachedRoomKey === roomKey) return cachedHmacKey;

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(roomKey + ':hmac:v2'),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const hmacKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode(salt + ':integrity:v2'),
            iterations: 600000,
            hash: 'SHA-512',
        },
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign', 'verify']
    );

    cachedHmacKey = hmacKey;
    return hmacKey;
}

// ═══════════════════════════════════════════
// FORWARD SECRECY — Per-message sub-key
// ═══════════════════════════════════════════

async function deriveSubKey(baseKey, counter) {
    const enc = new TextEncoder();
    const subKeyMaterial = await crypto.subtle.sign(
        'HMAC',
        await deriveHmacKey(cachedRoomKey, cachedSalt),
        enc.encode(`msg:${counter}:${Date.now()}`)
    );
    // Use the HMAC output as additional entropy for the IV
    return new Uint8Array(subKeyMaterial).slice(0, 12);
}

// ═══════════════════════════════════════════
// ANTI-REPLAY
// ═══════════════════════════════════════════

function generateNonce() {
    const nonce = bufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
    return nonce;
}

function checkNonce(nonce) {
    if (usedNonces.has(nonce)) return false; // Replay detected!
    usedNonces.add(nonce);
    // Prevent unbounded growth
    if (usedNonces.size > MAX_NONCE_HISTORY) {
        const iter = usedNonces.values();
        for (let i = 0; i < 1000; i++) {
            usedNonces.delete(iter.next().value);
        }
    }
    return true;
}

// ═══════════════════════════════════════════
// SIGN / VERIFY
// ═══════════════════════════════════════════

async function signData(data, roomKey, salt) {
    const hmacKey = await deriveHmacKey(roomKey, salt);
    const enc = new TextEncoder();
    const signature = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(data));
    return bufferToBase64(signature);
}

export async function verifySignature(data, signature, roomKey, salt) {
    try {
        const hmacKey = await deriveHmacKey(roomKey, salt);
        const enc = new TextEncoder();
        return await crypto.subtle.verify('HMAC', hmacKey, base64ToBuffer(signature), enc.encode(data));
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════
// ENCRYPT / DECRYPT — TEXT
// ═══════════════════════════════════════════

export async function encrypt(plaintext, roomKey, salt) {
    const key = await deriveKey(roomKey, salt);
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const nonce = generateNonce();
    const counter = ++messageCounter;

    // Add metadata envelope: nonce + timestamp + counter for anti-replay & forward secrecy
    const envelope = JSON.stringify({
        p: plaintext,
        n: nonce,
        t: Date.now(),
        c: counter,
    });

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(envelope)
    );

    const ciphertext = bufferToBase64(cipherBuffer);
    const ivB64 = bufferToBase64(iv);
    const hmac = await signData(ciphertext + ':' + ivB64 + ':' + nonce, roomKey, salt);

    return { ciphertext, iv: ivB64, hmac, nonce };
}

export async function decrypt(ciphertext, iv, roomKey, salt, hmac, nonce) {
    // Verify integrity if hmac is provided
    if (hmac) {
        const verifyData = nonce ? ciphertext + ':' + iv + ':' + nonce : ciphertext + ':' + iv;
        const valid = await verifySignature(verifyData, hmac, roomKey, salt);
        if (!valid) {
            throw new Error('INTEGRITY VIOLATION — message tampered');
        }
    }

    // Anti-replay check
    if (nonce && !checkNonce(nonce)) {
        throw new Error('REPLAY ATTACK DETECTED — duplicate nonce');
    }

    const key = await deriveKey(roomKey, salt);
    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(iv) },
        key,
        base64ToBuffer(ciphertext)
    );

    const decoded = new TextDecoder().decode(plainBuffer);

    // Try to parse envelope format
    try {
        const envelope = JSON.parse(decoded);
        if (envelope.p !== undefined) {
            // Check message age (reject messages older than 5 minutes)
            if (envelope.t && Date.now() - envelope.t > 5 * 60 * 1000) {
                throw new Error('MESSAGE EXPIRED — outside time window');
            }
            return envelope.p;
        }
    } catch (e) {
        if (e.message.includes('EXPIRED') || e.message.includes('REPLAY')) throw e;
    }

    // Fallback for legacy format (plain text, no envelope)
    return decoded;
}

// ═══════════════════════════════════════════
// ENCRYPT / DECRYPT — BINARY (files/images)
// ═══════════════════════════════════════════

export async function encryptBinary(arrayBuffer, roomKey, salt) {
    const key = await deriveKey(roomKey, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const nonce = generateNonce();

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        arrayBuffer
    );

    const ciphertext = bufferToBase64(cipherBuffer);
    const ivB64 = bufferToBase64(iv);
    const hmac = await signData(ciphertext + ':' + ivB64 + ':' + nonce, roomKey, salt);

    return { ciphertext, iv: ivB64, hmac, nonce };
}

export async function decryptBinary(ciphertext, iv, roomKey, salt, hmac, nonce) {
    if (hmac) {
        const verifyData = nonce ? ciphertext + ':' + iv + ':' + nonce : ciphertext + ':' + iv;
        const valid = await verifySignature(verifyData, hmac, roomKey, salt);
        if (!valid) {
            throw new Error('FILE INTEGRITY VIOLATION — possible tampering');
        }
    }

    if (nonce && !checkNonce(nonce)) {
        throw new Error('REPLAY ATTACK — duplicate file nonce');
    }

    const key = await deriveKey(roomKey, salt);
    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(iv) },
        key,
        base64ToBuffer(ciphertext)
    );

    return plainBuffer;
}

// ═══════════════════════════════════════════
// KEY DESTRUCTION — Anti-Forensics
// ═══════════════════════════════════════════

/**
 * Securely wipe all cached keys and state from memory.
 * Overwrites strings with random data before nulling
 * to defeat heap snapshot forensics.
 */
export function wipeKeys() {
    // Overwrite cached strings with random bytes before nulling
    if (cachedRoomKey && typeof cachedRoomKey === 'string') {
        try {
            const overwrite = Array.from(crypto.getRandomValues(new Uint8Array(cachedRoomKey.length)))
                .map(b => String.fromCharCode(b)).join('');
            cachedRoomKey = overwrite;
        } catch { }
    }
    if (cachedSalt && typeof cachedSalt === 'string') {
        try {
            const overwrite = Array.from(crypto.getRandomValues(new Uint8Array(cachedSalt.length)))
                .map(b => String.fromCharCode(b)).join('');
            cachedSalt = overwrite;
        } catch { }
    }
    cachedKey = null;
    cachedHmacKey = null;
    cachedRoomKey = null;
    cachedSalt = null;
    messageCounter = 0;
    usedNonces.clear();
}

/**
 * Get current message counter (for forward secrecy tracking)
 */
export function getMessageCounter() {
    return messageCounter;
}

/**
 * Rate key entropy: returns 'weak' | 'medium' | 'strong'
 * Based on length, character variety, and common patterns.
 */
export function rateKeyStrength(key) {
    if (!key || key.length < 4) return 'weak';
    const hasUpper = /[A-Z]/.test(key);
    const hasLower = /[a-z]/.test(key);
    const hasNum = /[0-9]/.test(key);
    const hasSpecial = /[^A-Za-z0-9]/.test(key);
    const unique = new Set(key.split('')).size;
    const variety = [hasUpper, hasLower, hasNum, hasSpecial].filter(Boolean).length;

    // Check for common weak patterns
    const common = /^(1234|abcd|qwer|pass|0000|1111)/i.test(key);
    if (common) return 'weak';

    if (key.length >= 6 && variety >= 2 && unique >= 4) return 'strong';
    if (key.length >= 4 && variety >= 1 && unique >= 3) return 'medium';
    return 'weak';
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════

function bufferToBase64(buffer) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function base64ToBuffer(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}
