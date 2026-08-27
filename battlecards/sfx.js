// sfx.js — synthesized sound effects for Battlecards. The game shipped with no
// audio at all; rather than sourcing/hosting sample assets, every sound here is
// built at play time from oscillators + filtered noise (zero network, zero
// licensing, a few hundred bytes each). Deliberately short and quiet — feedback,
// not fanfare.
//
//   import * as SFX from './sfx.js';  SFX.play('damage');
//
// The AudioContext is created lazily on the first user gesture (autoplay
// policy) and every play() is a no-op until then. Mute is persisted.

const MUTE_KEY = 'bc_sfx_muted_v1';
let ctx = null, master = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

function ensureCtx() {
	if (ctx) return ctx;
	try {
		ctx = new (window.AudioContext || window.webkitAudioContext)();
		master = ctx.createGain();
		master.gain.value = 0.5;
		master.connect(ctx.destination);
	} catch (e) { ctx = null; }
	return ctx;
}
// arm on the first gesture so the context exists (and is resumable) by the
// time gameplay events fire
if (typeof addEventListener === 'function') {
	const arm = () => { ensureCtx(); ctx?.resume?.(); };
	addEventListener('pointerdown', arm, { once: true, passive: true });
	addEventListener('keydown', arm, { once: true, passive: true });
}

export function isMuted() { return muted; }
export function setMuted(m) {
	muted = !!m;
	try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
}

// one oscillator sweep: freq -> end over dur seconds
function tone({ freq = 440, end = freq, dur = 0.12, type = 'sine', vol = 0.5, at = 0, curve = 'exp' }) {
	const o = ctx.createOscillator(), g = ctx.createGain();
	const t0 = ctx.currentTime + at;
	o.type = type;
	o.frequency.setValueAtTime(freq, t0);
	if (end !== freq) o.frequency[curve === 'exp' ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](Math.max(1, end), t0 + dur);
	g.gain.setValueAtTime(vol, t0);
	g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
	o.connect(g); g.connect(master);
	o.start(t0); o.stop(t0 + dur + 0.02);
}

// a burst of filtered white noise (impacts, whooshes, shuffles)
function noise({ dur = 0.1, vol = 0.3, at = 0, freq = 1200, q = 0.8, sweep = null }) {
	const n = Math.floor(ctx.sampleRate * dur);
	const buf = ctx.createBuffer(1, n, ctx.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
	const src = ctx.createBufferSource(); src.buffer = buf;
	const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
	const t0 = ctx.currentTime + at;
	f.frequency.setValueAtTime(freq, t0);
	if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(1, sweep), t0 + dur);
	const g = ctx.createGain();
	g.gain.setValueAtTime(vol, t0);
	g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
	src.connect(f); f.connect(g); g.connect(master);
	src.start(t0); src.stop(t0 + dur + 0.02);
}

// the sound library — each entry is a tiny recipe
const LIB = {
	cardPlay: () => { noise({ dur: 0.06, vol: 0.22, freq: 2400, sweep: 700 }); tone({ freq: 190, end: 130, dur: 0.09, type: 'triangle', vol: 0.3 }); },
	summon: () => { tone({ freq: 240, end: 320, dur: 0.1, type: 'triangle', vol: 0.25 }); noise({ dur: 0.08, vol: 0.14, freq: 1500 }); },
	attack: () => { noise({ dur: 0.16, vol: 0.3, freq: 700, sweep: 2600, q: 0.6 }); },
	damage: () => { tone({ freq: 150, end: 55, dur: 0.14, type: 'square', vol: 0.22 }); noise({ dur: 0.1, vol: 0.28, freq: 500, sweep: 150 }); },
	heroDamage: () => { tone({ freq: 110, end: 40, dur: 0.24, type: 'square', vol: 0.3 }); noise({ dur: 0.18, vol: 0.34, freq: 350, sweep: 90, q: 0.5 }); },
	heal: () => { tone({ freq: 520, end: 780, dur: 0.16, type: 'sine', vol: 0.2 }); tone({ freq: 780, end: 1040, dur: 0.14, type: 'sine', vol: 0.14, at: 0.07 }); },
	buff: () => { tone({ freq: 620, end: 930, dur: 0.09, type: 'triangle', vol: 0.16 }); },
	death: () => { tone({ freq: 320, end: 60, dur: 0.3, type: 'sawtooth', vol: 0.16 }); noise({ dur: 0.2, vol: 0.16, freq: 900, sweep: 200 }); },
	freeze: () => { tone({ freq: 1400, end: 900, dur: 0.14, type: 'sine', vol: 0.14 }); tone({ freq: 2100, end: 1400, dur: 0.12, type: 'sine', vol: 0.1, at: 0.03 }); },
	shield: () => { tone({ freq: 700, end: 480, dur: 0.1, type: 'square', vol: 0.14 }); noise({ dur: 0.06, vol: 0.16, freq: 3200 }); },
	secret: () => { tone({ freq: 660, end: 660, dur: 0.09, type: 'sine', vol: 0.16 }); tone({ freq: 880, dur: 0.09, type: 'sine', vol: 0.16, at: 0.1 }); },
	trap: () => { tone({ freq: 880, end: 220, dur: 0.2, type: 'sawtooth', vol: 0.2 }); noise({ dur: 0.12, vol: 0.2, freq: 1200, sweep: 300 }); },
	land: () => { tone({ freq: 120, end: 90, dur: 0.14, type: 'triangle', vol: 0.3 }); noise({ dur: 0.08, vol: 0.14, freq: 400 }); },
	coin: () => { tone({ freq: 1245, dur: 0.08, type: 'square', vol: 0.12 }); tone({ freq: 1865, dur: 0.16, type: 'square', vol: 0.12, at: 0.07 }); },
	turn: () => { tone({ freq: 523, dur: 0.09, type: 'triangle', vol: 0.18 }); tone({ freq: 784, dur: 0.14, type: 'triangle', vol: 0.18, at: 0.09 }); },
	weaponBreak: () => { noise({ dur: 0.14, vol: 0.3, freq: 2600, sweep: 500, q: 0.4 }); tone({ freq: 200, end: 90, dur: 0.12, type: 'square', vol: 0.18 }); },
	victory: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.2, at: i * 0.11 })); },
	defeat: () => { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.26, type: 'triangle', vol: 0.18, at: i * 0.13 })); },
	achievement: () => { [659, 831, 988, 1319].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'sine', vol: 0.16, at: i * 0.08 })); },
	packOpen: () => { noise({ dur: 0.18, vol: 0.26, freq: 1800, sweep: 4200, q: 0.5 }); tone({ freq: 350, end: 700, dur: 0.16, type: 'triangle', vol: 0.16 }); },
	rare: () => { [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'sine', vol: 0.15, at: i * 0.07 })); },
	click: () => { tone({ freq: 900, end: 700, dur: 0.035, type: 'square', vol: 0.08 }); },
};

// throttle: identical sounds within the same frame collapse to one (a board
// clear firing 7 'death's should thump once, not chorus)
const lastAt = {};
export function play(name) {
	if (muted || !LIB[name]) return;
	if (!ensureCtx()) return;
	if (ctx.state === 'suspended') { ctx.resume?.(); }
	const now = performance.now();
	if (now - (lastAt[name] || 0) < 45) return;
	lastAt[name] = now;
	try { LIB[name](); } catch (e) {}
}
