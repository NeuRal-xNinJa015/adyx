import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * Cipher Runner — side-scrolling runner mini-game
 *
 * The player is a small hacker glyph that auto-runs.
 * Press Space / Click / Tap to jump over incoming firewalls.
 * Score increases over time. Speed ramps up gradually.
 * Everything is B&W to match the Adyx aesthetic.
 */

const W = 600;
const H = 180;
const GROUND = H - 30;
const GRAVITY = 0.7;
const JUMP = -12;
const INITIAL_SPEED = 4;
const MAX_SPEED = 10;
const OBSTACLE_GAP_MIN = 60;
const OBSTACLE_GAP_MAX = 130;

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function CipherRunner({ onStop }) {
    const canvasRef = useRef(null);
    const gameRef = useRef(null);
    const animRef = useRef(null);
    const [highScore, setHighScore] = useState(0);
    const [started, setStarted] = useState(false);

    const initGame = useCallback(() => {
        return {
            player: { x: 60, y: GROUND - 20, w: 16, h: 20, vy: 0, grounded: true },
            obstacles: [],
            particles: [],
            score: 0,
            speed: INITIAL_SPEED,
            frameCount: 0,
            nextObstacle: 80,
            alive: true,
            flash: 0,
        };
    }, []);

    const jump = useCallback(() => {
        const g = gameRef.current;
        if (!g) return;
        if (!g.alive) {
            // Restart
            gameRef.current = initGame();
            setStarted(true);
            return;
        }
        if (g.player.grounded) {
            g.player.vy = JUMP;
            g.player.grounded = false;
        }
    }, [initGame]);

    const startGame = useCallback(() => {
        gameRef.current = initGame();
        setStarted(true);
    }, [initGame]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Handle input
        const onKey = (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                if (!started) startGame();
                else jump();
            }
        };
        const onClick = () => {
            if (!started) startGame();
            else jump();
        };

        window.addEventListener('keydown', onKey);
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('touchstart', onClick, { passive: true });

        const loop = () => {
            const g = gameRef.current;
            if (!g) {
                // Draw idle state
                drawIdle(ctx);
                animRef.current = requestAnimationFrame(loop);
                return;
            }

            if (g.alive) {
                update(g);
            }
            draw(ctx, g);
            animRef.current = requestAnimationFrame(loop);
        };

        animRef.current = requestAnimationFrame(loop);

        return () => {
            window.removeEventListener('keydown', onKey);
            canvas.removeEventListener('click', onClick);
            canvas.removeEventListener('touchstart', onClick);
            cancelAnimationFrame(animRef.current);
        };
    }, [started, jump, startGame]);

    function drawIdle(ctx) {
        ctx.clearRect(0, 0, W, H);
        // Ground
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, GROUND);
        ctx.lineTo(W, GROUND);
        ctx.stroke();
        // Prompt
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '600 11px "SF Mono", "Fira Code", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS SPACE OR TAP TO PLAY', W / 2, GROUND - 30);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.font = '500 10px "SF Mono", "Fira Code", monospace';
        ctx.fillText('CIPHER RUNNER', W / 2, GROUND - 50);

        // Draw idle player
        drawPlayer(ctx, { x: 60, y: GROUND - 20, w: 16, h: 20 }, 0);
    }

    function update(g) {
        g.frameCount++;

        // Speed ramp
        g.speed = Math.min(MAX_SPEED, INITIAL_SPEED + g.frameCount * 0.002);
        g.score = Math.floor(g.frameCount / 6);

        // Player physics
        const p = g.player;
        p.vy += GRAVITY;
        p.y += p.vy;
        if (p.y >= GROUND - p.h) {
            p.y = GROUND - p.h;
            p.vy = 0;
            p.grounded = true;
        }

        // Spawn obstacles
        g.nextObstacle -= g.speed;
        if (g.nextObstacle <= 0) {
            const h = randomBetween(18, 36);
            const w = randomBetween(12, 20);
            const type = Math.random() > 0.7 ? 'double' : 'single';
            g.obstacles.push({
                x: W + 10,
                y: GROUND - h,
                w: type === 'double' ? w + 10 : w,
                h,
                type,
                label: ['AES', 'RSA', 'SHA', 'TLS', 'SSL', 'PGP', 'XOR', 'IV'][randomBetween(0, 7)],
            });
            g.nextObstacle = randomBetween(OBSTACLE_GAP_MIN, OBSTACLE_GAP_MAX);
        }

        // Move obstacles
        for (let i = g.obstacles.length - 1; i >= 0; i--) {
            g.obstacles[i].x -= g.speed;
            if (g.obstacles[i].x + g.obstacles[i].w < 0) {
                g.obstacles.splice(i, 1);
            }
        }

        // Particles (trail)
        if (g.frameCount % 3 === 0) {
            g.particles.push({
                x: p.x + 2,
                y: p.y + p.h - 2,
                life: 12,
                maxLife: 12,
                size: randomBetween(1, 3),
            });
        }
        for (let i = g.particles.length - 1; i >= 0; i--) {
            g.particles[i].life--;
            g.particles[i].x -= g.speed * 0.3;
            if (g.particles[i].life <= 0) g.particles.splice(i, 1);
        }

        // Collision
        for (const obs of g.obstacles) {
            if (
                p.x + p.w - 3 > obs.x + 2 &&
                p.x + 3 < obs.x + obs.w - 2 &&
                p.y + p.h > obs.y + 2
            ) {
                g.alive = false;
                g.flash = 8;
                setHighScore((prev) => Math.max(prev, g.score));
            }
        }
    }

    function drawPlayer(ctx, p, frame) {
        ctx.fillStyle = '#fff';
        // Body
        ctx.fillRect(p.x + 4, p.y + 2, 8, 12);
        // Head
        ctx.fillRect(p.x + 3, p.y, 10, 8);
        // Eye (blink occasionally)
        if (frame % 120 > 8) {
            ctx.fillStyle = '#000';
            ctx.fillRect(p.x + 9, p.y + 3, 2, 2);
        }
        // Legs (animated)
        ctx.fillStyle = '#fff';
        if (p.grounded !== false) {
            const legFrame = Math.floor(frame / 6) % 2;
            if (legFrame === 0) {
                ctx.fillRect(p.x + 4, p.y + 14, 3, 6);
                ctx.fillRect(p.x + 9, p.y + 14, 3, 6);
            } else {
                ctx.fillRect(p.x + 3, p.y + 14, 3, 6);
                ctx.fillRect(p.x + 10, p.y + 14, 3, 6);
            }
        } else {
            // Jumping pose
            ctx.fillRect(p.x + 3, p.y + 14, 4, 4);
            ctx.fillRect(p.x + 9, p.y + 14, 4, 4);
        }
    }

    function draw(ctx, g) {
        ctx.clearRect(0, 0, W, H);

        // Flash on death
        if (g.flash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.04})`;
            ctx.fillRect(0, 0, W, H);
            g.flash--;
        }

        // Ground line
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, GROUND);
        ctx.lineTo(W, GROUND);
        ctx.stroke();

        // Ground dashes (scrolling)
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        const dashOffset = (g.frameCount * g.speed) % 20;
        for (let x = -dashOffset; x < W; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, GROUND + 8);
            ctx.lineTo(x + 8, GROUND + 8);
            ctx.stroke();
        }

        // Particles
        for (const pt of g.particles) {
            const alpha = (pt.life / pt.maxLife) * 0.2;
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
        }

        // Obstacles
        for (const obs of g.obstacles) {
            // Block
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
            // Fill
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            // Top glow line
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(obs.x, obs.y, obs.w, 1);
            // Label
            if (obs.h > 20) {
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.font = '600 7px "SF Mono", "Fira Code", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(obs.label, obs.x + obs.w / 2, obs.y + obs.h / 2 + 3);
            }
        }

        // Player
        drawPlayer(ctx, g.player, g.frameCount);

        // Score
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '700 12px "SF Mono", "Fira Code", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(String(g.score).padStart(5, '0'), W - 16, 20);

        // High score
        if (highScore > 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.font = '500 10px "SF Mono", "Fira Code", monospace';
            ctx.fillText('HI ' + String(highScore).padStart(5, '0'), W - 16, 34);
        }

        // Speed indicator
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.font = '500 8px "SF Mono", "Fira Code", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`SPD ${g.speed.toFixed(1)}`, 12, 18);

        // Death screen
        if (!g.alive) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '700 14px "SF Mono", "Fira Code", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('INTERCEPTED', W / 2, H / 2 - 10);
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '500 10px "SF Mono", "Fira Code", monospace';
            ctx.fillText('TAP OR PRESS SPACE TO RETRY', W / 2, H / 2 + 12);
        }
    }

    return (
        <div className="mini-game-wrap">
            <div className="mini-game-header">
                <span className="mini-game-tag">CIPHER RUNNER</span>
                <span className="mini-game-hint">while you wait...</span>
            </div>
            <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className="mini-game-canvas"
                tabIndex={0}
            />
            <div className="mini-game-footer">
                <span>Space / Tap to jump</span>
                <button onClick={onStop} className="mini-game-close">✕ Close</button>
            </div>
        </div>
    );
}
