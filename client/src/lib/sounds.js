/**
 * Adyx Sound Engine — Procedural Audio via Web Audio API
 * 
 * All sounds are synthesized on-the-fly using OscillatorNode + GainNode.
 * Zero network requests, instant playback, military-grade audio cues.
 */

let audioCtx = null;
let soundEnabled = true;

function getCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

export function toggleSound(on) {
    soundEnabled = typeof on === 'boolean' ? on : !soundEnabled;
    try { localStorage.setItem('adyx_sound', soundEnabled ? '1' : '0'); } catch { }
    return soundEnabled;
}

export function isSoundEnabled() {
    try {
        const stored = localStorage.getItem('adyx_sound');
        if (stored !== null) soundEnabled = stored === '1';
    } catch { }
    return soundEnabled;
}

// Initialize on first call
isSoundEnabled();

function playTone(freq, duration, type = 'sine', vol = 0.15, ramp = 0.02) {
    if (!soundEnabled) return;
    try {
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + ramp);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    } catch { }
}

function playMulti(tones) {
    if (!soundEnabled) return;
    tones.forEach(([freq, duration, type, vol, delay]) => {
        setTimeout(() => playTone(freq, duration, type, vol || 0.12), delay || 0);
    });
}

// ═══════════════════════════════════════════
// SOUND EFFECTS
// ═══════════════════════════════════════════

/** Quick upward blip — outgoing message */
export function messageSent() {
    playMulti([
        [880, 0.08, 'sine', 0.1, 0],
        [1320, 0.1, 'sine', 0.08, 50],
    ]);
}

/** Gentle descending notification — incoming message */
export function messageReceived() {
    playMulti([
        [1046, 0.12, 'sine', 0.12, 0],
        [784, 0.15, 'sine', 0.1, 80],
        [880, 0.2, 'sine', 0.06, 180],
    ]);
}

/** Connection established — ascending chord */
export function peerJoined() {
    playMulti([
        [523, 0.15, 'sine', 0.1, 0],
        [659, 0.15, 'sine', 0.1, 100],
        [784, 0.2, 'sine', 0.12, 200],
        [1046, 0.3, 'sine', 0.08, 320],
    ]);
}

/** Disconnect — descending minor */
export function peerLeft() {
    playMulti([
        [784, 0.15, 'sine', 0.1, 0],
        [659, 0.15, 'sine', 0.1, 120],
        [523, 0.2, 'sine', 0.08, 240],
        [392, 0.3, 'sine', 0.06, 380],
    ]);
}

/** Urgent warning chirp — security alert */
export function securityAlert() {
    playMulti([
        [1200, 0.06, 'square', 0.08, 0],
        [1600, 0.06, 'square', 0.1, 80],
        [1200, 0.06, 'square', 0.08, 160],
        [1600, 0.08, 'square', 0.1, 240],
        [2000, 0.12, 'square', 0.06, 340],
    ]);
}

/** Subtle mechanical click — typing feedback */
export function typeClick() {
    playTone(6000 + Math.random() * 2000, 0.03, 'square', 0.02, 0.005);
}

/** Alarm burst — panic button */
export function panicAlarm() {
    if (!soundEnabled) return;
    for (let i = 0; i < 6; i++) {
        setTimeout(() => {
            playTone(i % 2 === 0 ? 1500 : 2000, 0.1, 'sawtooth', 0.15, 0.01);
        }, i * 100);
    }
}

/** Countdown tick — self-destruct timer */
export function selfDestructTick() {
    playTone(1000, 0.05, 'square', 0.06, 0.005);
}

/** Room created — triumphant ping */
export function roomCreated() {
    playMulti([
        [660, 0.12, 'sine', 0.1, 0],
        [880, 0.12, 'sine', 0.12, 100],
        [1100, 0.18, 'sine', 0.1, 200],
    ]);
}

/** Button hover — subtle blip */
export function buttonHover() {
    playTone(2200, 0.04, 'sine', 0.03, 0.005);
}

/** Error / failure */
export function errorSound() {
    playMulti([
        [300, 0.15, 'sawtooth', 0.08, 0],
        [200, 0.2, 'sawtooth', 0.06, 120],
    ]);
}

/** Vibrate device if supported */
export function vibrate(pattern = [50]) {
    try { navigator.vibrate?.(pattern); } catch { }
}

/** Combined alert: sound + vibration */
export function alertFeedback() {
    securityAlert();
    vibrate([100, 50, 100]);
}
