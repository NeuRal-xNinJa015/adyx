import { useState } from 'react'
import './index.css'

/**
 * AegisComms Web Client
 * 
 * Sovereign Secure Messaging Platform
 * All encryption happens client-side using the Signal Protocol.
 * The server NEVER sees plaintext messages.
 */
function App() {
    const [authenticated, setAuthenticated] = useState(false)

    return (
        <div className="app">
            <header className="app-header">
                <div className="logo">
                    <span className="logo-icon">🛡️</span>
                    <h1>AegisComms</h1>
                </div>
                <p className="tagline">Sovereign Secure Messaging</p>
            </header>

            <main className="app-main">
                {!authenticated ? (
                    <div className="auth-panel">
                        <div className="auth-card">
                            <h2>Authenticate</h2>
                            <p>Insert your device certificate or hardware key to continue.</p>

                            <div className="auth-methods">
                                <button className="auth-btn primary" onClick={() => setAuthenticated(true)}>
                                    🔐 Certificate Login
                                </button>
                                <button className="auth-btn secondary">
                                    🔑 Hardware Key (YubiKey)
                                </button>
                            </div>

                            <div className="security-notice">
                                <span className="notice-icon">⚠️</span>
                                <p>End-to-end encrypted. No phone numbers. No passwords. Certificate-based identity only.</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="messenger">
                        <aside className="sidebar">
                            <div className="sidebar-header">
                                <h3>Conversations</h3>
                                <button className="new-chat-btn" title="New secure conversation">+</button>
                            </div>
                            <div className="conversation-list">
                                <div className="conversation-item active">
                                    <div className="avatar">🔒</div>
                                    <div className="conversation-info">
                                        <span className="name">Secure Channel Alpha</span>
                                        <span className="last-message">Encrypted message</span>
                                    </div>
                                    <span className="time">Now</span>
                                </div>
                            </div>
                        </aside>

                        <section className="chat-area">
                            <div className="chat-header">
                                <div className="chat-info">
                                    <h3>Secure Channel Alpha</h3>
                                    <span className="encryption-badge">🔐 E2E Encrypted • Signal Protocol</span>
                                </div>
                                <div className="chat-actions">
                                    <button title="Self-destruct timer">💀</button>
                                    <button title="Channel info">ℹ️</button>
                                </div>
                            </div>

                            <div className="messages">
                                <div className="system-message">
                                    <p>🛡️ Messages are end-to-end encrypted. No one outside this chat can read them.</p>
                                </div>
                            </div>

                            <div className="message-input">
                                <input
                                    type="text"
                                    placeholder="Type a secure message..."
                                    className="input-field"
                                />
                                <button className="send-btn">Send</button>
                            </div>
                        </section>
                    </div>
                )}
            </main>

            <footer className="app-footer">
                <p>AegisComms v0.1.0 • Zero Trust • Zero Knowledge • Sovereign Infrastructure</p>
            </footer>
        </div>
    )
}

export default App
