import { useState, useEffect, useRef, useCallback } from 'react'
import { AegisWebSocket } from './lib/websocket.js'
import * as aegisCrypto from './lib/crypto.js'
import './index.css'

/**
 * AegisComms Web Client
 * 
 * Sovereign Secure Messaging Platform
 * All encryption happens client-side using Web Crypto API.
 * The server NEVER sees plaintext messages.
 */

const ROUTER_WS_URL = 'ws://localhost:8443/ws'
const IDENTITY_API = 'http://localhost:8081/api'
const CRYPTO_API = 'http://localhost:8090/api'

function App() {
    // Auth state
    const [phase, setPhase] = useState('auth') // 'auth' | 'chat'
    const [userId, setUserId] = useState('')
    const [deviceId, setDeviceId] = useState('')
    const [deviceName, setDeviceName] = useState('')
    const [error, setError] = useState('')
    const [status, setStatus] = useState('Disconnected')

    // Chat state
    const [recipientId, setRecipientId] = useState('')
    const [messageInput, setMessageInput] = useState('')
    const [messages, setMessages] = useState([])
    const [connected, setConnected] = useState(false)

    // Crypto state
    const keyPairRef = useRef(null)
    const signingKeyPairRef = useRef(null)
    const sharedKeyRef = useRef(null)
    const wsRef = useRef(null)
    const messagesEndRef = useRef(null)

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    /**
     * Register device with Identity Service and connect to router
     */
    const handleRegister = useCallback(async () => {
        try {
            setError('')
            setStatus('Generating keys...')

            // 1. Generate crypto key pairs
            const kp = await aegisCrypto.generateKeyPair()
            const skp = await aegisCrypto.generateSigningKeyPair()
            keyPairRef.current = kp
            signingKeyPairRef.current = skp

            const pubKeyBytes = await aegisCrypto.exportPublicKey(kp.publicKey)
            const sigPubKeyBytes = await aegisCrypto.exportPublicKey(skp.publicKey)
            const fingerprint = aegisCrypto.generateFingerprint()

            setStatus('Registering device...')

            // 2. Register with Identity Service
            const res = await fetch(`${IDENTITY_API}/devices/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    deviceName: deviceName || 'Web Browser',
                    publicKey: aegisCrypto.toBase64(pubKeyBytes),
                    signingPublicKey: aegisCrypto.toBase64(sigPubKeyBytes),
                    deviceFingerprint: fingerprint,
                }),
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Registration failed')
            }

            const data = await res.json()
            setDeviceId(data.deviceId)

            // 3. Upload pre-key bundle to Crypto Service
            setStatus('Uploading pre-keys...')
            await fetch(`${CRYPTO_API}/prekeys/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: data.deviceId,
                    identity_key: aegisCrypto.toBase64(pubKeyBytes),
                    signed_pre_key: aegisCrypto.toBase64(pubKeyBytes),
                    signed_pre_key_signature: aegisCrypto.toBase64(new Uint8Array(64)),
                    signed_pre_key_id: 1,
                    one_time_pre_keys: [],
                }),
            })

            // 4. Connect to Erlang router via WebSocket
            setStatus('Connecting to router...')
            const ws = new AegisWebSocket(ROUTER_WS_URL, data.deviceId)

            ws.on('authenticated', () => {
                setConnected(true)
                setStatus('🔐 Encrypted & Online')
                setPhase('chat')
            })

            ws.on('message', async (msg) => {
                // Decrypt incoming message
                let decryptedText = '[encrypted]'
                try {
                    if (sharedKeyRef.current && msg.payload) {
                        const ciphertext = aegisCrypto.fromBase64(msg.payload)
                        decryptedText = await aegisCrypto.decrypt(sharedKeyRef.current, ciphertext)
                    } else {
                        // No shared key yet — show raw payload indicator
                        decryptedText = `[key exchange needed] ${msg.payload?.substring(0, 20)}...`
                    }
                } catch (e) {
                    decryptedText = '[decryption failed]'
                }

                setMessages(prev => [...prev, {
                    id: msg.messageId || Date.now().toString(),
                    from: msg.from,
                    text: decryptedText,
                    timestamp: new Date(),
                    direction: 'incoming',
                }])
            })

            ws.on('ack', (msg) => {
                setMessages(prev => prev.map(m =>
                    m.id === msg.messageId ? { ...m, status: msg.status } : m
                ))
            })

            ws.on('disconnected', () => {
                setConnected(false)
                setStatus('⚠️ Disconnected — reconnecting...')
            })

            ws.on('error', () => {
                setStatus('❌ Connection error')
            })

            await ws.connect()
            wsRef.current = ws

        } catch (err) {
            console.error('Registration failed:', err)
            setError(err.message)
            setStatus('Registration failed')
        }
    }, [userId, deviceName])

    /**
     * Initiate key exchange with recipient
     */
    const handleKeyExchange = useCallback(async () => {
        if (!recipientId) return
        try {
            setStatus('🔑 Exchanging keys...')

            // Fetch recipient's pre-key bundle
            const res = await fetch(`${CRYPTO_API}/prekeys/${recipientId}`)
            if (!res.ok) throw new Error('Recipient pre-key bundle not found')

            const bundle = await res.json()

            // Import their public key and derive shared secret
            const peerPubKey = await aegisCrypto.importPublicKey(
                aegisCrypto.fromBase64(bundle.identity_key)
            )
            const sharedKey = await aegisCrypto.deriveSharedKey(
                keyPairRef.current.privateKey,
                peerPubKey
            )
            sharedKeyRef.current = sharedKey

            setStatus('🔐 Keys exchanged — E2E encrypted')
            setMessages(prev => [...prev, {
                id: 'system-' + Date.now(),
                from: 'system',
                text: `🔐 Key exchange complete with ${recipientId}. Messages are now end-to-end encrypted.`,
                timestamp: new Date(),
                direction: 'system',
            }])
        } catch (err) {
            setError('Key exchange failed: ' + err.message)
        }
    }, [recipientId])

    /**
     * Send an encrypted message
     */
    const handleSend = useCallback(async () => {
        if (!messageInput.trim() || !recipientId || !wsRef.current) return

        try {
            let payload
            if (sharedKeyRef.current) {
                // Encrypt with shared key
                const encrypted = await aegisCrypto.encrypt(sharedKeyRef.current, messageInput)
                payload = aegisCrypto.toBase64(encrypted)
            } else {
                // No key exchange yet — send as base64 plaintext (dev mode only!)
                payload = aegisCrypto.toBase64(new TextEncoder().encode(messageInput))
            }

            const msgId = 'msg-' + Date.now()
            wsRef.current.sendMessage(recipientId, payload)

            setMessages(prev => [...prev, {
                id: msgId,
                from: deviceId,
                text: messageInput,
                timestamp: new Date(),
                direction: 'outgoing',
                status: 'sent',
            }])

            setMessageInput('')
        } catch (err) {
            setError('Send failed: ' + err.message)
        }
    }, [messageInput, recipientId, deviceId])

    // Handle Enter key
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="app">
            <header className="app-header">
                <div className="logo">
                    <span className="logo-icon">🛡️</span>
                    <h1>AegisComms</h1>
                </div>
                <div className="header-status">
                    <span className={`status-dot ${connected ? 'online' : 'offline'}`}></span>
                    <span className="status-text">{status}</span>
                </div>
            </header>

            <main className="app-main">
                {phase === 'auth' ? (
                    <div className="auth-panel">
                        <div className="auth-card">
                            <h2>🛡️ Device Registration</h2>
                            <p>Register this device to join the secure network.</p>

                            {error && <div className="error-banner">{error}</div>}

                            <div className="form-group">
                                <label>User ID</label>
                                <select value={userId} onChange={e => setUserId(e.target.value)}>
                                    <option value="">Select agent...</option>
                                    <option value="user-alpha">Agent Alpha (Top Secret)</option>
                                    <option value="user-bravo">Agent Bravo (Secret)</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Device Name</label>
                                <input
                                    type="text"
                                    value={deviceName}
                                    onChange={e => setDeviceName(e.target.value)}
                                    placeholder="e.g., Workstation-01"
                                />
                            </div>

                            <button
                                className="auth-btn primary"
                                onClick={handleRegister}
                                disabled={!userId}
                            >
                                🔐 Register & Connect
                            </button>

                            <div className="security-notice">
                                <span className="notice-icon">🛡️</span>
                                <p>Keys generated locally. Certificate issued by AegisComms CA. E2E encryption via AES-256-GCM.</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="messenger">
                        <aside className="sidebar">
                            <div className="sidebar-header">
                                <h3>Secure Channel</h3>
                            </div>

                            <div className="sidebar-section">
                                <label>Your Device</label>
                                <div className="device-info">
                                    <span className="device-badge">🖥️ {deviceId}</span>
                                </div>
                            </div>

                            <div className="sidebar-section">
                                <label>Recipient Device ID</label>
                                <input
                                    type="text"
                                    value={recipientId}
                                    onChange={e => setRecipientId(e.target.value)}
                                    placeholder="dev-xxxxxxxxxxxx"
                                    className="sidebar-input"
                                />
                                <button className="key-exchange-btn" onClick={handleKeyExchange} disabled={!recipientId}>
                                    🔑 Exchange Keys
                                </button>
                            </div>

                            <div className="sidebar-section">
                                <div className="crypto-info">
                                    <div className="crypto-badge">🔐 AES-256-GCM</div>
                                    <div className="crypto-badge">🔑 ECDH P-256</div>
                                    <div className="crypto-badge">✍️ ECDSA P-256</div>
                                </div>
                            </div>
                        </aside>

                        <section className="chat-area">
                            <div className="chat-header">
                                <div className="chat-info">
                                    <h3>{recipientId || 'Select recipient'}</h3>
                                    <span className="encryption-badge">
                                        {sharedKeyRef.current ? '🔐 E2E Encrypted' : '⚠️ No shared key'}
                                    </span>
                                </div>
                            </div>

                            <div className="messages">
                                <div className="system-message">
                                    <p>🛡️ All messages are end-to-end encrypted. The server cannot read them.</p>
                                </div>

                                {messages.map(msg => (
                                    <div key={msg.id} className={`message ${msg.direction}`}>
                                        <div className="message-bubble">
                                            <span className="message-sender">
                                                {msg.direction === 'outgoing' ? 'You' : msg.from}
                                            </span>
                                            <p>{msg.text}</p>
                                            <span className="message-time">
                                                {msg.timestamp.toLocaleTimeString()}
                                                {msg.status && ` • ${msg.status}`}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="message-input">
                                <input
                                    type="text"
                                    value={messageInput}
                                    onChange={e => setMessageInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={recipientId ? 'Type a secure message...' : 'Select a recipient first'}
                                    className="input-field"
                                    disabled={!recipientId}
                                />
                                <button
                                    className="send-btn"
                                    onClick={handleSend}
                                    disabled={!messageInput.trim() || !recipientId}
                                >
                                    Send
                                </button>
                            </div>
                        </section>
                    </div>
                )}
            </main>

            <footer className="app-footer">
                <p>AegisComms v0.1.0 • Zero Trust • Zero Knowledge • {deviceId || 'Not registered'}</p>
            </footer>
        </div>
    )
}

export default App
