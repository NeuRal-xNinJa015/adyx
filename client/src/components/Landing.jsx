import { useState, useRef, useEffect } from 'react';
import { buttonHover, roomCreated, errorSound } from '../lib/sounds';

/* SVG icons */
const ShieldIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
const LockIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>);
const ZapIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>);
const ClockIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);
const EyeOffIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>);
const BinIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>);
const ArrowIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>);
const BackIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>);
const KeyIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>);

/* Animated counter */
function Counter({ end, duration = 1500, suffix = '' }) {
    const [val, setVal] = useState(0);
    const ref = useRef(null);
    useEffect(() => {
        const start = performance.now();
        function tick(now) {
            const p = Math.min((now - start) / duration, 1);
            setVal(Math.floor((1 - Math.pow(1 - p, 3)) * end));
            if (p < 1) ref.current = requestAnimationFrame(tick);
        }
        ref.current = requestAnimationFrame(tick);
        return () => { if (ref.current) cancelAnimationFrame(ref.current); };
    }, [end, duration]);
    return <span>{val.toLocaleString()}{suffix}</span>;
}

export default function Landing({ onCreateRoom, onJoinRoom }) {
    const [view, setView] = useState('home');
    const [joinKey, setJoinKey] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [joinPassword, setJoinPassword] = useState('');
    const [needsPassword, setNeedsPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const inputRefs = useRef([]);
    const nameRef = useRef(null);
    const passRef = useRef(null);

    useEffect(() => {
        if (view === 'join') setTimeout(() => inputRefs.current[0]?.focus(), 120);
        if (view === 'create') setTimeout(() => nameRef.current?.focus(), 120);
    }, [view]);

    const handleCreate = async () => {
        const n = name.trim();
        if (!n) { setError('Enter a display name'); errorSound(); return; }
        setLoading(true); setError('');
        try { await onCreateRoom(n, password.trim() || null); roomCreated(); }
        catch (err) { setError(err.message); errorSound(); setLoading(false); }
    };

    const handleJoin = async (key) => {
        const n = name.trim();
        if (!n) { setError('Enter a display name'); errorSound(); return; }
        const k = key || joinKey;
        if (k.length < 6) { setError('Enter all 6 characters'); errorSound(); return; }
        setLoading(true); setError('');
        try { await onJoinRoom(k.toUpperCase(), n, joinPassword.trim() || null); }
        catch (err) {
            if (err.message === 'Password required.' || err.needsPassword) {
                setNeedsPassword(true);
                setError('This room requires a password');
                setLoading(false);
                setTimeout(() => passRef.current?.focus(), 100);
                return;
            }
            setError(err.message || 'Room not found'); errorSound(); setLoading(false);
        }
    };

    const onKeyInput = (i, val) => {
        const ch = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!ch) return;
        const arr = joinKey.split('');
        arr[i] = ch[0];
        const updated = arr.join('').slice(0, 6);
        setJoinKey(updated); setError('');
        if (i < 5) inputRefs.current[i + 1]?.focus();
        if (i === 5 && updated.length === 6 && name.trim() && !needsPassword) setTimeout(() => handleJoin(updated), 200);
    };

    const onKeyDown = (i, e) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            const arr = joinKey.split('');
            if (arr[i]) { arr[i] = ''; setJoinKey(arr.join('')); }
            else if (i > 0) { arr[i - 1] = ''; setJoinKey(arr.join('')); inputRefs.current[i - 1]?.focus(); }
        }
        if (e.key === 'Enter') handleJoin();
    };

    const onPaste = (e) => {
        e.preventDefault();
        const p = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        setJoinKey(p);
        if (p.length === 6) inputRefs.current[5]?.focus();
        else inputRefs.current[p.length]?.focus();
    };

    const goTo = (v) => { setView(v); setError(''); setJoinKey(''); setName(''); setPassword(''); setJoinPassword(''); setNeedsPassword(false); };

    return (
        <div className="page">
            {/* NAV */}
            <nav className="nav fade-1">
                <div className="nav-left">
                    <span className="brand">Adyx</span>
                    <span className="brand-dot" />
                    <span className="brand-label">Encrypted</span>
                </div>
                <div className="nav-right">
                    <span className="nav-tag">AES-256</span>
                    <span className="nav-tag">E2E</span>
                    <span className="nav-tag pulse-tag">LIVE</span>
                </div>
            </nav>

            <main className="main">
                {/* ─── HOME ─── */}
                {view === 'home' && (
                    <div className="home-split fade-2">
                        {/* Left: Hero + Features */}
                        <div className="home-left">
                            <div className="hero-label">
                                <span className="hero-label-line" />
                                <span>Encrypted Communication</span>
                            </div>
                            <h1 className="hero-h1">
                                Conversations<br />that leave<br /><em>no trace.</em>
                            </h1>
                            <p className="hero-p">
                                Military-grade E2E encryption. Zero server storage.
                                Self-destructing sessions. Built for privacy.
                            </p>
                            <div className="stats-strip">
                                <div className="stat-chip"><span className="stat-val mono"><Counter end={256} /></span><span className="stat-lbl">BIT</span></div>
                                <div className="stat-chip"><span className="stat-val mono"><Counter end={600} suffix="K" /></span><span className="stat-lbl">ITER</span></div>
                                <div className="stat-chip"><span className="stat-val mono"><Counter end={0} /></span><span className="stat-lbl">STORED</span></div>
                            </div>
                            <div className="feature-strip">
                                <div className="feature-pill"><ShieldIcon /><span>AES-256-GCM</span></div>
                                <div className="feature-pill"><LockIcon /><span>Zero Knowledge</span></div>
                                <div className="feature-pill"><ClockIcon /><span>Self-Destruct</span></div>
                                <div className="feature-pill"><ZapIcon /><span>Panic Button</span></div>
                                <div className="feature-pill"><EyeOffIcon /><span>Anti-Surveillance</span></div>
                                <div className="feature-pill"><BinIcon /><span>Anti-Forensics</span></div>
                            </div>
                        </div>

                        {/* Right: Action Cards */}
                        <div className="home-right">
                            <div className="card-stack">
                                <button onClick={() => { goTo('create'); buttonHover(); }} className="action-card">
                                    <div className="ac-top">
                                        <span className="ac-num mono">01</span>
                                        <span className="ac-arrow"><ArrowIcon /></span>
                                    </div>
                                    <h3 className="ac-title">Create Room</h3>
                                    <p className="ac-desc">Generate a unique encryption key and start a private session. Share the key with your contact.</p>
                                    <div className="ac-footer">
                                        <span className="ac-tag">New Session</span>
                                        <span className="ac-tag">6-Char Key</span>
                                        <span className="ac-tag">Password Lock</span>
                                    </div>
                                    <div className="ac-line" />
                                </button>

                                <button onClick={() => { goTo('join'); buttonHover(); }} className="action-card">
                                    <div className="ac-top">
                                        <span className="ac-num mono">02</span>
                                        <span className="ac-arrow"><ArrowIcon /></span>
                                    </div>
                                    <h3 className="ac-title">Join Room</h3>
                                    <p className="ac-desc">Enter the 6-character access key shared by the room creator to connect instantly.</p>
                                    <div className="ac-footer">
                                        <span className="ac-tag">Enter Key</span>
                                        <span className="ac-tag">Instant Connect</span>
                                    </div>
                                    <div className="ac-line" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── CREATE ─── */}
                {view === 'create' && (
                    <div className="flow-panel fade-2">
                        <button onClick={() => goTo('home')} className="back-btn"><BackIcon /> Back</button>
                        <div className="flow-icon-wrap"><ShieldIcon /></div>
                        <span className="flow-badge">Create</span>
                        <h2 className="flow-title">New Secure Room</h2>
                        <p className="flow-desc">Choose a display name. Optionally set a room password for extra security.</p>
                        <div className="input-group">
                            <label className="input-label">Display Name</label>
                            <input ref={nameRef} type="text" value={name} onChange={(e) => { setName(e.target.value.slice(0, 20)); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} placeholder="Enter your name..." className="text-input" maxLength={20} autoComplete="off" />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Room Password <span className="label-opt">(optional)</span></label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value.slice(0, 128))} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} placeholder="Leave empty for no password" className="text-input" maxLength={128} autoComplete="new-password" />
                        </div>
                        <button onClick={handleCreate} disabled={loading} className="btn-primary">{loading ? 'Generating...' : 'Generate Key'}</button>
                        {error && <p className="flow-err">{error}</p>}
                        <div className="flow-trust">
                            <span className="trust-item"><ShieldIcon /> E2E Encrypted</span>
                            <span className="trust-item"><ClockIcon /> Self-Destruct</span>
                            <span className="trust-item"><KeyIcon /> Password Lock</span>
                        </div>
                    </div>
                )}

                {/* ─── JOIN ─── */}
                {view === 'join' && (
                    <div className="flow-panel fade-2">
                        <button onClick={() => goTo('home')} className="back-btn"><BackIcon /> Back</button>
                        <div className="flow-icon-wrap"><LockIcon /></div>
                        <span className="flow-badge">Join</span>
                        <h2 className="flow-title">Enter Access Key</h2>
                        <p className="flow-desc">Enter your name and the 6-character room key.</p>
                        <div className="input-group">
                            <label className="input-label">Display Name</label>
                            <input type="text" value={name} onChange={(e) => { setName(e.target.value.slice(0, 20)); setError(''); }} placeholder="Enter your name..." className="text-input" maxLength={20} autoComplete="off" />
                        </div>
                        <label className="input-label" style={{ marginBottom: 8, alignSelf: 'flex-start' }}>Access Key</label>
                        <div className="key-grid">
                            {[0, 1, 2, 3, 4, 5].map(i => (
                                <input key={i} ref={el => inputRefs.current[i] = el} type="text" inputMode="text" maxLength={1} value={joinKey[i] || ''} onChange={(e) => onKeyInput(i, e.target.value)} onKeyDown={(e) => onKeyDown(i, e)} onPaste={i === 0 ? onPaste : undefined} className={`key-cell ${joinKey[i] ? 'filled' : ''}`} autoComplete="off" />
                            ))}
                        </div>
                        {needsPassword && (
                            <div className="input-group" style={{ marginTop: 8 }}>
                                <label className="input-label"><KeyIcon /> Room Password</label>
                                <input ref={passRef} type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value.slice(0, 128))} onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }} placeholder="Enter room password..." className="text-input" maxLength={128} autoComplete="off" />
                            </div>
                        )}
                        <button onClick={() => handleJoin()} disabled={loading || joinKey.length < 6 || !name.trim()} className="btn-primary">{loading ? 'Connecting...' : 'Join Room'}</button>
                        {error && <p className="flow-err">{error}</p>}
                        <div className="flow-trust">
                            <span className="trust-item"><LockIcon /> Encrypted Link</span>
                            <span className="trust-item"><ClockIcon /> Auto-Destruct</span>
                            <span className="trust-item"><ZapIcon /> Instant Connect</span>
                        </div>
                    </div>
                )}
            </main>

            <footer className="foot fade-4">
                <div className="foot-left">
                    <span className="foot-brand">Adyx</span>
                    <span className="foot-by">by Aditya</span>
                </div>
                <div className="foot-right">
                    <span className="foot-tag">v3.0</span>
                    <span className="foot-tag">Zero Knowledge</span>
                </div>
            </footer>
        </div>
    );
}
