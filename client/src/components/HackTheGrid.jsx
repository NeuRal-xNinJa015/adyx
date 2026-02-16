import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hack the Grid — tap-based reflex mini-game
 *
 * Encryption symbols light up on a 4×4 grid.
 * Tap them before they fade to score points.
 * Combo streaks = bonus multiplier.
 * Speed ramps up. Very satisfying particle bursts.
 */

const GRID = 4;
const CELLS = GRID * GRID;
const SYMBOLS = ['AES', 'RSA', 'SHA', 'TLS', 'SSL', 'PGP', 'XOR', 'IV', 'GCM', 'CBC', 'ECC', 'DSA', 'MD5', 'DES', 'RC4', 'MAC'];
const INITIAL_INTERVAL = 1200;
const MIN_INTERVAL = 450;
const ACTIVE_DURATION = 1800;

export default function HackTheGrid({ onStop }) {
    const [cells, setCells] = useState(Array(CELLS).fill(null));
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [bestCombo, setBestCombo] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [particles, setParticles] = useState([]);
    const [misses, setMisses] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [started, setStarted] = useState(false);
    const [popups, setPopups] = useState([]);

    const timerRef = useRef(null);
    const cellTimers = useRef({});
    const particleId = useRef(0);
    const popupId = useRef(0);
    const scoreRef = useRef(0);
    const comboRef = useRef(0);
    const missRef = useRef(0);

    const spawnCell = useCallback(() => {
        if (missRef.current >= 5) return;

        setCells(prev => {
            const empty = prev.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
            if (empty.length === 0) return prev;
            const idx = empty[Math.floor(Math.random() * empty.length)];
            const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            const next = [...prev];
            next[idx] = { symbol: sym, born: Date.now() };

            // Auto-expire
            const expireTimer = setTimeout(() => {
                setCells(p => {
                    if (p[idx] && p[idx].born === next[idx].born) {
                        missRef.current++;
                        setMisses(missRef.current);
                        setCombo(0);
                        comboRef.current = 0;
                        if (missRef.current >= 5) {
                            setGameOver(true);
                            setHighScore(h => Math.max(h, scoreRef.current));
                            clearInterval(timerRef.current);
                        }
                        const np = [...p];
                        np[idx] = null;
                        return np;
                    }
                    return p;
                });
            }, ACTIVE_DURATION);
            cellTimers.current[idx] = expireTimer;

            return next;
        });
    }, []);

    const startGame = useCallback(() => {
        setCells(Array(CELLS).fill(null));
        setScore(0); setCombo(0); setBestCombo(0); setMisses(0);
        setGameOver(false); setParticles([]); setPopups([]);
        scoreRef.current = 0; comboRef.current = 0; missRef.current = 0;
        setStarted(true);

        // Clear old timers
        Object.values(cellTimers.current).forEach(clearTimeout);
        cellTimers.current = {};
        clearInterval(timerRef.current);

        // First spawn
        setTimeout(() => spawnCell(), 400);

        let elapsed = 0;
        timerRef.current = setInterval(() => {
            elapsed++;
            const interval = Math.max(MIN_INTERVAL, INITIAL_INTERVAL - elapsed * 15);
            spawnCell();
            // Occasionally spawn two
            if (elapsed > 10 && Math.random() > 0.6) {
                setTimeout(spawnCell, 200);
            }
        }, 1000);
    }, [spawnCell]);

    useEffect(() => () => {
        clearInterval(timerRef.current);
        Object.values(cellTimers.current).forEach(clearTimeout);
    }, []);

    const hitCell = (idx) => {
        if (gameOver || !cells[idx]) return;

        // Clear expire timer
        clearTimeout(cellTimers.current[idx]);

        // Score
        comboRef.current++;
        const multiplier = Math.min(comboRef.current, 8);
        const points = 10 * multiplier;
        scoreRef.current += points;
        setScore(scoreRef.current);
        setCombo(comboRef.current);
        setBestCombo(b => Math.max(b, comboRef.current));

        // Clear cell
        setCells(prev => {
            const next = [...prev];
            next[idx] = null;
            return next;
        });

        // Score popup
        const pid = ++popupId.current;
        setPopups(p => [...p, { id: pid, points, combo: comboRef.current, idx }]);
        setTimeout(() => setPopups(p => p.filter(pp => pp.id !== pid)), 800);

        // Particles
        const col = idx % GRID;
        const row = Math.floor(idx / GRID);
        const cx = col * 25 + 12.5; // percentage
        const cy = row * 25 + 12.5;
        const newParticles = Array.from({ length: 6 }, () => ({
            id: ++particleId.current,
            x: cx + (Math.random() - 0.5) * 8,
            y: cy + (Math.random() - 0.5) * 8,
            size: 2 + Math.random() * 3,
        }));
        setParticles(p => [...p, ...newParticles]);
        setTimeout(() => {
            setParticles(p => p.filter(pp => !newParticles.find(np => np.id === pp.id)));
        }, 600);
    };

    const getLifePercent = (cell) => {
        if (!cell) return 0;
        const elapsed = Date.now() - cell.born;
        return Math.max(0, 1 - elapsed / ACTIVE_DURATION);
    };

    // Force re-render for progress bars
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!started || gameOver) return;
        const t = setInterval(() => setTick(x => x + 1), 80);
        return () => clearInterval(t);
    }, [started, gameOver]);

    return (
        <div className="htg-wrap">
            <div className="htg-header">
                <div className="htg-header-left">
                    <span className="htg-tag">HACK THE GRID</span>
                    {started && !gameOver && (
                        <span className="htg-lives">
                            {Array.from({ length: 5 }, (_, i) => (
                                <span key={i} className={`htg-life ${i < 5 - misses ? 'on' : ''}`} />
                            ))}
                        </span>
                    )}
                </div>
                <div className="htg-header-right">
                    {started && <span className="htg-score">{String(score).padStart(5, '0')}</span>}
                    {combo > 1 && <span className="htg-combo">×{combo}</span>}
                </div>
            </div>

            <div className="htg-grid-area">
                {/* Particles */}
                {particles.map(p => (
                    <div key={p.id} className="htg-particle" style={{
                        left: `${p.x}%`, top: `${p.y}%`,
                        width: p.size, height: p.size,
                    }} />
                ))}

                {/* Score popups */}
                {popups.map(p => {
                    const col = p.idx % GRID;
                    const row = Math.floor(p.idx / GRID);
                    return (
                        <div key={p.id} className="htg-popup" style={{
                            left: `${col * 25 + 12.5}%`, top: `${row * 25 + 4}%`,
                        }}>
                            +{p.points}
                        </div>
                    );
                })}

                {/* Grid */}
                <div className="htg-grid">
                    {cells.map((cell, i) => {
                        const life = getLifePercent(cell);
                        return (
                            <button
                                key={i}
                                className={`htg-cell ${cell ? 'active' : ''} ${life < 0.3 && cell ? 'urgent' : ''}`}
                                onClick={() => hitCell(i)}
                                disabled={!cell || gameOver}
                            >
                                {cell && (
                                    <>
                                        <span className="htg-symbol">{cell.symbol}</span>
                                        <div className="htg-timer-bar" style={{ transform: `scaleX(${life})` }} />
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Pre-start */}
                {!started && (
                    <div className="htg-overlay">
                        <div className="htg-overlay-content">
                            <div className="htg-start-tag">HACK THE GRID</div>
                            <p className="htg-start-desc">Tap the encryption symbols<br />before they fade away</p>
                            <button onClick={startGame} className="htg-start-btn">START</button>
                            {highScore > 0 && <p className="htg-hi">Best: {highScore}</p>}
                        </div>
                    </div>
                )}

                {/* Game Over */}
                {gameOver && (
                    <div className="htg-overlay">
                        <div className="htg-overlay-content">
                            <div className="htg-over-tag">FIREWALL BREACH</div>
                            <div className="htg-final-score">{score}</div>
                            <div className="htg-stats">
                                <span>Best Combo: ×{bestCombo}</span>
                                <span>High Score: {highScore}</span>
                            </div>
                            <button onClick={startGame} className="htg-start-btn">RETRY</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="htg-footer">
                <span>Tap symbols to score • {started && !gameOver ? `${5 - misses} lives left` : 'Combo = multiplier'}</span>
                <button onClick={onStop} className="mini-game-close">✕ Close</button>
            </div>
        </div>
    );
}
