import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Shield, Clock, LogOut, User, Lock, Zap, Wifi, WifiOff } from 'lucide-react'
import * as ws from '../lib/ws'
import FileUploadButton from './FileUploadButton.jsx'
import MediaMessage from './MediaMessage.jsx'

export default function ChatScreen({ roomCode, isCreator, onEndSession }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [peerConnected, setPeerConnected] = useState(true)
    const [wsConnected, setWsConnected] = useState(true)
    const [encrypted, setEncrypted] = useState(false)
    const [peerTyping, setPeerTyping] = useState(false)
    const [elapsed, setElapsed] = useState(0)
    const [logs, setLogs] = useState([])
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)
    const lastTypingSentRef = useRef(0)
    const sendingRef = useRef(false)
    const fileKeysRef = useRef(new Map())  // fileId → keyBase64
    const MAX_MESSAGES = 500

    const addLog = useCallback((text) => {
        setLogs(prev => [...prev.slice(-50), {
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            text
        }])
    }, [])

    const addSystemMessage = useCallback((text) => {
        setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            type: 'system',
            text,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        }])
    }, [])

    // WebSocket listeners
    useEffect(() => {
        addSystemMessage('Secure session established')
        addLog('E2E session active')
        addLog(`Room: ${roomCode.toUpperCase()}`)
        addLog(`Role: ${isCreator ? 'HOST' : 'GUEST'}`)

        const offMessage = ws.on('message', (msg) => {
            setMessages(prev => [...prev, {
                id: Date.now() + Math.random(),
                type: 'received',
                text: msg.payload,
                sender: msg.deviceId?.slice(0, 8) || 'Peer',
                encrypted: msg.encrypted || false,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            }])
            addLog(`MSG IN ${msg.encrypted ? '[E2E]' : '[PLAIN]'} ${msg.deviceId?.slice(0, 8) || 'peer'}`)
            setPeerTyping(false)
        })

        // Also cap received messages
        const offMessage2 = ws.on('message', () => {
            setMessages(prev => prev.length > MAX_MESSAGES ? prev.slice(prev.length - MAX_MESSAGES) : prev)
        })

        const offAck = ws.on('ack', (msg) => {
            addLog(`ACK: ${msg.status}`)
            // Update message delivery status
            if (msg.status === 'delivered') {
                setMessages(prev => prev.map(m =>
                    m.messageId === msg.messageId ? { ...m, delivered: true } : m
                ))
            }
        })

        const offPeerLeft = ws.on('peer_left', () => {
            setPeerConnected(false)
            setPeerTyping(false)
            addSystemMessage('Peer disconnected')
            addLog('PEER_LEFT')
        })

        const offDisconnected = ws.on('disconnected', () => {
            setWsConnected(false)
            addSystemMessage('Connection lost — reconnecting...')
            addLog('WS disconnected')
        })

        const offConnected = ws.on('connected', () => {
            setWsConnected(true)
            addLog('WS reconnected')
        })

        const offEncReady = ws.on('encryption_ready', () => {
            setEncrypted(true)
            addSystemMessage('End-to-end encryption activated')
            addLog('E2E: ECDH P-256 + AES-256-GCM [OK]')
        })

        const offTyping = ws.on('typing', () => {
            setPeerTyping(true)
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000)
        })

        // ── File Events ──

        // Intercept file key messages (sent as encrypted messages with isFileKey flag)
        const offFileKeyMsg = ws.on('message', (msg) => {
            if (!msg.payload) return
            try {
                const parsed = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : null
                if (parsed && parsed.type === 'file_key') {
                    fileKeysRef.current.set(parsed.fileId, parsed.keyBase64)
                    addLog(`FILE KEY ← ${parsed.fileId.slice(0, 8)}`)
                }
            } catch (_) {
                // Not a file key message — ignore
            }
        })

        // When a file is ready from peer
        const offFileReady = ws.on('file_ready', async (msg) => {
            addLog(`FILE ← ${msg.displayCategory} from ${msg.deviceId?.slice(0, 8)}`)
            addSystemMessage('Encrypted file received')

            // Request download
            try {
                const chunks = await ws.requestFile(msg.fileId, roomCode, msg.totalChunks)
                const keyBase64 = fileKeysRef.current.get(msg.fileId)

                setMessages(prev => [...prev, {
                    id: Date.now() + Math.random(),
                    type: 'received',
                    isFile: true,
                    fileData: {
                        fileId: msg.fileId,
                        chunks,
                        totalChunks: msg.totalChunks,
                        iv: msg.iv,
                        hash: msg.hash,
                        keyBase64: keyBase64 || '',
                        encryptedMetadata: msg.encryptedMetadata,
                        thumbnail: msg.thumbnail,
                        ephemeral: msg.ephemeral,
                        displayCategory: msg.displayCategory,
                    },
                    sender: msg.deviceId?.slice(0, 8) || 'Peer',
                    encrypted: true,
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                }])
            } catch (err) {
                console.error('[Chat] File download failed:', err)
                addLog('FILE download FAILED')
            }
        })

        // When a file is deleted
        const offFileDeleted = ws.on('file_deleted', (msg) => {
            addLog(`FILE DELETED: ${msg.fileId.slice(0, 8)}`)
        })

        return () => {
            offMessage(); offMessage2(); offAck(); offPeerLeft(); offDisconnected(); offConnected(); offEncReady(); offTyping()
            offFileKeyMsg(); offFileReady(); offFileDeleted()
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        }
    }, [roomCode, isCreator, addLog, addSystemMessage])

    // Timer
    useEffect(() => {
        const t = setInterval(() => setElapsed(prev => prev + 1), 1000)
        return () => clearInterval(t)
    }, [])

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, peerTyping])

    // Focus input
    useEffect(() => { inputRef.current?.focus() }, [])

    // Browser notifications for background tab
    useEffect(() => {
        if (!('Notification' in window)) return
        if (Notification.permission === 'default') {
            Notification.requestPermission()
        }
    }, [])

    const handleSend = async () => {
        const text = input.trim()
        if (!text || sendingRef.current) return
        sendingRef.current = true

        const msgId = crypto.randomUUID().split('-')[0]
        setMessages(prev => {
            const next = [...prev, {
                id: Date.now() + Math.random(),
                messageId: msgId,
                type: 'sent',
                text,
                delivered: false,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            }]
            // Cap at MAX_MESSAGES to prevent memory growth
            return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
        })
        setInput('')

        try {
            await ws.sendMessage(text, roomCode, msgId)
            addLog(`MSG OUT ${encrypted ? '[E2E]' : '[PLAIN]'} peer`)
        } catch (err) {
            console.error('[Chat] Send failed:', err)
            addLog('MSG → FAILED')
        } finally {
            sendingRef.current = false
        }

        // Notify if tab is hidden
        try {
            if (document.hidden && Notification.permission === 'granted') {
                new Notification('ADYX', { body: 'New message sent', silent: true })
            }
        } catch (_) { /* ignore notification errors */ }
    }

    // ── File Upload Handler ──
    const handleFileReady = useCallback(async (fileData) => {
        try {
            // Store our own file key
            fileKeysRef.current.set(fileData.fileId, fileData.keyBase64)

            // Add file message to chat locally
            setMessages(prev => [...prev, {
                id: Date.now() + Math.random(),
                type: 'sent',
                isFile: true,
                fileData,
                delivered: false,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            }])

            // Send through WebSocket
            await ws.sendFile(fileData, roomCode)
            addLog(`FILE OUT [E2E] ${fileData.displayCategory}`)

            // Mark as delivered
            setMessages(prev => prev.map(m =>
                m.fileData?.fileId === fileData.fileId ? { ...m, delivered: true } : m
            ))
        } catch (err) {
            console.error('[Chat] File send failed:', err)
            addLog('FILE → FAILED')
        }
    }, [roomCode, addLog])

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleInputChange = (e) => {
        setInput(e.target.value)
        // Send typing indicator (throttled to every 2s)
        const now = Date.now()
        if (now - lastTypingSentRef.current > 2000) {
            ws.sendTyping(roomCode)
            lastTypingSentRef.current = now
        }
    }

    // Auto-link URLs in message text
    const linkifyText = (text) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g
        const parts = text.split(urlRegex)
        return parts.map((part, i) =>
            urlRegex.test(part)
                ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="msg__link">{part}</a>
                : part
        )
    }

    const formatElapsed = (s) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }

    // Check if consecutive messages are from same sender (for grouping)
    const shouldGroup = (msg, prevMsg) => {
        if (!prevMsg) return false
        if (msg.type !== prevMsg.type) return false
        if (msg.type === 'system') return false
        return msg.time === prevMsg.time
    }

    return (
        <motion.div
            className="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Connection lost banner */}
            <AnimatePresence>
                {!wsConnected && (
                    <motion.div
                        className="chat__banner chat__banner--warn"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        <WifiOff size={12} /> Connection lost — attempting to reconnect...
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="chat__header">
                <div className="chat__header-left">
                    <div className="chat__brand-mini">
                        <span className="chat__brand-bracket">[</span>
                        <span className="chat__room-name">ADYX</span>
                        <span className="chat__brand-bracket">]</span>
                    </div>
                    <span className="chat__room-badge chat__room-badge--accent">
                        <Lock size={9} /> {roomCode.toUpperCase()}
                    </span>
                    <span className={`chat__room-badge ${encrypted ? 'chat__room-badge--encrypted' : ''}`}>
                        <Zap size={9} /> {encrypted ? 'E2E ACTIVE' : 'HANDSHAKE...'}
                    </span>
                </div>
                <div className="chat__header-right">
                    <div className="chat__session-time">
                        <Clock size={10} /> {formatElapsed(elapsed)}
                    </div>
                    <div className="chat__status-indicator">
                        <span className={`chat__status-dot ${peerConnected ? 'chat__status-dot--active' : ''}`} />
                        {peerConnected ? 'LIVE' : 'OFFLINE'}
                    </div>
                    <button
                        className="chat__sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        title="Toggle sidebar"
                    >
                        {sidebarOpen ? '◁' : '▷'}
                    </button>
                    <button className="chat__end-btn" onClick={onEndSession}>
                        <LogOut size={10} /> END
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="chat__body">
                {/* Sidebar */}
                <AnimatePresence>
                    {sidebarOpen && (
                        <motion.div
                            className="chat__sidebar"
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 220, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="chat__sidebar-content">
                                <div className="chat__sidebar-section">
                                    <div className="chat__sidebar-title">
                                        <Shield size={10} /> Session Info
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Room</span>
                                        <span className="chat__sidebar-value">{roomCode.toUpperCase()}</span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Role</span>
                                        <span className="chat__sidebar-value">{isCreator ? 'HOST' : 'GUEST'}</span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Peer</span>
                                        <span className="chat__sidebar-value" style={{ color: peerConnected ? 'var(--white-pure)' : 'var(--gray-600)' }}>
                                            {peerConnected ? 'CONNECTED' : 'OFFLINE'}
                                        </span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Duration</span>
                                        <span className="chat__sidebar-value">{formatElapsed(elapsed)}</span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Cipher</span>
                                        <span className="chat__sidebar-value">{encrypted ? 'AES-256-GCM' : 'PENDING'}</span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Key</span>
                                        <span className="chat__sidebar-value">{encrypted ? 'ECDH P-256' : 'PENDING'}</span>
                                    </div>
                                </div>

                                <div className="chat__sidebar-section">
                                    <div className="chat__sidebar-title">
                                        {'>'}_ Protocol Log
                                    </div>
                                    <div className="chat__sidebar-log">
                                        {logs.map((log, i) => (
                                            <div key={i}>
                                                <span className="log-prefix">[{log.time}]</span> {log.text}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Messages column */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="chat__messages">
                        {messages.map((msg, idx) => (
                            <div
                                key={msg.id}
                                className={`msg msg--${msg.type} ${shouldGroup(msg, messages[idx - 1]) ? 'msg--grouped' : ''}`}
                            >
                                {msg.type === 'system' ? (
                                    <div className="msg__bubble">
                                        <Shield size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                        {msg.text}
                                    </div>
                                ) : msg.isFile ? (
                                    <MediaMessage
                                        fileData={msg.fileData}
                                        isSent={msg.type === 'sent'}
                                        sessionId={ws.getStatus().deviceId}
                                        deviceHash=""
                                    />
                                ) : (
                                    <>
                                        <div className="msg__bubble">{linkifyText(msg.text)}</div>
                                        <div className="msg__time">
                                            {msg.type === 'received' && msg.sender && (
                                                <><User size={8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />{msg.sender} · </>
                                            )}
                                            {msg.time}
                                            {msg.type === 'sent' && (
                                                <span className="msg__delivery">
                                                    {msg.delivered ? ' ✓✓' : ' ✓'}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}

                        {/* Typing indicator */}
                        <AnimatePresence>
                            {peerTyping && (
                                <motion.div
                                    className="msg msg--typing"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    <div className="msg__bubble msg__bubble--typing">
                                        <span className="typing-dots">
                                            <span />
                                            <span />
                                            <span />
                                        </span>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input area */}
                    <div className="chat__input-area">
                        {!peerConnected && (
                            <div className="chat__input-hint" style={{ color: 'var(--gray-400)', marginBottom: 6 }}>
                                Peer disconnected — messages won't be delivered
                            </div>
                        )}
                        <div className="chat__input-wrapper">
                            <FileUploadButton
                                onFileReady={handleFileReady}
                                disabled={!peerConnected}
                                roomCode={roomCode}
                            />
                            <input
                                ref={inputRef}
                                type="text"
                                className="chat__input"
                                placeholder={peerConnected ? 'Type a message...' : 'Peer disconnected'}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                disabled={!peerConnected}
                                autoComplete="off"
                            />
                            <button
                                className={`chat__send ${input.trim() && peerConnected ? 'chat__send--active' : ''}`}
                                onClick={handleSend}
                                disabled={!input.trim() || !peerConnected}
                            >
                                <Send size={16} />
                            </button>
                        </div>
                        <div className="chat__input-hint">
                            <Lock size={8} /> ENTER TO SEND · {encrypted ? 'AES-256-GCM ENCRYPTED' : 'ENCRYPTING...'}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
