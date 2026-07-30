// main.js — native (no love.js) Pair of Pears. Owns the top-level state machine,
// the synthesized cursor (arrows/D-pad move it, Z=A acts at it, X=B backs out,
// and direct canvas taps act at the tap point), the render loop, and the splash
// screens. Delegates the meadow game to meadow.js and the card game to pear.js.
import { G, W, H, resetMeadow } from './state.js';
import { loadAll, img, SFX } from './assets.js';
import * as input from './input.js';
import * as meadow from './meadow.js';
import * as pear from './pear.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const CURSOR_SPEED = 380; // px/s when moving the cursor with arrows/D-pad

const inRect = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const NEW_RUN = [300, Math.round(H * 0.78), 200, 56];
const PEAR_CLOSE = [744, 20, 36, 36];

function text(str, x, y, { size = 16, color = '#fff', align = 'left', baseline = 'top' } = {}) {
	ctx.font = `${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
	ctx.fillText(str, x, y);
}

// ---- transitions ----
function toGame() { G.state = 'game'; }
function openPearSplash() { G.state = 'pear_splash'; G.pearSplashTimer = 0; G.pearSplashAlpha = 0; }
function startPearRun() { G.state = 'pear_game'; pear.startNewRun(); }
function exitPearSplashToPhone() { G.state = 'game'; G.phoneMenuOpen = true; G.phoneActivePage = null; }
function exitPearGameToSplash() { G.state = 'pear_splash'; G.pearSplashTimer = 1; G.pearSplashAlpha = 1; pear.reset(); }

// ---- input handling per state ----
function handleAct(x, y) {
	if (G.state === 'splash') { toGame(); return; }
	if (G.state === 'game') { meadow.act(x, y, openPearSplash); return; }
	if (G.state === 'pear_splash') {
		if (inRect(x, y, PEAR_CLOSE)) { exitPearSplashToPhone(); return; }
		if (inRect(x, y, NEW_RUN)) { startPearRun(); return; }
		return;
	}
	if (G.state === 'pear_game') {
		if (inRect(x, y, PEAR_CLOSE)) { exitPearGameToSplash(); return; }
		const r = pear.act(x, y);
		if (r === 'back_to_splash') { pear.reset(); openPearSplash(); }
		return;
	}
}
function handleBack() {
	if (G.state === 'game') { meadow.back(); return; }
	if (G.state === 'pear_splash') { exitPearSplashToPhone(); return; }
	if (G.state === 'pear_game') { exitPearGameToSplash(); return; }
}

// ---- splash rendering ----
function drawMeadowSplash(a) {
	const bg = img('background');
	if (bg && bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, W, H); else { ctx.fillStyle = '#66b34d'; ctx.fillRect(0, 0, W, H); }
	ctx.globalAlpha = a;
	text('Meandering Meadow', W / 2, H / 2 - 50, { size: 48, align: 'center' });
	text('A peaceful adventure awaits...', W / 2, H / 2 + 20, { size: 16, align: 'center' });
	text('Press A / tap to start your adventure', W / 2, H - 100, { size: 16, align: 'center' });
	ctx.globalAlpha = 1;
}
function drawPearSplash(a) {
	ctx.fillStyle = '#172a1f'; ctx.fillRect(0, 0, W, H);
	ctx.globalAlpha = a;
	text('A Pair of Pears', W / 2, H * 0.2, { size: 48, align: 'center' });
	const p = img('pear'); if (p && p.complete && p.naturalWidth) { const s = 120 / Math.max(p.naturalWidth, p.naturalHeight); ctx.drawImage(p, W / 2 - p.naturalWidth * s / 2, H * 0.32, p.naturalWidth * s, p.naturalHeight * s); }
	text('A cozy little memory game.', W / 2, H * 0.65, { size: 16, align: 'center', color: '#cfe6d4' });
	text('Match the fruit. Mind your hearts.', W / 2, H * 0.72, { size: 16, align: 'center', color: '#9fc0a6' });
	// New Run button
	ctx.fillStyle = '#245933'; roundRect(NEW_RUN, 12); ctx.fill();
	text('New Run', NEW_RUN[0] + NEW_RUN[2] / 2, NEW_RUN[1] + NEW_RUN[3] / 2, { size: 18, align: 'center', baseline: 'middle' });
	// close X
	ctx.fillStyle = '#7f2626'; roundRect(PEAR_CLOSE, 6); ctx.fill();
	ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
	ctx.moveTo(PEAR_CLOSE[0] + 9, PEAR_CLOSE[1] + 9); ctx.lineTo(PEAR_CLOSE[0] + 27, PEAR_CLOSE[1] + 27);
	ctx.moveTo(PEAR_CLOSE[0] + 27, PEAR_CLOSE[1] + 9); ctx.lineTo(PEAR_CLOSE[0] + 9, PEAR_CLOSE[1] + 27); ctx.stroke();
	ctx.globalAlpha = 1;
}
function roundRect(r, rad) { const [x, y, w, h] = r; ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); }

// ---- loop ----
let last = 0;
function frame(ts) {
	const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;

	// cursor: arrows/D-pad move it
	const c = G.cursor;
	if (input.isDown('left')) c.x -= CURSOR_SPEED * dt;
	if (input.isDown('right')) c.x += CURSOR_SPEED * dt;
	if (input.isDown('up')) c.y -= CURSOR_SPEED * dt;
	if (input.isDown('down')) c.y += CURSOR_SPEED * dt;
	c.x = Math.max(0, Math.min(W, c.x)); c.y = Math.max(0, Math.min(H, c.y));

	// taps act directly at the tap point (and move the cursor there)
	let tap;
	while ((tap = input.nextTap())) { c.x = tap.x; c.y = tap.y; handleAct(tap.x, tap.y); }
	if (input.consume('a')) handleAct(c.x, c.y);
	if (input.consume('b')) handleBack();

	// update
	if (G.state === 'splash') { G.splashTimer += dt; G.fadeAlpha = Math.min(1, G.splashTimer); }
	else if (G.state === 'game') meadow.update(dt);
	else if (G.state === 'pear_splash') { G.pearSplashTimer += dt; G.pearSplashAlpha = Math.min(1, G.pearSplashTimer); }
	else if (G.state === 'pear_game') pear.update(dt);

	// draw
	ctx.clearRect(0, 0, W, H);
	if (G.state === 'splash') drawMeadowSplash(G.fadeAlpha);
	else if (G.state === 'game') { meadow.draw(ctx); meadow.drawCursor(ctx, c.x, c.y); }
	else if (G.state === 'pear_splash') drawPearSplash(G.pearSplashAlpha);
	else if (G.state === 'pear_game') { pear.draw(ctx); drawGameCursor(); }

	input.endFrame();
	requestAnimationFrame(frame);
}
function drawGameCursor() { const c = G.cursor; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2); ctx.stroke(); }

// ---- boot ----
(async function boot() {
	input.init(canvas);
	document.addEventListener('pears-audio-unlock', () => { try { SFX.music.play().catch(() => {}); } catch (e) {} }, { once: true });
	await loadAll();
	requestAnimationFrame(frame);
})();

// debug hook for headless testing
window.__pears = { G, act: handleAct, back: handleBack, state: () => G.state, pear };
