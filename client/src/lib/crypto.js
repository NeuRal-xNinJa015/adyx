/**
 * AES-256-GCM Encryption using Web Crypto API
 * 
 * Key derivation: PBKDF2(roomKey, salt, 100000, 256-bit, SHA-512)
 * Encryption: AES-256-GCM with random 12-byte IV
 * 
 * Supports both text and binary (images/files) encryption.
 */

let cachedKey = null;
let cachedRoomKey = null;

async function deriveKey(roomKey, salt) {
    if (cachedKey && cachedRoomKey === roomKey) return cachedKey;

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
            iterations: 100000,
            hash: 'SHA-512',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );

    cachedKey = aesKey;
    cachedRoomKey = roomKey;
    return aesKey;
}

// Encrypt plaintext → { ciphertext, iv } (both base64)
export async function encrypt(plaintext, roomKey, salt) {
    const key = await deriveKey(roomKey, salt);
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
    );

    return {
        ciphertext: bufferToBase64(cipherBuffer),
        iv: bufferToBase64(iv),
    };
}

// Decrypt { ciphertext, iv } → plaintext string
export async function decrypt(ciphertext, iv, roomKey, salt) {
    const key = await deriveKey(roomKey, salt);

    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(iv) },
        key,
        base64ToBuffer(ciphertext)
    );

    return new TextDecoder().decode(plainBuffer);
}

// Encrypt binary data (ArrayBuffer) → { ciphertext, iv } (both base64)
export async function encryptBinary(arrayBuffer, roomKey, salt) {
    const key = await deriveKey(roomKey, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        arrayBuffer
    );

    return {
        ciphertext: bufferToBase64(cipherBuffer),
        iv: bufferToBase64(iv),
    };
}

// Decrypt binary → ArrayBuffer
export async function decryptBinary(ciphertext, iv, roomKey, salt) {
    const key = await deriveKey(roomKey, salt);

    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(iv) },
        key,
        base64ToBuffer(ciphertext)
    );

    return plainBuffer;
}

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
