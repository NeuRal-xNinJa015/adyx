// ADYX WebSocket Service — connects to backend relay
// Protocol: auth → create_room / join_room → key_exchange → encrypted messages

import * as e2e from './crypto.js'

const WS_URL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`

let socket = null
let deviceId = null
let listeners = {}
let reconnectTimer = null
let isConnected = false
let manualDisconnect = false

// Generate a unique device ID per session
function getDeviceId() {
    if (!deviceId) {
        deviceId = 'adyx_' + crypto.randomUUID().split('-')[0]
    }
    return deviceId
}

// Register event listener
export function on(type, callback) {
    if (!listeners[type]) listeners[type] = []
    listeners[type].push(callback)
    return () => {
        listeners[type] = listeners[type].filter(cb => cb !== callback)
    }
}

// Emit to listeners
function emit(type, data) {
    if (listeners[type]) {
        listeners[type].forEach(cb => cb(data))
    }
}

// Send JSON message over WebSocket
function send(msg) {
    try {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msg))
            return true
        }
    } catch (err) {
        console.error('[WS] Send error:', err)
    }
    console.warn('[WS] Not connected, cannot send:', msg.type)
    return false
}

// Connect to the relay server
export function connect() {
    manualDisconnect = false
    return new Promise((resolve, reject) => {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            if (isConnected) {
                resolve()
                return
            }
        }

        try {
            socket = new WebSocket(WS_URL)
        } catch (e) {
            reject(e)
            return
        }

        socket.onopen = () => {
            console.log('[WS] Connected')
            const did = getDeviceId()
            send({ type: 'auth', deviceId: did })
        }

        socket.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data)
                console.log('[WS] ←', msg.type, msg.type === 'message' ? '(encrypted)' : msg)

                if (msg.type === 'auth_ok') {
                    isConnected = true
                    emit('connected', { deviceId: msg.deviceId })
                    resolve()
                    return
                }

                // ── Key Exchange ──
                // When peer joins, both sides initiate key exchange
                if (msg.type === 'peer_joined') {
                    // Generate our key pair and send public key to peer
                    const pubKey = await e2e.generateKeyPair()
                    send({ type: 'key_exchange', publicKey: pubKey, roomCode: msg.roomCode || '' })
                    console.log('[E2E] Key pair generated, public key sent')
                    emit('peer_joined', msg)
                    return
                }

                // When we receive peer's public key, derive shared secret
                if (msg.type === 'key_exchange') {
                    if (!e2e.isReady()) {
                        // We haven't generated our keys yet — do it now
                        const pubKey = await e2e.generateKeyPair()
                        send({ type: 'key_exchange', publicKey: pubKey, roomCode: msg.roomCode || '' })
                        console.log('[E2E] Key pair generated (late), public key sent')
                    }
                    await e2e.deriveSharedKey(msg.publicKey)
                    console.log('[E2E] ✓ Shared key derived — encryption active')
                    emit('encryption_ready', {})
                    return
                }

                // ── Decrypt incoming messages ──
                if (msg.type === 'message') {
                    let plaintext = msg.payload
                    if (msg.encrypted && msg.iv && e2e.isReady()) {
                        try {
                            plaintext = await e2e.decrypt(msg.payload, msg.iv)
                            console.log('[E2E] Message decrypted ✓')
                        } catch (err) {
                            console.error('[E2E] Decryption failed:', err)
                            plaintext = '[Decryption failed]'
                        }
                    }
                    emit('message', { ...msg, payload: plaintext })
                    return
                }

                emit(msg.type, msg)
            } catch (e) {
                console.error('[WS] Parse error:', e)
            }
        }

        socket.onclose = (event) => {
            console.log('[WS] Disconnected', event.code)
            const wasConnected = isConnected
            isConnected = false

            if (wasConnected) {
                emit('disconnected', { code: event.code })
            }

            if (!manualDisconnect && !reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null
                    connect().catch(() => { })
                }, 3000)
            }
        }

        socket.onerror = (error) => {
            console.error('[WS] Error:', error)
            emit('error', { error })
        }

        setTimeout(() => {
            if (!isConnected) {
                reject(new Error('Connection timeout'))
            }
        }, 5000)
    })
}

// Create a new room (host) — raw send (returns true/false)
export function createRoom() {
    return send({ type: 'create_room' })
}

// Create a new room — Promise-based with auto-cleanup
// Resolves with { roomCode } on success, rejects on failure/timeout
export function createRoomAsync(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            reject(new Error('Not connected to server'))
            return
        }

        let timer = null

        const offCreated = on('room_created', (msg) => {
            clearTimeout(timer)
            offCreated()
            offError()
            resolve(msg)
        })

        const offError = on('error', (msg) => {
            clearTimeout(timer)
            offCreated()
            offError()
            reject(new Error(msg.error || 'Failed to create room'))
        })

        timer = setTimeout(() => {
            offCreated()
            offError()
            reject(new Error('Create room timed out'))
        }, timeoutMs)

        const sent = send({ type: 'create_room' })
        if (!sent) {
            clearTimeout(timer)
            offCreated()
            offError()
            reject(new Error('Failed to send create_room — socket not open'))
        }
    })
}

// Join existing room (guest) — raw send
export function joinRoom(roomCode) {
    return send({ type: 'join_room', roomCode })
}

// Join existing room — Promise-based with auto-cleanup
export function joinRoomAsync(roomCode, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            reject(new Error('Not connected to server'))
            return
        }

        let timer = null

        const offJoined = on('room_joined', (msg) => {
            clearTimeout(timer)
            offJoined()
            offError()
            resolve(msg)
        })

        const offError = on('error', (msg) => {
            clearTimeout(timer)
            offJoined()
            offError()
            reject(new Error(msg.error || 'Failed to join room'))
        })

        timer = setTimeout(() => {
            offJoined()
            offError()
            reject(new Error('Join room timed out'))
        }, timeoutMs)

        const sent = send({ type: 'join_room', roomCode })
        if (!sent) {
            clearTimeout(timer)
            offJoined()
            offError()
            reject(new Error('Failed to send join_room — socket not open'))
        }
    })
}

// Send encrypted message to room peer
export async function sendMessage(payload, roomCode, messageId) {
    const msgId = messageId || crypto.randomUUID().split('-')[0]

    // Encrypt if key exchange is complete
    if (e2e.isReady()) {
        try {
            const { ciphertext, iv } = await e2e.encrypt(payload)
            console.log('[E2E] Message encrypted ✓')
            return send({
                type: 'message',
                roomCode,
                payload: ciphertext,
                iv,
                encrypted: true,
                messageId: msgId
            })
        } catch (err) {
            console.error('[E2E] Encryption failed, sending plaintext:', err)
        }
    }

    // Fallback: send plaintext (before key exchange completes)
    return send({
        type: 'message',
        roomCode,
        payload,
        encrypted: false,
        messageId: msgId
    })
}

// Send typing indicator
export function sendTyping(roomCode) {
    return send({ type: 'typing', roomCode })
}

// End session — notifies peer via server
export function endSession(roomCode) {
    return send({ type: 'end_session', roomCode })
}

// Disconnect — closes socket but PRESERVES event listeners
export function disconnect() {
    manualDisconnect = true
    if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
    if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
    }
    isConnected = false
    deviceId = null
    e2e.reset()  // clear crypto state
}

// Full teardown — only call on app unmount
export function destroy() {
    disconnect()
    listeners = {}
}

// Get connection status
export function getStatus() {
    return {
        connected: isConnected,
        deviceId: getDeviceId(),
        encrypted: e2e.isReady()
    }
}

// Check if E2E encryption is active
export function isEncrypted() {
    return e2e.isReady()
}
