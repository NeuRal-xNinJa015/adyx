/**
 * AegisComms Web Crypto API Wrapper
 * 
 * Client-side encryption using the Web Crypto API.
 * All encryption/decryption happens HERE — never on the server.
 * 
 * Algorithms:
 *   - ECDH P-256 (key exchange) — browser-compatible equivalent of X25519
 *   - AES-256-GCM (message encryption)
 *   - ECDSA P-256 (signatures)
 *   - HKDF (key derivation)
 */

const ALGO_ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const ALGO_ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const ALGO_AES = { name: 'AES-GCM', length: 256 };

/**
 * Generate an ECDH key pair for key exchange
 */
export async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
        ALGO_ECDH,
        true, // extractable
        ['deriveKey', 'deriveBits']
    );
    return keyPair;
}

/**
 * Generate an ECDSA signing key pair
 */
export async function generateSigningKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
        ALGO_ECDSA,
        true,
        ['sign', 'verify']
    );
    return keyPair;
}

/**
 * Export a public key to raw bytes (for transmission)
 */
export async function exportPublicKey(key) {
    const raw = await crypto.subtle.exportKey('spki', key);
    return new Uint8Array(raw);
}

/**
 * Import a peer's public key from raw bytes
 */
export async function importPublicKey(rawBytes) {
    return crypto.subtle.importKey(
        'spki',
        rawBytes,
        ALGO_ECDH,
        true,
        []
    );
}

/**
 * Derive a shared AES-256-GCM key from our private key + peer's public key
 */
export async function deriveSharedKey(privateKey, peerPublicKey) {
    return crypto.subtle.deriveKey(
        { name: 'ECDH', public: peerPublicKey },
        privateKey,
        ALGO_AES,
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt a message with AES-256-GCM
 * Returns: { iv, ciphertext } both as Uint8Array
 */
export async function encrypt(sharedKey, plaintext) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Generate random 12-byte IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        sharedKey,
        data
    );

    // Combine IV + ciphertext into single buffer
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return combined;
}

/**
 * Decrypt a message with AES-256-GCM
 * Input: Uint8Array with IV (first 12 bytes) + ciphertext
 */
export async function decrypt(sharedKey, combined) {
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        sharedKey,
        ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
}

/**
 * Convert Uint8Array to base64 string
 */
export function toBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
}

/**
 * Convert base64 string to Uint8Array
 */
export function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Generate a random device fingerprint
 */
export function generateFingerprint() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
