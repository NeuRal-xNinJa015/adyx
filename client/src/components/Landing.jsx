import { useState, useRef, useEffect } from 'react';

export default function Landing({ onCreateRoom, onJoinRoom }) {
    const [view, setView] = useState('home');
    const [joinKey, setJoinKey] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const inputRefs = useRef([]);
    const nameRef = useRef(null);

    useEffect(() => {
        if (view === 'join') setTimeout(() => inputRefs.current[0]?.focus(), 150);
        if (view === 'create') setTimeout(() => nameRef.current?.focus(), 150);
    }, [view]);

    const handleCreate = async () => {
        const name = displayName.trim();
        if (!name) { setError('Enter a display name'); return; }
        setLoading(true); setError('');
        try { await onCreateRoom(name); } catch (err) { setError(err.message); setLoading(false); }
    };

    const handleJoin = async (key) => {
        const name = displayName.trim();
        if (!name) { setError('Enter a display name'); return; }
        const k = key || joinKey;
        if (k.length < 6) { setError('Enter all 6 characters'); return; }
        setLoading(true); setError('');
        try { await onJoinRoom(k.toUpperCase(), name); } catch (err) { setError(err.message || 'Room not found'); setLoading(false); }
    };

    const handleKeyInput = (index, value) => {
        const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!char) return;
        const arr = joinKey.split('');
        arr[index] = char[0];
        const updated = arr.join('').slice(0, 6);
        setJoinKey(updated);
        setError('');
        if (index < 5 && char) inputRefs.current[index + 1]?.focus();
        if (index === 5 && updated.length === 6 && displayName.trim()) setTimeout(() => handleJoin(updated), 250);
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            const arr = joinKey.split('');
            if (arr[index]) { arr[index] = ''; setJoinKey(arr.join('')); }
            else if (index > 0) { arr[index - 1] = ''; setJoinKey(arr.join('')); inputRefs.current[index - 1]?.focus(); }
        }
        if (e.key === 'Enter') handleJoin();
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        setJoinKey(pasted);
        if (pasted.length === 6) { inputRefs.current[5]?.focus(); }
        else inputRefs.current[pasted.length]?.focus();
    };

    const resetTo = (target) => { setView(target); setError(''); setJoinKey(''); setDisplayName(''); };

    return (
        <div className="cinema-page">
            <div className="page-grain" />

            {/* Nav */}
            <nav className="cinema-nav fade-in-d1">
                <div className="nav-left">
                    <span className="brand">Adyx</span>
                    <span className="brand-sep" />
                    <span className="brand-tag">Secure</span>
                </div>
                <div className="nav-right">
                    <span className="nav-pill">AES-256</span>
                    <span className="nav-pill">E2E</span>
                </div>
            </nav>

            {/* Main */}
            <main className="cinema-main">

                {/* HOME */}
                {view === 'home' && (
                    <div className="home-layout">
                        <div className="home-hero fade-in-d2">
                            <div className="hero-eyebrow">
                                <span className="eyebrow-line" />
                                <span>Private Messaging</span>
                            </div>
                            <h1 className="hero-heading">
                                Conversations<br />
                                that leave<br />
                                <span className="hero-heading-em">no trace.</span>
                            </h1>
                            <p className="hero-body">
                                End-to-end encrypted. Zero data stored.<br />
                                One key. Two people. Nothing else.
                            </p>
                        </div>

                        <div className="home-actions fade-in-d3">
                            <button onClick={() => setView('create')} className="cinema-card">
                                <div className="card-header">
                                    <span className="card-idx">01</span>
                                    <span className="card-arrow">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                    </span>
                                </div>
                                <h3 className="card-title">Create Room</h3>
                                <p className="card-desc">Generate a unique encryption key and share it with someone you trust.</p>
                                <div className="card-accent" />
                            </button>

                            <button onClick={() => setView('join')} className="cinema-card">
                                <div className="card-header">
                                    <span className="card-idx">02</span>
                                    <span className="card-arrow">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                    </span>
                                </div>
                                <h3 className="card-title">Join Room</h3>
                                <p className="card-desc">Enter a 6-character key to connect to an existing encrypted session.</p>
                                <div className="card-accent" />
                            </button>
                        </div>
                    </div>
                )}

                {/* CREATE */}
                {view === 'create' && (
                    <div className="flow-layout fade-in-d2">
                        <button onClick={() => resetTo('home')} className="back-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                            <span>Back</span>
                        </button>
                        <div className="flow-header">
                            <span className="flow-tag">Admin</span>
                            <h2 className="flow-title">Create a Room</h2>
                            <p className="flow-desc">Choose a display name for this session. No accounts, no history.</p>
                        </div>

                        {/* Name input */}
                        <div className="name-input-wrap">
                            <label className="name-label">Display Name</label>
                            <input
                                ref={nameRef}
                                type="text"
                                value={displayName}
                                onChange={(e) => { setDisplayName(e.target.value.slice(0, 20)); setError(''); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                                placeholder="Enter any name..."
                                className="name-input"
                                maxLength={20}
                                autoComplete="off"
                            />
                            <span className="name-hint">Temporary. Deleted when conversation ends.</span>
                        </div>

                        <button onClick={handleCreate} disabled={loading} className="cinema-btn">
                            {loading ? 'Generating...' : 'Generate Key'}
                        </button>
                        {error && <p className="flow-error">{error}</p>}
                    </div>
                )}

                {/* JOIN */}
                {view === 'join' && (
                    <div className="flow-layout fade-in-d2">
                        <button onClick={() => resetTo('home')} className="back-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                            <span>Back</span>
                        </button>
                        <div className="flow-header">
                            <span className="flow-tag">Receiver</span>
                            <h2 className="flow-title">Join a Room</h2>
                            <p className="flow-desc">Choose a display name, then enter the 6-character key.</p>
                        </div>

                        {/* Name input */}
                        <div className="name-input-wrap">
                            <label className="name-label">Display Name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => { setDisplayName(e.target.value.slice(0, 20)); setError(''); }}
                                placeholder="Enter any name..."
                                className="name-input"
                                maxLength={20}
                                autoComplete="off"
                            />
                            <span className="name-hint">Temporary. Deleted when conversation ends.</span>
                        </div>

                        {/* Room key */}
                        <label className="name-label" style={{ marginBottom: 10 }}>Room Key</label>
                        <div className="key-grid">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <input
                                    key={i}
                                    ref={(el) => (inputRefs.current[i] = el)}
                                    type="text"
                                    inputMode="text"
                                    maxLength={1}
                                    value={joinKey[i] || ''}
                                    onChange={(e) => handleKeyInput(i, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(i, e)}
                                    onPaste={i === 0 ? handlePaste : undefined}
                                    className={`key-input ${joinKey[i] ? 'has-val' : ''}`}
                                    autoComplete="off"
                                />
                            ))}
                        </div>

                        <button onClick={() => handleJoin()} disabled={loading || joinKey.length < 6 || !displayName.trim()} className="cinema-btn">
                            {loading ? 'Connecting...' : 'Join Room'}
                        </button>
                        {error && <p className="flow-error">{error}</p>}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="cinema-footer fade-in-d4">
                <div className="footer-left">
                    <span className="footer-name">Adyx</span>
                    <span className="footer-by">Engineered by Aditya</span>
                </div>
                <div className="footer-right">
                    <span className="footer-pill">Zero Knowledge</span>
                    <span className="footer-pill">Copy Protected</span>
                </div>
            </footer>
        </div>
    );
}
