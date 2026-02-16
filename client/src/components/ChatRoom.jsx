import { useState, useEffect, useRef, useCallback } from 'react';
import { encrypt, decrypt, encryptBinary, decryptBinary } from '../lib/crypto';
import { connect, send, disconnect } from '../lib/socket';

export default function ChatRoom({ roomKey, role, salt, nickname, onLeave }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [peerJoined, setPeerJoined] = useState(false);
    const [peerName, setPeerName] = useState('');
    const [peerTyping, setPeerTyping] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showEnd, setShowEnd] = useState(false);
    const [securityAlert, setSecurityAlert] = useState(null);
    const [uploadingFile, setUploadingFile] = useState(false);

    const scrollRef = useRef(null);
    const typingTimer = useRef(null);
    const msgId = useRef(0);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const blobUrls = useRef([]);
    const alertTimer = useRef(null);

    // ═══ SECURITY ═══
    useEffect(() => {
        const blockCopy = (e) => { e.preventDefault(); send({ type: 'security_alert', alertType: 'copy_attempt' }); };
        const blockCtx = (e) => { e.preventDefault(); send({ type: 'security_alert', alertType: 'save_attempt' }); };
        const blockKeys = (e) => {
            if (
                (e.ctrlKey && ['c', 's', 'a', 'p'].includes(e.key.toLowerCase())) ||
                (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') ||
                e.key === 'PrintScreen'
            ) {
                if (e.key.toLowerCase() === 'c' && e.target === inputRef.current) return;
                e.preventDefault();
                const t = e.key === 'PrintScreen' ? 'screenshot_attempt' : e.key.toLowerCase() === 's' ? 'save_attempt' : e.key.toLowerCase() === 'p' ? 'screenshot_attempt' : 'copy_attempt';
                send({ type: 'security_alert', alertType: t });
            }
        };
        const blockDrag = (e) => e.preventDefault();
        const onVis = () => { if (document.hidden) send({ type: 'security_alert', alertType: 'tab_switch' }); };

        document.addEventListener('copy', blockCopy);
        document.addEventListener('contextmenu', blockCtx);
        document.addEventListener('keydown', blockKeys);
        document.addEventListener('dragstart', blockDrag);
        document.addEventListener('visibilitychange', onVis);
        return () => {
            document.removeEventListener('copy', blockCopy);
            document.removeEventListener('contextmenu', blockCtx);
            document.removeEventListener('keydown', blockKeys);
            document.removeEventListener('dragstart', blockDrag);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    const showAlert = useCallback((alertType) => {
        const labels = {
            copy_attempt: `${peerName || 'Peer'} attempted to copy`,
            screenshot_attempt: `${peerName || 'Peer'} attempted screenshot`,
            save_attempt: `${peerName || 'Peer'} attempted to save`,
            tab_switch: `${peerName || 'Peer'} switched tabs`,
        };
        setSecurityAlert(labels[alertType] || 'Security event');
        clearTimeout(alertTimer.current);
        alertTimer.current = setTimeout(() => setSecurityAlert(null), 4000);
    }, [peerName]);

    const handleMessage = useCallback(async (msg) => {
        switch (msg.type) {
            case 'peer_joined':
                setPeerJoined(true);
                setPeerName(msg.nickname || 'Peer');
                setMessages((p) => [...p, { id: Date.now(), system: true, text: `${msg.nickname || 'Peer'} joined the session` }]);
                break;
            case 'peer_left':
                setPeerJoined(false);
                setMessages((p) => [...p, { id: Date.now(), system: true, text: `${msg.nickname || peerName || 'Peer'} disconnected` }]);
                break;
            case 'encrypted_message':
                try {
                    const text = await decrypt(msg.ciphertext, msg.iv, roomKey, salt);
                    setMessages((p) => [...p, { id: msg.id, text, from: 'peer', time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                    send({ type: 'read_receipt', id: msg.id });
                } catch { }
                break;
            case 'encrypted_image':
                try {
                    const buf = await decryptBinary(msg.ciphertext, msg.iv, roomKey, salt);
                    const blob = new Blob([buf], { type: msg.fileType || 'image/png' });
                    const url = URL.createObjectURL(blob);
                    blobUrls.current.push(url);
                    setMessages((p) => [...p, { id: msg.id, image: url, fileName: msg.fileName, from: 'peer', time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                    send({ type: 'read_receipt', id: msg.id });
                } catch { }
                break;
            case 'encrypted_file':
                try {
                    const fb = await decryptBinary(msg.ciphertext, msg.iv, roomKey, salt);
                    const fBlob = new Blob([fb], { type: msg.fileType || 'application/octet-stream' });
                    const fUrl = URL.createObjectURL(fBlob);
                    blobUrls.current.push(fUrl);
                    setMessages((p) => [...p, { id: msg.id, file: fUrl, fileName: msg.fileName, fileSize: msg.fileSize, fileType: msg.fileType, from: 'peer', time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                    send({ type: 'read_receipt', id: msg.id });
                } catch { }
                break;
            case 'delivery_ack':
                setMessages((p) => p.map((m) => m.id === msg.id ? { ...m, status: 'delivered', deliveredAt: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : m));
                break;
            case 'read_receipt':
                setMessages((p) => p.map((m) => m.id === msg.id ? { ...m, status: 'seen', seenAt: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : m));
                break;
            case 'security_alert':
                showAlert(msg.alertType);
                break;
            case 'typing':
                setPeerTyping(msg.isTyping);
                break;
            case 'room_end':
                blobUrls.current.forEach((u) => URL.revokeObjectURL(u));
                blobUrls.current = [];
                setMessages([]);
                disconnect();
                onLeave();
                break;
        }
    }, [roomKey, salt, showAlert, onLeave, peerName]);

    useEffect(() => { connect(roomKey, role, nickname, handleMessage); return () => disconnect(); }, [roomKey, role, nickname, handleMessage]);
    useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, peerTyping]);

    const sendMessage = async () => {
        const text = input.trim();
        if (!text) return;
        setInput('');
        const id = ++msgId.current;
        const { ciphertext, iv } = await encrypt(text, roomKey, salt);
        send({ type: 'encrypted_message', ciphertext, iv, id });
        setMessages((p) => [...p, { id, text, from: 'self', status: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        send({ type: 'typing', isTyping: false });
        inputRef.current?.focus();
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        if (file.size > 8 * 1024 * 1024) { setMessages((p) => [...p, { id: Date.now(), system: true, text: 'File too large. Max 8MB.' }]); return; }
        setUploadingFile(true);
        const id = ++msgId.current;
        try {
            const ab = await file.arrayBuffer();
            const { ciphertext, iv } = await encryptBinary(ab, roomKey, salt);
            const isImg = file.type.startsWith('image/');
            if (isImg) {
                const blob = new Blob([ab], { type: file.type });
                const url = URL.createObjectURL(blob);
                blobUrls.current.push(url);
                send({ type: 'encrypted_image', ciphertext, iv, id, fileName: file.name, fileType: file.type, fileSize: file.size });
                setMessages((p) => [...p, { id, image: url, fileName: file.name, from: 'self', status: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            } else {
                send({ type: 'encrypted_file', ciphertext, iv, id, fileName: file.name, fileType: file.type, fileSize: file.size });
                setMessages((p) => [...p, { id, file: true, fileName: file.name, fileSize: file.size, fileType: file.type, from: 'self', status: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            }
        } catch { setMessages((p) => [...p, { id: Date.now(), system: true, text: 'Encryption failed' }]); }
        setUploadingFile(false);
    };

    const handleInput = (e) => {
        setInput(e.target.value);
        send({ type: 'typing', isTyping: true });
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => send({ type: 'typing', isTyping: false }), 2000);
    };

    const copyKey = () => { navigator.clipboard.writeText(roomKey); setCopied(true); setTimeout(() => setCopied(false), 2000); };

    const endConversation = () => {
        send({ type: 'room_end' });
        blobUrls.current.forEach((url) => URL.revokeObjectURL(url));
        blobUrls.current = [];
        setMessages([]);
        disconnect();
        onLeave();
    };

    const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
    const statusLabel = (m) => { if (m.from !== 'self') return null; if (m.status === 'seen') return 'Seen'; if (m.status === 'delivered') return 'Delivered'; return 'Sent'; };

    return (
        <div className="cinema-page no-select">
            <div className="page-grain" />

            {/* Security alert */}
            {securityAlert && (
                <div className="alert-bar">
                    <span className="alert-icon">!</span>
                    <span>{securityAlert}</span>
                </div>
            )}

            {/* Header */}
            <header className="chat-hdr fade-in-d1">
                <div className="chat-hdr-left">
                    <span className="brand">Adyx</span>
                    <span className="brand-sep" />
                    <div className="chat-status">
                        <span className={`status-dot ${peerJoined ? 'on' : ''}`} />
                        <span className="status-text">{peerJoined ? `${peerName} connected` : 'Waiting'}</span>
                    </div>
                </div>
                <div className="chat-hdr-right">
                    <span className="chat-nickname">{nickname}</span>
                    <button onClick={copyKey} className="key-badge">
                        {roomKey}{copied && <span className="key-ok">OK</span>}
                    </button>
                    <button onClick={() => setShowEnd(true)} className="end-btn">End</button>
                </div>
            </header>

            {/* End modal */}
            {showEnd && (
                <div className="modal-bg" onClick={() => setShowEnd(false)}>
                    <div className="modal-card fade-in-d1" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-tag">Warning</div>
                        <h3 className="modal-title">End this conversation?</h3>
                        <p className="modal-desc">All messages, files, names, and encryption keys will be permanently destroyed on both sides. Nothing is recoverable.</p>
                        <div className="modal-actions">
                            <button onClick={() => setShowEnd(false)} className="modal-cancel">Cancel</button>
                            <button onClick={endConversation} className="modal-confirm">End Conversation</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="chat-scroll">
                <div className="chat-stream">

                    {role === 'admin' && !peerJoined && (
                        <div className="wait-state fade-in-d2">
                            <div className="wait-tag">Share This Key</div>
                            <div className="wait-key">
                                {roomKey.split('').map((c, i) => (
                                    <span key={i} className="wait-char" style={{ animationDelay: `${i * 0.08}s` }}>{c}</span>
                                ))}
                            </div>
                            <button onClick={copyKey} className="cinema-btn-sm">{copied ? 'Copied' : 'Copy Key'}</button>
                            <div className="wait-dots">
                                <span /><span /><span />
                                <em>Waiting for peer</em>
                            </div>
                        </div>
                    )}

                    {role === 'receiver' && !peerJoined && (
                        <div className="wait-state fade-in-d2">
                            <div className="wait-tag">Connecting</div>
                            <p className="wait-sub">Setting up encrypted session...</p>
                            <div className="wait-dots"><span /><span /><span /></div>
                        </div>
                    )}

                    {messages.map((msg) => {
                        if (msg.system) {
                            return (
                                <div key={msg.id} className="msg-sys">
                                    <span className="msg-sys-text">{msg.text}</span>
                                </div>
                            );
                        }

                        if (msg.from === 'self') {
                            return (
                                <div key={msg.id} className="msg-row msg-self">
                                    <div className="msg-bubble">
                                        <div className="msg-who">{nickname}</div>
                                        {msg.image && (
                                            <div className="msg-img-wrap"><img src={msg.image} alt="" className="msg-img" /><div className="msg-img-shield" /></div>
                                        )}
                                        {msg.file && !msg.image && (
                                            <div className="msg-file">
                                                <span className="msg-file-icon">DOC</span>
                                                <div className="msg-file-info"><div className="msg-file-name">{msg.fileName}</div><div className="msg-file-size">{fmtSize(msg.fileSize)}</div></div>
                                            </div>
                                        )}
                                        {msg.text && <p className="msg-text">{msg.text}</p>}
                                        <div className="msg-meta">
                                            <span>{msg.time}</span>
                                            {statusLabel(msg) && <span className="msg-status">{statusLabel(msg)}</span>}
                                        </div>
                                    </div>
                                    <div className="msg-bar-self" />
                                </div>
                            );
                        }

                        return (
                            <div key={msg.id} className="msg-row msg-peer">
                                <div className="msg-bar-peer" />
                                <div className="msg-bubble">
                                    <div className="msg-who">{peerName}</div>
                                    {msg.image && (
                                        <div className="msg-img-wrap"><img src={msg.image} alt="" className="msg-img" /><div className="msg-img-shield" /></div>
                                    )}
                                    {msg.file && !msg.image && (
                                        <div className="msg-file">
                                            <span className="msg-file-icon">DOC</span>
                                            <div className="msg-file-info"><div className="msg-file-name">{msg.fileName}</div><div className="msg-file-size">{fmtSize(msg.fileSize)}</div></div>
                                        </div>
                                    )}
                                    {msg.text && <p className="msg-text">{msg.text}</p>}
                                    <div className="msg-meta"><span>{msg.time}</span></div>
                                </div>
                            </div>
                        );
                    })}

                    {peerTyping && (
                        <div className="msg-row msg-peer">
                            <div className="msg-bar-peer" />
                            <div className="msg-bubble">
                                <div className="msg-who">{peerName}</div>
                                <div className="typing-dots"><span /><span /><span /></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Input */}
            <div className="chat-input-area fade-in-d2">
                <div className="chat-compose">
                    <button onClick={() => fileInputRef.current?.click()} disabled={!peerJoined || uploadingFile} className="compose-attach" title="Attach file">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.zip" onChange={handleFileUpload} className="hidden" />
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInput}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                        placeholder={peerJoined ? (uploadingFile ? 'Encrypting...' : 'Type a message...') : 'Waiting for peer...'}
                        disabled={!peerJoined}
                        rows={1}
                        className="compose-input"
                    />
                    <button onClick={sendMessage} disabled={!input.trim() || !peerJoined} className="compose-send">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>
                    </button>
                </div>
                <div className="compose-hint">
                    <span>AES-256-GCM</span>
                    <span className="compose-hint-sep" />
                    <span>Max 8MB</span>
                    <span className="compose-hint-sep" />
                    <span>Zero Storage</span>
                </div>
            </div>
        </div>
    );
}
