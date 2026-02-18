import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * Flappy Bird — Canvas mini-game (Black & White)
 * Tap / Space / Click to flap. Avoid pipes. Score points.
 */

const GRAVITY = 0.4;
const FLAP = -6.5;
const PIPE_WIDTH = 36;
const PIPE_GAP = 120;
const PIPE_SPEED = 2.5;
const BIRD_SIZE = 14;

function FlappyBird({ onStop }) {
    const canvasRef = useRef(null);
    const gameRef = useRef(null);
    const animRef = useRef(null);
    const [score, setScore] = useState(0);
    const [started, setStarted] = useState(false);
    const [dead, setDead] = useState(false);

    const initGame = useCallback((w, h) => {
        return {
            w, h,
            bird: { x: w * 0.25, y: h * 0.45, vy: 0 },
            pipes: [],
            pipeTimer: 0,
            score: 0,
            started: false,
            dead: false,
            frame: 0,
        };
    }, []);

    const flap = useCallback(() => {
        const g = gameRef.current;
        if (!g) return;
        if (g.dead) {
            // Restart
            const ng = initGame(g.w, g.h);
            ng.started = true;
            gameRef.current = ng;
            setScore(0);
            setStarted(true);
            setDead(false);
            return;
        }
        if (!g.started) {
            g.started = true;
            setStarted(true);
        }
        g.bird.vy = FLAP;
    }, [initGame]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = rect.width;
        const h = rect.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        gameRef.current = initGame(w, h);

        function spawnPipe(g) {
            const minTop = 40;
            const maxTop = g.h - PIPE_GAP - 40;
            const topH = minTop + Math.random() * (maxTop - minTop);
            g.pipes.push({ x: g.w + 10, topH, scored: false });
        }

        function update(g) {
            if (!g.started || g.dead) return;
            g.frame++;

            // Bird physics
            g.bird.vy += GRAVITY;
            g.bird.y += g.bird.vy;

            // Pipe spawning
            g.pipeTimer++;
            if (g.pipeTimer > 90) {
                spawnPipe(g);
                g.pipeTimer = 0;
            }

            // Move pipes
            for (let i = g.pipes.length - 1; i >= 0; i--) {
                g.pipes[i].x -= PIPE_SPEED;
                if (g.pipes[i].x + PIPE_WIDTH < 0) {
                    g.pipes.splice(i, 1);
                    continue;
                }
                // Score
                if (!g.pipes[i].scored && g.pipes[i].x + PIPE_WIDTH < g.bird.x) {
                    g.pipes[i].scored = true;
                    g.score++;
                    setScore(g.score);
                }
                // Collision
                const p = g.pipes[i];
                const bx = g.bird.x, by = g.bird.y, br = BIRD_SIZE / 2;
                if (bx + br > p.x && bx - br < p.x + PIPE_WIDTH) {
                    if (by - br < p.topH || by + br > p.topH + PIPE_GAP) {
                        g.dead = true;
                        setDead(true);
                        return;
                    }
                }
            }

            // Floor / ceiling
            if (g.bird.y + BIRD_SIZE / 2 > g.h - 20 || g.bird.y - BIRD_SIZE / 2 < 0) {
                g.dead = true;
                setDead(true);
            }
        }

        function draw(g) {
            ctx.clearRect(0, 0, w, h);

            // Ground line
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h - 20);
            ctx.lineTo(w, h - 20);
            ctx.stroke();

            // Ground dashes
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            for (let x = (g.frame * PIPE_SPEED) % 20; x < w; x += 20) {
                ctx.beginPath();
                ctx.moveTo(w - x, h - 18);
                ctx.lineTo(w - x + 8, h - 18);
                ctx.stroke();
            }

            // Pipes
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            g.pipes.forEach(p => {
                // Top pipe
                ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH);
                ctx.strokeRect(p.x, 0, PIPE_WIDTH, p.topH);
                // Bottom pipe
                const botY = p.topH + PIPE_GAP;
                ctx.fillRect(p.x, botY, PIPE_WIDTH, h - botY - 20);
                ctx.strokeRect(p.x, botY, PIPE_WIDTH, h - botY - 20);
            });

            // Bird
            ctx.fillStyle = g.dead ? 'rgba(255,255,255,0.3)' : '#ffffff';
            ctx.beginPath();
            ctx.arc(g.bird.x, g.bird.y, BIRD_SIZE / 2, 0, Math.PI * 2);
            ctx.fill();

            // Bird wing (small line)
            if (!g.dead) {
                const wingY = g.bird.vy < 0 ? -3 : 3;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(g.bird.x - 6, g.bird.y + wingY);
                ctx.lineTo(g.bird.x - 12, g.bird.y + wingY + 3);
                ctx.stroke();
            }

            // Score
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = "600 16px 'JetBrains Mono', monospace";
            ctx.textAlign = 'center';
            ctx.fillText(g.score.toString(), w / 2, 30);

            // Idle text
            if (!g.started) {
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = "600 12px 'Inter', sans-serif";
                ctx.fillText('TAP TO START', w / 2, h / 2 + 30);
            }

            // Dead text
            if (g.dead) {
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = "700 14px 'Inter', sans-serif";
                ctx.fillText('GAME OVER', w / 2, h / 2 - 8);
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = "500 11px 'Inter', sans-serif";
                ctx.fillText('TAP TO RESTART', w / 2, h / 2 + 14);
            }
        }

        function loop() {
            const g = gameRef.current;
            if (!g) return;
            update(g);
            draw(g);
            animRef.current = requestAnimationFrame(loop);
        }

        // Input
        const onKey = (e) => {
            if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); flap(); }
        };
        const onClick = () => flap();

        canvas.addEventListener('click', onClick);
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); flap(); }, { passive: false });
        window.addEventListener('keydown', onKey);

        animRef.current = requestAnimationFrame(loop);

        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            canvas.removeEventListener('click', onClick);
            window.removeEventListener('keydown', onKey);
        };
    }, [initGame, flap]);

    return (
        <div className="flappy-wrap">
            <canvas ref={canvasRef} className="flappy-canvas" />
            <button onClick={onStop} className="flappy-stop">Close Game</button>
        </div>
    );
}

export default FlappyBird;
