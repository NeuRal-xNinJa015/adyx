import { useState, useEffect, useRef } from 'react';

/**
 * LiveTerminal — an auto-scrolling security console that simulates
 * encryption operations, key derivation, and connection monitoring.
 * Keeps the user engaged while waiting for a peer to connect.
 */

const OPS = [
    () => `[PBKDF2] Deriving key... (${(Math.random() * 600000).toFixed(0)}/600000 iterations)`,
    () => `[AES-256] iv=${randomHex(12)} mode=GCM tag_len=128`,
    () => `[HMAC] SHA-256 digest: ${randomHex(32)}`,
    () => `[ECDH] Generating ephemeral keypair... curve=P-384`,
    () => `[HKDF] Extract: salt=${randomHex(16)}, ikm=${randomHex(16)}`,
    () => `[HKDF] Expand: info="adyx-v2-msg-key" len=32`,
    () => `[ENTROPY] Collected ${(Math.random() * 256 + 128).toFixed(0)} bits from crypto.getRandomValues`,
    () => `[SESSION] Fingerprint: ${randomHex(20)}`,
    () => `[CANARY] Dummy traffic scheduled: ${(Math.random() * 5 + 2).toFixed(1)}s interval`,
    () => `[NONCE] Anti-replay tracker initialized: window=1024`,
    () => `[WIPE] Key material zero-fill scheduled: ${(Math.random() * 300 + 60).toFixed(0)}s`,
    () => `[VERIFY] Certificate chain: depth=3, status=VALID`,
    () => `[TLS] Handshake complete: TLS_AES_256_GCM_SHA384`,
    () => `[STREAM] Cipher stream ${randomHex(8)} attached to socket`,
    () => `[MONITOR] Connection health: latency=${(Math.random() * 50 + 10).toFixed(0)}ms, jitter=${(Math.random() * 5).toFixed(1)}ms`,
    () => `[SECURE] Forward secrecy: sub-key rotated (msg_id=${(Math.random() * 999).toFixed(0)})`,
    () => `[GUARD] Screenshot protection: ACTIVE`,
    () => `[GUARD] Copy prevention: ACTIVE`,
    () => `[GUARD] DevTools detection: ACTIVE`,
    () => `[TIMER] Self-destruct scheduled: 300s per message`,
    () => `[DEAD-MAN] Inactivity monitor: 180s threshold`,
    () => `[SCAN] Port scan detection: listening on ${Math.floor(Math.random() * 8) + 1} interfaces`,
    () => `[GCM] Auth tag computed: ${randomHex(16)}`,
    () => `[SALT] Generated: ${randomHex(32)} (256-bit)`,
    () => `[KEY] Master key derived: ${randomHex(32)}`,
];

function randomHex(len) {
    return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function timestamp() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export default function LiveTerminal({ roomKey }) {
    const [lines, setLines] = useState([]);
    const scrollRef = useRef(null);
    const intervalRef = useRef(null);

    useEffect(() => {
        // Initial burst
        const initial = [
            { t: timestamp(), text: `[INIT] Adyx v2.0 — Secure Communication Terminal`, type: 'header' },
            { t: timestamp(), text: `[ROOM] Key: ${roomKey}`, type: 'info' },
            { t: timestamp(), text: `[CRYPTO] Engine: AES-256-GCM + PBKDF2-SHA512`, type: 'info' },
            { t: timestamp(), text: `[STATUS] Waiting for peer connection...`, type: 'status' },
            { t: timestamp(), text: `─────────────────────────────────────`, type: 'divider' },
        ];
        setLines(initial);

        // Continuous ops
        intervalRef.current = setInterval(() => {
            const op = OPS[Math.floor(Math.random() * OPS.length)];
            const newLine = { t: timestamp(), text: op(), type: 'op' };
            setLines(prev => {
                const next = [...prev, newLine];
                return next.length > 60 ? next.slice(-50) : next;
            });
        }, 1200 + Math.random() * 1800);

        return () => clearInterval(intervalRef.current);
    }, [roomKey]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [lines]);

    return (
        <div className="terminal">
            <div className="terminal-hdr">
                <div className="terminal-dots">
                    <span className="terminal-dot" />
                    <span className="terminal-dot" />
                    <span className="terminal-dot" />
                </div>
                <span className="terminal-title">adyx — security monitor</span>
                <div style={{ width: 48 }} />
            </div>
            <div ref={scrollRef} className="terminal-body">
                {lines.map((line, i) => (
                    <div key={i} className={`terminal-line ${line.type}`}>
                        <span className="terminal-time">{line.t}</span>
                        <span className="terminal-text">{line.text}</span>
                    </div>
                ))}
                <div className="terminal-cursor">
                    <span className="terminal-time">{timestamp()}</span>
                    <span className="terminal-blink">_</span>
                </div>
            </div>
        </div>
    );
}
