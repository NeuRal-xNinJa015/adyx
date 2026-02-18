import { useEffect, useRef } from 'react';

/**
 * Smooth, creative B&W background:
 *  - Perspective grid floor that tilts with mouse
 *  - Soft floating gradient orbs
 *  - Fine dust particles
 *  - Gentle mouse glow
 */
export default function FloatingElements() {
    const canvasRef = useRef(null);
    const animRef = useRef(null);
    const mouse = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let w, h;
        const orbs = [];
        const dust = [];

        function resize() {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;

            // Soft gradient orbs
            orbs.length = 0;
            for (let i = 0; i < 5; i++) {
                orbs.push({
                    x: 0.15 + Math.random() * 0.7,
                    y: 0.15 + Math.random() * 0.7,
                    r: 0.08 + Math.random() * 0.14,
                    dx: (Math.random() - 0.5) * 0.0002,
                    dy: (Math.random() - 0.5) * 0.0002,
                    a: 0.018 + Math.random() * 0.022,
                    phase: Math.random() * Math.PI * 2,
                });
            }

            // Dust
            dust.length = 0;
            const n = Math.min(Math.floor((w * h) / 22000), 45);
            for (let i = 0; i < n; i++) {
                dust.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    vx: (Math.random() - 0.5) * 0.18,
                    vy: (Math.random() - 0.5) * 0.18,
                    r: 0.4 + Math.random() * 1.2,
                    a: 0.025 + Math.random() * 0.045,
                });
            }
        }

        function onMove(e) {
            mouse.current.tx = e.clientX / w;
            mouse.current.ty = e.clientY / h;
        }

        let tick = 0;

        function draw() {
            ctx.clearRect(0, 0, w, h);
            tick++;

            // Smooth lerp
            mouse.current.x += (mouse.current.tx - mouse.current.x) * 0.05;
            mouse.current.y += (mouse.current.ty - mouse.current.y) * 0.05;
            const mx = mouse.current.x;
            const my = mouse.current.y;
            const mxPx = mx * w;
            const myPx = my * h;

            // ── Soft ambient orbs ──
            orbs.forEach(o => {
                o.x += o.dx + Math.sin(tick * 0.003 + o.phase) * 0.00012;
                o.y += o.dy + Math.cos(tick * 0.002 + o.phase) * 0.00012;
                o.x += (mx - o.x) * 0.0004;
                o.y += (my - o.y) * 0.0004;
                if (o.x < 0.05) o.dx = Math.abs(o.dx);
                if (o.x > 0.95) o.dx = -Math.abs(o.dx);
                if (o.y < 0.05) o.dy = Math.abs(o.dy);
                if (o.y > 0.95) o.dy = -Math.abs(o.dy);

                const ox = o.x * w, oy = o.y * h;
                const or = o.r * Math.max(w, h);
                const breathe = Math.sin(tick * 0.007 + o.phase) * 0.006;

                const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, or);
                g.addColorStop(0, `rgba(255,255,255,${o.a + breathe})`);
                g.addColorStop(0.5, `rgba(255,255,255,${(o.a + breathe) * 0.25})`);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.fillRect(ox - or, oy - or, or * 2, or * 2);
            });

            // ── Perspective grid ──
            const camX = (mx - 0.5) * 50;
            const camY = (my - 0.5) * 25;
            const horizY = h * 0.40 + camY;
            const vanX = w * 0.5 + camX;

            const cols = 18;
            const rows = 10;
            const spread = 1.6;

            // Verticals
            for (let i = 0; i <= cols; i++) {
                const t = (i / cols) * 2 - 1;
                const topX = vanX + t * 30;
                const botX = vanX + t * w * spread * 0.5;
                const dist = Math.abs(t);
                const alpha = 0.025 * (1 - dist * 0.35);
                ctx.strokeStyle = `rgba(255,255,255,${Math.max(0.004, alpha)})`;
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(topX, horizY);
                ctx.lineTo(botX, h + 30);
                ctx.stroke();
            }

            // Horizontals
            for (let i = 1; i <= rows; i++) {
                const t = i / rows;
                const eased = t * t;
                const y = horizY + eased * (h - horizY + 30);
                const prog = (y - horizY) / (h + 30 - horizY);
                const lx = vanX - prog * w * spread * 0.5;
                const rx = vanX + prog * w * spread * 0.5;
                const alpha = 0.02 * Math.min(1, prog * 2);
                ctx.strokeStyle = `rgba(255,255,255,${Math.max(0.003, alpha)})`;
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(lx, y);
                ctx.lineTo(rx, y);
                ctx.stroke();
            }

            // Horizon glow
            const hg = ctx.createLinearGradient(0, horizY - 3, 0, horizY + 3);
            hg.addColorStop(0, 'rgba(255,255,255,0)');
            hg.addColorStop(0.5, 'rgba(255,255,255,0.035)');
            hg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = hg;
            ctx.fillRect(vanX - w * 0.4, horizY - 3, w * 0.8, 6);

            // ── Mouse glow ──
            const mg = ctx.createRadialGradient(mxPx, myPx, 0, mxPx, myPx, 180);
            mg.addColorStop(0, 'rgba(255,255,255,0.04)');
            mg.addColorStop(0.5, 'rgba(255,255,255,0.012)');
            mg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = mg;
            ctx.fillRect(mxPx - 180, myPx - 180, 360, 360);

            // ── Dust particles ──
            dust.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < -5) p.x = w + 5;
                if (p.x > w + 5) p.x = -5;
                if (p.y < -5) p.y = h + 5;
                if (p.y > h + 5) p.y = -5;

                const dx = mxPx - p.x, dy = myPx - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 200 && dist > 0) {
                    p.x += dx * 0.0004;
                    p.y += dy * 0.0004;
                }

                let boost = 0;
                if (dist < 180) boost = (1 - dist / 180) * 0.07;
                ctx.fillStyle = `rgba(255,255,255,${p.a + boost})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r + boost * 2, 0, Math.PI * 2);
                ctx.fill();
            });

            // ── Dust connections near mouse ──
            for (let i = 0; i < dust.length; i++) {
                const di = Math.sqrt((dust[i].x - mxPx) ** 2 + (dust[i].y - myPx) ** 2);
                if (di > 180) continue;
                for (let j = i + 1; j < dust.length; j++) {
                    const dj = Math.sqrt((dust[j].x - mxPx) ** 2 + (dust[j].y - myPx) ** 2);
                    if (dj > 180) continue;
                    const dd = Math.sqrt((dust[i].x - dust[j].x) ** 2 + (dust[i].y - dust[j].y) ** 2);
                    if (dd < 110) {
                        ctx.strokeStyle = `rgba(255,255,255,${(1 - dd / 110) * 0.035})`;
                        ctx.lineWidth = 0.3;
                        ctx.beginPath();
                        ctx.moveTo(dust[i].x, dust[i].y);
                        ctx.lineTo(dust[j].x, dust[j].y);
                        ctx.stroke();
                    }
                }
            }

            animRef.current = requestAnimationFrame(draw);
        }

        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', onMove);
        animRef.current = requestAnimationFrame(draw);

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', onMove);
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, []);

    return <canvas ref={canvasRef} className="bg-canvas" />;
}
