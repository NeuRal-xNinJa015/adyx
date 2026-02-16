import { useState, useCallback, useEffect } from 'react';
import Landing from './components/Landing';
import ChatRoom from './components/ChatRoom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function App() {
    const [splash, setSplash] = useState(true);
    const [splashPhase, setSplashPhase] = useState(0);
    const [screen, setScreen] = useState('landing');
    const [roomKey, setRoomKey] = useState('');
    const [role, setRole] = useState('');
    const [salt, setSalt] = useState('');
    const [nickname, setNickname] = useState('');

    useEffect(() => {
        const t1 = setTimeout(() => setSplashPhase(1), 300);
        const t2 = setTimeout(() => setSplashPhase(2), 1000);
        const t3 = setTimeout(() => setSplashPhase(3), 1600);
        const t4 = setTimeout(() => setSplashPhase(4), 3000);
        const t5 = setTimeout(() => setSplash(false), 3800);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
    }, []);

    const createRoom = useCallback(async (name) => {
        const res = await fetch(`${API}/room/create`, { method: 'POST' });
        const data = await res.json();
        if (data.key) {
            setRoomKey(data.key); setSalt(data.salt); setRole('admin'); setNickname(name); setScreen('chat');
        }
    }, []);

    const joinRoom = useCallback(async (key, name) => {
        const res = await fetch(`${API}/room/join`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setRoomKey(data.key); setSalt(data.salt); setRole('receiver'); setNickname(name); setScreen('chat');
    }, []);

    const leaveRoom = useCallback(() => {
        setScreen('landing'); setRoomKey(''); setRole(''); setSalt(''); setNickname('');
    }, []);

    if (splash) {
        return (
            <div className={`splash ${splashPhase >= 4 ? 'out' : ''}`}>
                <div className="splash-grain" />
                <div className="splash-scanlines" />
                <div className="letterbox letterbox-top" />
                <div className="letterbox letterbox-bot" />

                <div className="splash-content">
                    <div className={`splash-title ${splashPhase >= 1 ? 'vis' : ''}`}>ADYX</div>
                    <div className={`splash-rule ${splashPhase >= 2 ? 'vis' : ''}`} />
                    <div className={`splash-sub ${splashPhase >= 2 ? 'vis' : ''}`}>Encrypted Communication</div>
                </div>

                {/* Credit — below center */}
                <div className={`splash-credit ${splashPhase >= 3 ? 'vis' : ''}`}>
                    <span className="splash-credit-line">Engineered by Aditya</span>
                </div>

                {/* Corners */}
                <span className="splash-corner tl">SYS.INIT</span>
                <span className="splash-corner tr">v1.0</span>
                <span className="splash-corner bl">AES-256-GCM</span>
                <span className="splash-corner br">2025</span>
            </div>
        );
    }

    return (
        <>
            {screen === 'landing' && <Landing onCreateRoom={createRoom} onJoinRoom={joinRoom} />}
            {screen === 'chat' && <ChatRoom roomKey={roomKey} role={role} salt={salt} nickname={nickname} onLeave={leaveRoom} />}
        </>
    );
}
