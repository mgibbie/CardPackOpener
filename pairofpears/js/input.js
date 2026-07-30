// input.js — unified input for the native Pair of Pears. Three sources feed one
// model: keyboard (arrows/WASD + Z=A, X=B), on-screen touch buttons (a D-pad +
// A/B rendered as DOM over the canvas), and direct pointer taps on the canvas.
// The game reads edge-triggered button presses, held state, and a tap queue.
export const GAME_W = 800, GAME_H = 600;

const down = new Set();        // logical buttons currently held
const justPressed = new Set(); // buttons pressed since the last endFrame()
const taps = [];               // {x,y} in game coords (queued canvas taps)
let canvasEl = null;

const KEYMAP = {
	ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
	w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
	z: 'a', Z: 'a', Enter: 'a', ' ': 'a',
	x: 'b', X: 'b', Escape: 'b', Backspace: 'b',
};

function press(btn) { if (!down.has(btn)) justPressed.add(btn); down.add(btn); }
function release(btn) { down.delete(btn); }

export const isDown = btn => down.has(btn);
export function consume(btn) { if (justPressed.has(btn)) { justPressed.delete(btn); return true; } return false; }
export const anyDir = () => isDown('up') || isDown('down') || isDown('left') || isDown('right');
export function nextTap() { return taps.shift() || null; }
export function endFrame() { justPressed.clear(); taps.length = 0; }

function toGame(clientX, clientY) {
	const r = canvasEl.getBoundingClientRect();
	return { x: (clientX - r.left) * (GAME_W / r.width), y: (clientY - r.top) * (GAME_H / r.height) };
}

export function init(canvas) {
	canvasEl = canvas;
	addEventListener('keydown', e => { const b = KEYMAP[e.key]; if (b) { e.preventDefault(); press(b); } });
	addEventListener('keyup', e => { const b = KEYMAP[e.key]; if (b) release(b); });
	// direct canvas taps/clicks -> queued tap in game coords
	canvas.addEventListener('pointerdown', e => { taps.push(toGame(e.clientX, e.clientY)); });
	// on-screen touch buttons: any element with data-btn
	for (const el of document.querySelectorAll('[data-btn]')) {
		const btn = el.getAttribute('data-btn');
		const dn = e => { e.preventDefault(); press(btn); el.classList.add('active'); try { el.setPointerCapture(e.pointerId); } catch (x) {} };
		const up = () => { release(btn); el.classList.remove('active'); };
		el.addEventListener('pointerdown', dn);
		el.addEventListener('pointerup', up);
		el.addEventListener('pointercancel', up);
		el.addEventListener('pointerleave', up);
	}
	// unlock audio on first interaction (browsers gate autoplay)
	const unlock = () => { document.dispatchEvent(new Event('pears-audio-unlock')); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
	addEventListener('pointerdown', unlock, { once: true });
	addEventListener('keydown', unlock, { once: true });
}
