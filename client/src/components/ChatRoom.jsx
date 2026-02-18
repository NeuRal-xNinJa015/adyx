import { useState, useEffect, useRef, useCallback } from 'react';
import { encrypt, decrypt, encryptBinary, decryptBinary, wipeKeys } from '../lib/crypto';
import { connect, send, disconnect, forceDisconnect, getLatency } from '../lib/socket';
import { initLifecycle, destroyLifecycle } from '../lib/appLifecycle';
import { messageSent, messageReceived, peerJoined as peerJoinedSfx, peerLeft as peerLeftSfx, alertFeedback, panicAlarm, isSoundEnabled, toggleSound } from '../lib/sounds';
import LiveTerminal from './LiveTerminal';
import SecureViewer from './SecureViewer';

const DEAD_MAN_MS = 3 * 60 * 1000;
const DESTRUCT_MS = 5 * 60 * 1000;
const IDLE_LOCK_MS = 2 * 60 * 1000;  // 2 min inactivity → blur
const CLIPBOARD_CLEAR_MS = 30 * 1000; // 30s clipboard auto-clear

const ShieldSvg = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const ClockSvg = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
const LockSvg = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>;
const ZapSvg = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;

const REACTIONS = ['🔥', '✅', '❤️', '👀', '👍', '😂'];

