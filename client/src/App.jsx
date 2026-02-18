import { useState, useCallback, useEffect, useRef } from 'react';
import Landing from './components/Landing';
import ChatRoom from './components/ChatRoom';
import FloatingElements from './components/FloatingElements';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/* ═══════════════════════════════════════════════════════
   SPLASH — Cinematic B&W — Noir Edition
   ─────────────────────────────────────────────────────
   Particle noise canvas • Glitch text reveal
   Radar ring pulses • Typewriter tagline
   Vertical curtain exit • Pure monochrome drama
   ═══════════════════════════════════════════════════════ */

function Splash({ onDone }) {
    const [phase, setPhase] = useState(0);
    const canvasRef = useRef(null);
    const [typedText, setTypedText] = useState('');
    const tagline = 'ENCRYPTED COMMUNICATION';

    /* ── Particle noise canvas ── */
    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        let raf;
        const particles = [];
        const PARTICLE_COUNT = 80;

        const resize = () => {
            cvs.width = window.innerWidth;
            cvs.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Create particles
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push({
                x: Math.random() * cvs.width,
                y: Math.random() * cvs.height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                size: Math.random() * 1.5 + 0.5,
                opacity: Math.random() * 0.3 + 0.05,
            });
        }

        const draw = () => {
            ctx.clearRect(0, 0, cvs.width, cvs.height);

            // Draw connection lines
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(255,255,255,${0.03 * (1 - dist / 120)})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }

            // Draw particles
            particles.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
                ctx.fill();

                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0) p.x = cvs.width;
                if (p.x > cvs.width) p.x = 0;
                if (p.y < 0) p.y = cvs.height;
                if (p.y > cvs.height) p.y = 0;
            });

            raf = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
        };
    }, []);

    /* ── Typewriter effect ── */
    useEffect(() => {
        if (phase < 4) return;
        let i = 0;
        const iv = setInterval(() => {
            i++;
            setTypedText(tagline.slice(0, i));
            if (i >= tagline.length) clearInterval(iv);
        }, 35);
        return () => clearInterval(iv);
    }, [phase]);

    /* ── Phase timeline ── */
    useEffect(() => {
        const seq = [
            [1, 300],     // rings start pulsing
            [2, 700],     // glitch text begins
            [3, 1500],    // text stabilizes, line draws
            [4, 2100],    // typewriter tagline starts
            [5, 3200],    // credit fades in
            [6, 4200],    // scanline sweep + begin exit
        ];
        const timers = seq.map(([p, d]) => setTimeout(() => setPhase(p), d));
        const done = setTimeout(onDone, 5000);
        return () => { timers.forEach(clearTimeout); clearTimeout(done); };
    }, [onDone]);

    return (
        <div className={`sp2 ${phase >= 6 ? 'sp2-exit' : ''}`}>
            {/* Particle canvas */}
            <canvas ref={canvasRef} className="sp2-canvas" />

            {/* Radar rings */}
            <div className={`sp2-rings ${phase >= 1 ? 'sp2-rings-active' : ''}`}>
                <div className="sp2-ring sp2-ring-1" />
                <div className="sp2-ring sp2-ring-2" />
                <div className="sp2-ring sp2-ring-3" />
            </div>

            {/* Vertical accent lines */}
            <div className="sp2-vline sp2-vline-l" />
            <div className="sp2-vline sp2-vline-r" />

            {/* Corner markers */}
            <div className="sp2-corner sp2-corner-tl" />
            <div className="sp2-corner sp2-corner-tr" />
            <div className="sp2-corner sp2-corner-bl" />
            <div className="sp2-corner sp2-corner-br" />

            {/* Center content */}
            <div className="sp2-center">
                {/* Pre-label */}
                <div className={`sp2-prelabel ${phase >= 2 ? 'sp2-prelabel-in' : ''}`}>
                    <span className="sp2-prelabel-line" />
                    <span>SYSTEM INITIALIZING</span>
                    <span className="sp2-prelabel-line" />
                </div>

                {/* Main title with glitch */}
                <div className={`sp2-title-wrap ${phase >= 2 ? 'sp2-title-glitch' : ''} ${phase >= 3 ? 'sp2-title-stable' : ''}`}>
                    <h1 className="sp2-title" data-text="ADYX">ADYX</h1>
                </div>

                {/* Horizontal line */}
                <div className={`sp2-hline ${phase >= 3 ? 'sp2-hline-in' : ''}`} />

                {/* Typewriter tagline */}
                <div className={`sp2-tagline ${phase >= 4 ? 'sp2-tagline-in' : ''}`}>
                    <span>{typedText}</span>
                    <span className={`sp2-cursor ${phase >= 4 ? 'sp2-cursor-blink' : ''}`}>|</span>
                </div>

                {/* Version badge */}
                <div className={`sp2-version ${phase >= 4 ? 'sp2-version-in' : ''}`}>
                    <span className="sp2-v-dot" />
                    <span>v3.0</span>
                    <span className="sp2-v-sep">•</span>
                    <span>PROTOCOL ACTIVE</span>
                </div>
            </div>

            {/* Bottom credit */}
            <div className={`sp2-credit ${phase >= 5 ? 'sp2-credit-in' : ''}`}>
                <span className="sp2-credit-line" />
                <span>Engineered by Aditya</span>
                <span className="sp2-credit-line" />
            </div>

            {/* Scanline sweep */}
            <div className={`sp2-scanline ${phase >= 6 ? 'sp2-scanline-go' : ''}`} />
        </div>
    );
}

/* ═══════════════════════════
   Main App
   ═══════════════════════════ */
export default function App() {
    const [splash, setSplash] = useState(true);
    const [screen, setScreen] = useState('landing');
    const [roomKey, setRoomKey] = useState('');
    const [role, setRole] = useState('');
    const [salt, setSalt] = useState('');
    const [nickname, setNickname] = useState('');
    const [visible, setVisible] = useState(true);
    const timer = useRef(null);

    useEffect(() => { try { sessionStorage.clear(); } catch { } }, []);

    const switchTo = useCallback((target, fn) => {
        setVisible(false);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            if (fn) fn();
            setScreen(target);
            requestAnimationFrame(() => setVisible(true));
        }, 250);
    }, []);

    const createRoom = useCallback(async (name, password) => {
        const body = password ? { password } : {};
        const res = await fetch(`${API}/room/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.key) {
            switchTo('chat', () => { setRoomKey(data.key); setSalt(data.salt); setRole('admin'); setNickname(name); });
        }
    }, [switchTo]);

    const joinRoom = useCallback(async (key, name, password) => {
        const body = { key };
        if (password) body.password = password;
        const res = await fetch(`${API}/room/join`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) {
            const err = new Error(data.error);
            if (data.needsPassword) err.needsPassword = true;
            throw err;
        }
        switchTo('chat', () => { setRoomKey(data.key); setSalt(data.salt); setRole('receiver'); setNickname(name); });
    }, [switchTo]);

    const leaveRoom = useCallback(() => {
        switchTo('landing', () => { setRoomKey(''); setRole(''); setSalt(''); setNickname(''); });
    }, [switchTo]);

    if (splash) return <Splash onDone={() => setSplash(false)} />;

    return (
        <>
            <FloatingElements />
            <div className={`screen-transition ${visible ? 'screen-visible' : 'screen-hidden'}`}>
                {screen === 'landing' && <Landing onCreateRoom={createRoom} onJoinRoom={joinRoom} />}
                {screen === 'chat' && <ChatRoom roomKey={roomKey} role={role} salt={salt} nickname={nickname} onLeave={leaveRoom} />}
            </div>
        </>
    );
}