export default function ChatRoom({ roomKey, role, salt, nickname, onLeave }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [peerJoined, setPeerJoined] = useState(false);
    const [peerName, setPeerName] = useState('');
    const [peerTyping, setPeerTyping] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showEnd, setShowEnd] = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [soundOn, setSoundOn] = useState(isSoundEnabled());
    const [deadManWarn, setDeadManWarn] = useState(null);
    const [shielded, setShielded] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [msgCount, setMsgCount] = useState(0);

    // ── NEW STATES ──
    const [idleLocked, setIdleLocked] = useState(false);      // Inactivity lock
    const [latency, setLatency] = useState(null);              // Ping RTT
    const [unread, setUnread] = useState(0);                   // Unread badge count
    const [isAtBottom, setIsAtBottom] = useState(true);        // Scroll position
    const [disappearSecs, setDisappearSecs] = useState(0);     // 0 = off
    const [showReaction, setShowReaction] = useState(null);     // Message ID for reaction picker
    const [reactions, setReactions] = useState({});             // {msgId: emoji}
    const [viewerFile, setViewerFile] = useState(null);         // File open in SecureViewer

    const scrollRef = useRef(null);
    const typingRef = useRef(null);
    const msgIdRef = useRef(0);
    const inputRef = useRef(null);
    const fileRef = useRef(null);
    const blobUrls = useRef([]);
    const alertTimerRef = useRef(null);
    const deadManRef = useRef(null);
    const deadManWarnRef = useRef(null);
    const destructTimers = useRef([]);
    const startTime = useRef(Date.now());
    const idleTimerRef = useRef(null);
    const clipboardTimerRef = useRef(null);

    // ═══════════════════════════════════════════
    // SESSION TIMER
    // ═══════════════════════════════════════════
    useEffect(() => {
        const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
        return () => clearInterval(t);
    }, []);
    const fmtTime = (s) => { const m = Math.floor(s / 60); return `${m}:${(s % 60).toString().padStart(2, '0')}`; };

    // ═══════════════════════════════════════════
    // LATENCY TRACKING
    // ═══════════════════════════════════════════
    useEffect(() => {
        const t = setInterval(() => { const l = getLatency(); if (l !== null) setLatency(l); }, 16000);
        return () => clearInterval(t);
    }, []);

    // ═══════════════════════════════════════════
    // INACTIVITY AUTO-LOCK
    // ═══════════════════════════════════════════
    const resetIdleTimer = useCallback(() => {
        setIdleLocked(false);
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => setIdleLocked(true), IDLE_LOCK_MS);
    }, []);

    useEffect(() => {
        resetIdleTimer();
        const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
        const handler = () => resetIdleTimer();
        events.forEach(e => document.addEventListener(e, handler, { passive: true }));
        return () => {
            clearTimeout(idleTimerRef.current);
            events.forEach(e => document.removeEventListener(e, handler));
        };
    }, [resetIdleTimer]);

    // ═══════════════════════════════════════════
    // DEAD-MAN SWITCH
    // ═══════════════════════════════════════════
    const resetDeadMan = useCallback(() => {
        setDeadManWarn(null);
        if (deadManRef.current) clearTimeout(deadManRef.current);
        if (deadManWarnRef.current) clearTimeout(deadManWarnRef.current);
        deadManWarnRef.current = setTimeout(() => setDeadManWarn(30), DEAD_MAN_MS - 30000);
        deadManRef.current = setTimeout(() => nuke(), DEAD_MAN_MS);
    }, []);
    useEffect(() => { resetDeadMan(); return () => { clearTimeout(deadManRef.current); clearTimeout(deadManWarnRef.current); }; }, [resetDeadMan]);
    useEffect(() => {
        if (deadManWarn === null || deadManWarn <= 0) return;
        const t = setInterval(() => setDeadManWarn(p => p !== null && p > 1 ? p - 1 : 0), 1000);
        return () => clearInterval(t);
    }, [deadManWarn !== null]);

    // ═══════════════════════════════════════════
    // SELF-DESTRUCT SCHEDULING
    // ═══════════════════════════════════════════
    const schedDestruct = useCallback((id, overrideSecs) => {
        const ms = overrideSecs ? overrideSecs * 1000 : DESTRUCT_MS;
        destructTimers.current.push(setTimeout(() => setMessages(p => p.filter(m => m.id !== id)), ms));
    }, []);

    const showAlertCb = useCallback((msg) => {
        setAlertMsg(msg); clearTimeout(alertTimerRef.current);
        alertTimerRef.current = setTimeout(() => setAlertMsg(null), 3500);
    }, []);

    // ═══════════════════════════════════════════
    // SCROLL TRACKING (for unread badge)
    // ═══════════════════════════════════════════
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            setIsAtBottom(atBottom);
            if (atBottom) setUnread(0);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const scrollToBottom = useCallback(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        setUnread(0);
    }, []);

    // ═══════════════════════════════════════════
    // SECURITY LISTENERS
    // ═══════════════════════════════════════════
    useEffect(() => {
        const blockCopy = (e) => { if (e.target === inputRef.current) return; e.preventDefault(); send({ type: 'security_alert', alertType: 'copy_attempt' }); showAlertCb('Copy blocked - peer notified'); alertFeedback(); };
        const blockCtx = (e) => { e.preventDefault(); send({ type: 'security_alert', alertType: 'save_attempt' }); showAlertCb('Right-click blocked'); alertFeedback(); };
        const blockKeys = (e) => {
            const k = e.key?.toLowerCase(); const ctrl = e.ctrlKey || e.metaKey;
            if (e.key === 'PrintScreen') { e.preventDefault(); send({ type: 'security_alert', alertType: 'screenshot_attempt' }); showAlertCb('Screenshot blocked'); setShielded(true); setTimeout(() => setShielded(false), 2000); alertFeedback(); return; }
            if (ctrl && e.shiftKey && k === 's') { e.preventDefault(); showAlertCb('Screenshot blocked'); alertFeedback(); return; }
            if (ctrl && ['c', 's', 'a', 'p'].includes(k)) { if (k === 'c' && e.target === inputRef.current) return; e.preventDefault(); send({ type: 'security_alert', alertType: k === 'p' ? 'screenshot_attempt' : 'copy_attempt' }); alertFeedback(); showAlertCb(k === 'p' ? 'Print blocked' : k === 's' ? 'Save blocked' : 'Copy blocked'); }
            if ((ctrl && e.shiftKey && k === 'i') || e.key === 'F12') { e.preventDefault(); send({ type: 'security_alert', alertType: 'devtools_attempt' }); showAlertCb('DevTools blocked'); alertFeedback(); }
        };
        const blockDrag = (e) => e.preventDefault();
        const onVis = () => { if (document.hidden) { setShielded(true); send({ type: 'security_alert', alertType: 'tab_switch' }); showAlertCb('Tab switch detected'); alertFeedback(); } else setTimeout(() => setShielded(false), 400); };
        const onBlur = () => { setShielded(true); send({ type: 'security_alert', alertType: 'window_blur' }); };
        const onFocus = () => setTimeout(() => setShielded(false), 250);
        document.addEventListener('copy', blockCopy); document.addEventListener('contextmenu', blockCtx);
        document.addEventListener('keydown', blockKeys, true); document.addEventListener('dragstart', blockDrag);
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
        return () => { document.removeEventListener('copy', blockCopy); document.removeEventListener('contextmenu', blockCtx); document.removeEventListener('keydown', blockKeys, true); document.removeEventListener('dragstart', blockDrag); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); };
    }, [showAlertCb]);

    const peerLabel = useCallback((type) => {
        const m = { copy_attempt: 'copied', screenshot_attempt: 'screenshotted', save_attempt: 'saved', tab_switch: 'left tab', devtools_attempt: 'opened devtools', window_blur: 'left window' };
        return `${peerName || 'Peer'} ${m[type] || 'triggered alert'}`;
    }, [peerName]);

    // ═══════════════════════════════════════════
    // MESSAGE HANDLER
    // ═══════════════════════════════════════════
    const handleMessage = useCallback(async (msg) => {
        resetDeadMan();
        switch (msg.type) {
            case 'peer_joined':
                setPeerJoined(true); setPeerName(msg.nickname || 'Peer');
                setMessages(p => [...p, { id: Date.now(), sys: true, text: `${msg.nickname || 'Peer'} connected` }]);
                peerJoinedSfx(); break;
            case 'peer_left':
                setPeerJoined(false);
                setMessages(p => [...p, { id: Date.now(), sys: true, text: `${msg.nickname || peerName || 'Peer'} disconnected` }]);
                peerLeftSfx(); break;
            case 'encrypted_message':
                try {
                    const text = await decrypt(msg.ciphertext, msg.iv, roomKey, salt, msg.hmac, msg.nonce);
                    const id = msg.id;
                    const expMs = disappearSecs > 0 ? disappearSecs * 1000 : DESTRUCT_MS;
                    setMessages(p => [...p, { id, text, from: 'peer', time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), exp: Date.now() + expMs }]);
                    send({ type: 'read_receipt', id }); messageReceived(); schedDestruct(id, disappearSecs || null); setMsgCount(c => c + 1);
                    if (!isAtBottom) setUnread(u => u + 1);
                } catch { } break;
            case 'encrypted_image':
                try {
                    const buf = await decryptBinary(msg.ciphertext, msg.iv, roomKey, salt, msg.hmac, msg.nonce);
                    const blob = new Blob([buf], { type: msg.fileType || 'image/png' });
                    const url = URL.createObjectURL(blob); blobUrls.current.push(url);
                    const id = msg.id;
                    const expMs = disappearSecs > 0 ? disappearSecs * 1000 : DESTRUCT_MS;
                    setMessages(p => [...p, { id, image: url, fileName: msg.fileName, fileType: msg.fileType, fileSize: msg.fileSize, from: 'peer', time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), exp: Date.now() + expMs }]);
                    send({ type: 'read_receipt', id }); messageReceived(); schedDestruct(id, disappearSecs || null); setMsgCount(c => c + 1);
                    if (!isAtBottom) setUnread(u => u + 1);
                } catch { } break;
            case 'encrypted_file':
                try {
                    const fb = await decryptBinary(msg.ciphertext, msg.iv, roomKey, salt, msg.hmac, msg.nonce);
                    const fBlob = new Blob([fb], { type: msg.fileType || 'application/octet-stream' });
                    const fUrl = URL.createObjectURL(fBlob); blobUrls.current.push(fUrl);
                    const id = msg.id;
                    const expMs = disappearSecs > 0 ? disappearSecs * 1000 : DESTRUCT_MS;
                    setMessages(p => [...p, { id, file: fUrl, fileName: msg.fileName, fileSize: msg.fileSize, fileType: msg.fileType || 'application/octet-stream', from: 'peer', time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), exp: Date.now() + expMs }]);
                    send({ type: 'read_receipt', id }); messageReceived(); schedDestruct(id, disappearSecs || null); setMsgCount(c => c + 1);
                    if (!isAtBottom) setUnread(u => u + 1);
                } catch { } break;
            case 'delivery_ack': setMessages(p => p.map(m => m.id === msg.id ? { ...m, status: 'delivered' } : m)); break;
            case 'read_receipt': setMessages(p => p.map(m => m.id === msg.id ? { ...m, status: 'seen' } : m)); break;
            case 'security_alert': showAlertCb(peerLabel(msg.alertType)); alertFeedback(); break;
            case 'typing': setPeerTyping(msg.isTyping); break;
            case 'reaction':
                setReactions(prev => ({ ...prev, [msg.msgId]: msg.emoji }));
                break;
            case 'disappear_mode':
                setDisappearSecs(msg.seconds);
                setMessages(p => [...p, { id: Date.now(), sys: true, text: msg.seconds > 0 ? `Disappearing messages: ${msg.seconds}s` : 'Disappearing messages OFF' }]);
                break;
            case 'room_end': nukeLocal(); onLeave(); break;
        }
    }, [roomKey, salt, peerLabel, onLeave, peerName, resetDeadMan, schedDestruct, showAlertCb, disappearSecs, isAtBottom]);

    useEffect(() => { connect(roomKey, role, nickname, handleMessage); return () => disconnect(); }, [roomKey, role, nickname, handleMessage]);
    useEffect(() => { if (isAtBottom) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, peerTyping]);

    function nukeLocal() { setViewerFile(null); destructTimers.current.forEach(t => clearTimeout(t)); blobUrls.current.forEach(u => URL.revokeObjectURL(u)); blobUrls.current = []; setMessages([]); wipeKeys(); }
    function nuke() { try { send({ type: 'room_end' }); } catch { } nukeLocal(); forceDisconnect(); onLeave(); }

    const destroyRef = useRef(null);
    destroyRef.current = nuke;
    useEffect(() => { initLifecycle(() => destroyRef.current?.(), () => destroyRef.current?.()); return () => destroyLifecycle(); }, []);

    // ═══════════════════════════════════════════
    // SEND MESSAGE
    // ═══════════════════════════════════════════
    const sendMsg = async () => {
        const txt = input.trim(); if (!txt) return;
        setInput(''); resetDeadMan(); resetIdleTimer();
        const id = ++msgIdRef.current;
        const { ciphertext, iv, hmac, nonce } = await encrypt(txt, roomKey, salt);
        send({ type: 'encrypted_message', ciphertext, iv, hmac, nonce, id });
        const expMs = disappearSecs > 0 ? disappearSecs * 1000 : DESTRUCT_MS;
        setMessages(p => [...p, { id, text: txt, from: 'self', status: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), exp: Date.now() + expMs }]);
        send({ type: 'typing', isTyping: false }); messageSent(); schedDestruct(id, disappearSecs || null); setMsgCount(c => c + 1);
        inputRef.current?.focus();
    };

    // ═══════════════════════════════════════════
    // FILE HANDLER
    // ═══════════════════════════════════════════
    const handleFile = async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        e.target.value = ''; resetDeadMan(); resetIdleTimer();
        if (file.size > 8 * 1024 * 1024) { setMessages(p => [...p, { id: Date.now(), sys: true, text: 'File too large (max 8MB)' }]); return; }
        setUploading(true);
        const id = ++msgIdRef.current;
        try {
            const ab = await file.arrayBuffer();
            const { ciphertext, iv, hmac, nonce } = await encryptBinary(ab, roomKey, salt);
            const isImg = file.type.startsWith('image/');
            const expMs = disappearSecs > 0 ? disappearSecs * 1000 : DESTRUCT_MS;
            if (isImg) {
                const blob = new Blob([ab], { type: file.type }); const url = URL.createObjectURL(blob); blobUrls.current.push(url);
                send({ type: 'encrypted_image', ciphertext, iv, hmac, nonce, id, fileName: file.name, fileType: file.type, fileSize: file.size });
                setMessages(p => [...p, { id, image: url, fileName: file.name, from: 'self', status: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), exp: Date.now() + expMs }]);
            } else {
                const fBlob = new Blob([ab], { type: file.type }); const fUrl = URL.createObjectURL(fBlob); blobUrls.current.push(fUrl);
                send({ type: 'encrypted_file', ciphertext, iv, hmac, nonce, id, fileName: file.name, fileType: file.type, fileSize: file.size });
                setMessages(p => [...p, { id, file: fUrl, fileName: file.name, fileSize: file.size, fileType: file.type, from: 'self', status: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), exp: Date.now() + expMs }]);
            }
            messageSent(); schedDestruct(id, disappearSecs || null); setMsgCount(c => c + 1);
        } catch { setMessages(p => [...p, { id: Date.now(), sys: true, text: 'Encryption failed' }]); }
        setUploading(false);
    };

    // ═══════════════════════════════════════════
    // CLIPBOARD AUTO-CLEAR
    // ═══════════════════════════════════════════
    const copyKey = () => {
        navigator.clipboard.writeText(roomKey);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
        clearTimeout(clipboardTimerRef.current);
        clipboardTimerRef.current = setTimeout(() => {
            try { navigator.clipboard.writeText(''); } catch { }
        }, CLIPBOARD_CLEAR_MS);
    };

    // ═══════════════════════════════════════════
    // REACTIONS
    // ═══════════════════════════════════════════
    const sendReaction = (msgId, emoji) => {
        send({ type: 'reaction', msgId: String(msgId), emoji });
        setReactions(prev => ({ ...prev, [msgId]: emoji }));
        setShowReaction(null);
    };

    // ═══════════════════════════════════════════
    // DISAPPEARING MODE TOGGLE
    // ═══════════════════════════════════════════
    const cycleDisappear = () => {
        if (role !== 'admin') return;
        const options = [0, 30, 60, 300];
        const next = options[(options.indexOf(disappearSecs) + 1) % options.length];
        send({ type: 'disappear_mode', seconds: next });
    };

    const handleInput = (e) => { setInput(e.target.value); resetDeadMan(); resetIdleTimer(); send({ type: 'typing', isTyping: true }); clearTimeout(typingRef.current); typingRef.current = setTimeout(() => send({ type: 'typing', isTyping: false }), 2000); };
    const endSession = () => { send({ type: 'room_end' }); nukeLocal(); disconnect(); onLeave(); };
    const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
    const statusTxt = (m) => { if (m.from !== 'self') return null; return m.status === 'seen' ? 'Seen' : m.status === 'delivered' ? 'Delivered' : 'Sent'; };
    const latencyColor = latency === null ? '#555' : latency < 100 ? '#4ade80' : latency < 300 ? '#fbbf24' : '#f87171';
    const disappearLabel = disappearSecs === 0 ? 'OFF' : disappearSecs < 60 ? `${disappearSecs}s` : `${disappearSecs / 60}m`;

    const Timer = ({ exp }) => {
        const [rem, setRem] = useState(Math.max(0, Math.floor((exp - Date.now()) / 1000)));
        useEffect(() => { const t = setInterval(() => setRem(Math.max(0, Math.floor((exp - Date.now()) / 1000))), 1000); return () => clearInterval(t); }, [exp]);
        if (rem <= 0) return null;
        const total = disappearSecs > 0 ? disappearSecs : DESTRUCT_MS / 1000;
        const pct = Math.max(0, (rem / total) * 100);
        const m = Math.floor(rem / 60), s = rem % 60;
        return (<div className="destruct"><span>{m}:{s.toString().padStart(2, '0')}</span><div className="destruct-bar"><div className="destruct-fill" style={{ width: `${pct}%` }} /></div></div>);
    };

    // ═══════════════════════════════════════════
    // WATERMARK — anti-screenshot deterrent
    // ═══════════════════════════════════════════
    const watermarkText = `${roomKey} · ${new Date().toISOString().slice(0, 16)} · ${nickname}`;

    return (
        <div className="page no-select">
            {/* Inactivity lock overlay */}
            {idleLocked && (
                <div className="idle-lock" onClick={() => { setIdleLocked(false); resetIdleTimer(); }}>
                    <div className="idle-lock-inner">
                        <LockSvg />
                        <span>Session locked — tap to unlock</span>
                    </div>
                </div>
            )}

            {shielded && <div className="shield"><div className="shield-text">CONTENT PROTECTED</div></div>}
            {alertMsg && <div className="alert-bar"><span className="alert-icon">!</span><span>{alertMsg}</span></div>}
            {deadManWarn !== null && deadManWarn > 0 && (
                <div className="alert-bar warning-bar" style={{ top: alertMsg ? '40px' : '0' }}>
                    <span className="alert-icon">!</span>
                    <span>Dead-man switch: session wipes in {deadManWarn}s - interact to reset</span>
                </div>
            )}

            {/* Watermark overlay */}
            <div className="watermark" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                    <span key={i} className="watermark-line" style={{ top: `${15 + i * 15}%` }}>{watermarkText}</span>
                ))}
            </div>

            {/* Header */}
            <header className="chat-hdr fade-1">
                <div className="chat-hdr-left">
                    <span className="brand">Adyx</span>
                    <span className="brand-dot" />
                    <span className="conn-dot" style={{ background: latencyColor }} title={latency !== null ? `${latency}ms` : 'Measuring...'} />
                    <span className={`status-dot ${peerJoined ? 'on' : ''}`} />
                    <span className="status-label">{peerJoined ? peerName : 'Waiting...'}</span>
                </div>
                <div className="chat-hdr-right">
                    <span className="hdr-chip"><ShieldSvg /> AES-256</span>
                    <span className="hdr-chip"><ClockSvg /> {fmtTime(elapsed)}</span>
                    <span className="hdr-chip"><LockSvg /> {msgCount}</span>
                    <button onClick={cycleDisappear} className={`hdr-chip disappear-chip ${disappearSecs > 0 ? 'active' : ''}`} title={role === 'admin' ? 'Toggle disappearing messages' : 'Only admin can change'}>
                        <ClockSvg /> {disappearLabel}
                    </button>
                    <button onClick={() => setSoundOn(toggleSound())} className="sound-btn">{soundOn ? 'SND' : 'MUTE'}</button>
                    <button onClick={copyKey} className="key-tag">{roomKey}{copied && <span className="key-copied">OK</span>}</button>
                    <button onClick={nuke} className="panic-btn">PANIC</button>
                    <button onClick={() => setShowEnd(true)} className="end-btn">END</button>
                </div>
            </header>

            {/* End Modal */}
            {showEnd && (
                <div className="modal-bg" onClick={() => setShowEnd(false)}>
                    <div className="modal-box fade-1" onClick={e => e.stopPropagation()}>
                        <div className="modal-warn-tag">Warning</div>
                        <h3 className="modal-title">End Session?</h3>
                        <p className="modal-desc">All messages, files, and keys will be permanently destroyed on both sides. This cannot be undone.</p>
                        <div className="modal-btns">
                            <button onClick={() => setShowEnd(false)} className="modal-cancel">Cancel</button>
                            <button onClick={endSession} className="modal-confirm">Destroy</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Body */}
            <div ref={scrollRef} className="chat-scroll">
                <div className="chat-body">
                    {/* ─── WAITING STATE ─── */}
                    {!peerJoined && (
                        <div className="wait-split fade-2">
                            <div className="wait-info">
                                {role === 'admin' && (
                                    <>
                                        <div className="wait-tag">Share This Key</div>
                                        <div className="wait-key">
                                            {roomKey.split('').map((c, i) => <span key={i} className="wait-char" style={{ animationDelay: `${i * 0.06}s` }}>{c}</span>)}
                                        </div>
                                        <button onClick={copyKey} className="btn-ghost">{copied ? 'Copied' : 'Copy Key'}</button>
                                        <p className="wait-sub">Share this key with your contact to establish an encrypted link.</p>
                                    </>
                                )}
                                {role === 'receiver' && (
                                    <>
                                        <div className="wait-tag">Connecting</div>
                                        <p className="wait-sub">Establishing encrypted session...</p>
                                    </>
                                )}
                                <div className="wait-features">
                                    <span className="wait-feature"><ShieldSvg /> E2E</span>
                                    <span className="wait-feature"><ClockSvg /> Self-Destruct</span>
                                    <span className="wait-feature"><LockSvg /> Zero Storage</span>
                                    <span className="wait-feature"><ZapSvg /> Forward Secrecy</span>
                                </div>
                                <div className="wait-dots"><span /><span /><span /><span className="wait-label">Waiting for peer</span></div>
                            </div>
                            {role === 'admin' && (
                                <div className="wait-terminal">
                                    <LiveTerminal roomKey={roomKey} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── MESSAGES ─── */}
                    {messages.map(msg => {
                        if (msg.sys) return <div key={msg.id} className="msg-sys"><span className="msg-sys-text">{msg.text}</span></div>;
                        return (
                            <div key={msg.id} className={`msg-row ${msg.from === 'self' ? 'msg-self' : 'msg-peer'}`}>
                                {msg.from === 'peer' && <div className="msg-bar" />}
                                <div className="msg-bubble" onDoubleClick={() => setShowReaction(showReaction === msg.id ? null : msg.id)}>
                                    <div className="msg-who">{msg.from === 'self' ? nickname : peerName}</div>
                                    {msg.image && <div className="msg-img-wrap" onClick={() => setViewerFile({ url: msg.image, name: msg.fileName || 'image', type: 'image/png', size: msg.fileSize })}><img src={msg.image} alt="" className="msg-img" /><div className="msg-img-shield" /><div className="msg-img-open">TAP TO VIEW</div></div>}
                                    {msg.file && !msg.image && <div className="msg-file msg-file-clickable" onClick={() => setViewerFile({ url: msg.file, name: msg.fileName, type: msg.fileType || 'application/octet-stream', size: msg.fileSize })}><span className="msg-file-icon">📄</span><div className="msg-file-info"><div className="msg-file-name">{msg.fileName}</div>{msg.fileSize && <div className="msg-file-size">{fmtSize(msg.fileSize)}</div>}</div><span className="msg-file-open">OPEN</span></div>}
                                    {msg.text && <p className="msg-text">{msg.text}</p>}
                                    <div className="msg-meta"><span>{msg.time}</span>{statusTxt(msg) && <span className="msg-status">{statusTxt(msg)}</span>}</div>
                                    {msg.exp && <Timer exp={msg.exp} />}
                                    {reactions[msg.id] && <div className="msg-reaction">{reactions[msg.id]}</div>}
                                    {showReaction === msg.id && (
                                        <div className="reaction-picker">
                                            {REACTIONS.map(em => <button key={em} className="reaction-btn" onClick={(e) => { e.stopPropagation(); sendReaction(msg.id, em); }}>{em}</button>)}
                                        </div>
                                    )}
                                </div>
                                {msg.from === 'self' && <div className="msg-bar" />}
                            </div>
                        );
                    })}
                    {peerTyping && <div className="msg-row msg-peer"><div className="msg-bar" /><div className="msg-bubble"><div className="msg-who">{peerName}</div><div className="typing-dots"><span /><span /><span /></div></div></div>}
                </div>
            </div>

            {/* Unread badge */}
            {unread > 0 && (
                <button className="unread-badge" onClick={scrollToBottom}>
                    ↓ {unread} new message{unread > 1 ? 's' : ''}
                </button>
            )}

            {/* Input */}
            <div className="chat-input-area fade-2">
                <div className="compose">
                    <button onClick={() => fileRef.current?.click()} disabled={!peerJoined || uploading} className="compose-attach">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                    </button>
                    <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.zip" onChange={handleFile} className="hidden" />
                    <textarea ref={inputRef} value={input} onChange={handleInput} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder={peerJoined ? (uploading ? 'Encrypting...' : 'Type a message...') : 'Waiting for peer...'} disabled={!peerJoined} rows={1} className="compose-text" />
                    <button onClick={sendMsg} disabled={!input.trim() || !peerJoined} className="compose-send">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>
                    </button>
                </div>
                <div className="compose-info">
                    <span>AES-256-GCM</span><span className="compose-sep" /><span>{disappearSecs > 0 ? `Vanish ${disappearLabel}` : 'Self-Destruct 5m'}</span><span className="compose-sep" /><span>Zero Storage</span>
                </div>
            </div>
            {/* Secure Viewer */}
            {viewerFile && <SecureViewer file={viewerFile} onClose={() => setViewerFile(null)} />}
        </div>
    );
}
