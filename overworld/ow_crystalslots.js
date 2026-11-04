// ow_crystalslots.js — Crystal's slot machine (`special SlotMachine`), the Goldenrod
// and Celadon (JohKanto) Game Corner machines.
//
// The game itself is minigames/slots/slots_engine.js, a frame-for-frame port of
// pokecrystal engine/games/slot_machine.asm; this file is the special's checks, the
// Game Boy screen it draws (the decomp's own gfx, tools/gen_slots_gfx.py) and the
// keys. Z = A (stop a reel / confirm), X = B (back out of the bet menu = quit).
// Coins are the COIN CASE's (bag.js). The sign scripts' `setval TRUE/FALSE`
// (restored by tools/gen_crystal_scriptvar.mjs) picks the lucky bias table.
import * as Bag from './bag.js';
import * as BUI from './battleui.js';
import { getImage } from './engine.js';
import * as Story from './events.js';
import { cutscene, dialog, sctx } from './ow_core.js';
import { menuChrome } from './ow_menus.js';
import { S } from './ow_state.js';
import { sfx } from './sound.js';
import { SlotsEngine, TEXT } from './minigames/slots/slots_engine.js';

export const crystalSlots = { open: false, engine: null, acc: 0, last: 0, coinSfx: 0, rng: null, manual: false };

const GB_W = 160, GB_H = 144;
let gb = null, bgImg = null, objImg = null;
getImage('minigames/slots/slots_bg.png').then(i => { bgImg = i; }).catch(() => {});
getImage('minigames/slots/slots_obj.png').then(i => { objImg = i; }).catch(() => {});

// engine sound names -> the port's sfx
const SFX = { stop: 'ui_select', start: 'ui_open', bet: 'money', denied: 'ui_denied', coin: 'text_tick', throw: 'ball_drop',
	tick: 'text_tick', land: 'bump', hop: 'ledge', win: 'item_get', win_ball: 'fanfare_capture', win_seven: 'levelup' };
function playSfx(name) {
	if (name === 'coin' || name === 'tick') {   // the payout counts down one coin a frame: don't machine-gun
		const now = performance.now();
		if (now - crystalSlots.coinSfx < 90) return;
		crystalSlots.coinSfx = now;
	}
	if (SFX[name]) sfx(SFX[name]);
}

// specials.asm SlotMachine: CheckCoinsAndCoinCase, then _SlotMachine
export function startCrystalSlots() {
	const refuse = text => { dialog.open(text, () => cutscene.resume()); return 'wait'; };
	if (Bag.getCoins() <= 0) return refuse('You have no coins.');
	if (Bag.count('coincase') <= 0) return refuse("You don't have a\nCOIN CASE.");
	const bank = {
		get: () => Bag.getCoins(),
		set: n => { const c = Bag.getCoins(); if (n > c) Bag.addCoins(n - c); else if (n < c) Bag.spendCoins(c - n); },
	};
	crystalSlots.engine = new SlotsEngine({
		bank, lucky: (Story.getVar('VAR_RESULT') | 0) !== 0, sfx: playSfx,
		rng: () => (crystalSlots.rng ? crystalSlots.rng() : Math.floor(Math.random() * 256)),
	});
	crystalSlots.open = true;
	crystalSlots.acc = 0;
	crystalSlots.last = performance.now();
	return 'wait';
}

function close() {
	crystalSlots.open = false;
	crystalSlots.engine = null;
	sfx('ui_cancel');
	cutscene.resume();      // the sign script's closetext / end
}

// run n Game Boy frames now (tests; the draw loop runs them in real time otherwise)
export function stepCrystalSlots(n = 1) {
	const g = crystalSlots.engine;
	for (let i = 0; i < n && g && !g.done; i++) g.step();
	if (g && g.done && crystalSlots.open) close();
}

export function crystalSlotsKey(k) {
	const g = crystalSlots.engine;
	if (!g) { crystalSlots.open = false; return; }
	const btn = k === 'z' || k === 'Enter' || k === ' ' ? 'A' : k === 'x' || k === 'Escape' || k === 'Backspace' ? 'B'
		: k === 'ArrowUp' ? 'UP' : k === 'ArrowDown' ? 'DOWN' : null;
	if (!btn) return;
	if (g.ui && (btn === 'UP' || btn === 'DOWN')) sfx('ui_move');
	g.press(btn);
}

// ---------- the Game Boy screen ----------
function textbox(c, x0, y0, x1, y1) {
	// a frame over tiles (x0,y0)-(x1,y1)
	c.fillStyle = '#f8f8f8';
	c.fillRect(x0 * 8, y0 * 8, (x1 - x0 + 1) * 8, (y1 - y0 + 1) * 8);
	c.strokeStyle = '#202020';
	c.lineWidth = 2;
	c.strokeRect(x0 * 8 + 2, y0 * 8 + 2, (x1 - x0 + 1) * 8 - 4, (y1 - y0 + 1) * 8 - 4);
}
function gbText(c, s, x, y) {
	c.fillStyle = '#202020';
	c.font = '11px m6x11plus, monospace';
	c.textBaseline = 'top';
	c.fillText(s, x, y);
}

function renderGb(g) {
	if (!gb) { gb = document.createElement('canvas'); gb.width = GB_W; gb.height = GB_H; }
	const c = gb.getContext('2d');
	c.imageSmoothingEnabled = false;
	c.fillStyle = '#f8f8f8';
	c.fillRect(0, 0, GB_W, GB_H);
	c.save();
	c.translate(0, -g.scy);   // Golem's landing shakes the machine (hSCY)
	// the bet lights, columns 3 and 16 (Slots_IlluminateBetLights): rows 6-7 for
	// 1 coin, 4-9 for 2, 2-11 for 3 — copied from the sheet's lit face at sheetY
	const lightRows = g.lights >= 3 ? [16, 80] : g.lights >= 2 ? [32, 48] : g.lights >= 1 ? [48, 16] : null;
	const lit = sheetY => {
		if (!lightRows) return;
		const [y, h] = lightRows;
		c.drawImage(bgImg, 24, sheetY + y, 8, h, 24, y, 8, h);
		c.drawImage(bgImg, 128, sheetY + y, 8, h, 128, y, 8, h);
	};
	if (bgImg) { c.drawImage(bgImg, 0, 0, 160, 96, 0, 0, 160, 96); lit(96); }
	// the reels: OAM sprites behind every BG colour but 0
	if (objImg) {
		const sy = g.inverted ? 16 : 0;
		g.reels.forEach((r, i) => {
			const x = 40 + i * 32, base = g.bottomIndex(r), off = g.offset(r);
			for (let k = 0; k < 4; k++) {
				const sym = r.strip[base + k];
				c.drawImage(objImg, (sym >> 2) * 16, sy, 16, 16, x, 64 - k * 16 + off, 16, 16);
			}
		});
	}
	if (bgImg) {
		// the face again with colour 0 cut out, over the reels
		c.drawImage(bgImg, 0, 192, 160, 96, 0, 0, 160, 96);
		lit(288);
	}
	// Golem / Chansey / the egg (in front of the machine)
	if (objImg) {
		for (const s of g.sprites) {
			if (s.kind === 'golem') {
				const f = (s.t >> 3) & 3;   // Frameset_SlotsGolem: 1, 2, 1 (yflip), 2 (xflip)
				const fx = (f & 1) * 24;
				c.save();
				c.translate(s.x - 20 + s.xoff + 12, s.y - 28 + s.yoff + 16);
				if (f === 2) c.scale(1, -1);
				if (f === 3) c.scale(-1, 1);
				c.drawImage(objImg, fx, 48, 24, 32, -12, -16, 24, 32);
				c.restore();
			} else if (s.kind === 'chansey') {
				const seq = s.set === 2 ? [0, 3, 4, 3, 0] : [0, 1, 0, 2];
				const i = s.set === 2 ? Math.min(seq.length - 1, s.t >> 3) : (s.t >> 3) % 4;
				c.drawImage(objImg, seq[i] * 24, 80, 24, 32, s.x - 20, s.y - 28, 24, 32);
			} else if (s.kind === 'egg') {
				c.drawImage(objImg, 0, 112, 8, 16, s.x - 12, s.y - 20 + s.yoff, 8, 16);
			}
		}
	}
	c.restore();
	// CREDIT / PAYOUT (SlotsLoop.PrintCoinsAndPayout: 4 digits, leading zeros)
	c.fillStyle = '#f8f8f8';
	c.fillRect(40, 8, 32, 8);
	c.fillRect(88, 8, 32, 8);
	c.font = '11px m6x11plus, monospace';
	c.textBaseline = 'top';
	c.fillStyle = '#202020';
	const n4 = v => String(Math.min(9999, v)).padStart(4, '0');
	c.fillText(n4(g.coins), 41, 6);
	c.fillText(n4(g.payout), 89, 6);
	// the text box (rows 12-17)
	textbox(c, 0, 12, 19, 17);
	const lines = String(g.text || '').split('\n');
	if (g.icon != null && objImg) {
		// Slots_PayoutText: the symbol at (2,13), the text 4 tiles in
		c.drawImage(objImg, (g.icon >> 2) * 16, 32, 16, 16, 16, 104, 16, 16);
		gbText(c, lines[0] || '', 40, 109);
		gbText(c, lines[1] || '', 8, 125);
	} else {
		gbText(c, lines[0] || '', 8, 109);
		gbText(c, lines[1] || '', 8, 125);
	}
	const u = g.ui;
	if ((u && u.kind === 'prompt') || (u && u.kind === 'waitAB' && !g.cursorBlink)) gbText(c, '▼', 144, 130);
	if (u && u.kind === 'bet') {
		textbox(c, 14, 10, 19, 17);   // Slots_AskBet.MenuHeader: menu_coords 14, 10, 19, 17
		[' 3', ' 2', ' 1'].forEach((s, i) => gbText(c, (u.cursor === i ? '▶' : ' ') + s, 120, 92 + i * 16));
	}
	if (u && u.kind === 'yesno') {
		textbox(c, 14, 7, 19, 11);
		['YES', 'NO'].forEach((s, i) => gbText(c, (u.cursor === i ? '▶' : ' ') + s, 120, 68 + i * 16));
	}
	return gb;
}

export function drawCrystalSlots(W, H) {
	const g = crystalSlots.engine;
	if (!g) return;
	// real-time Game Boy frames (60 Hz), unless a test is stepping by hand
	const now = performance.now();
	if (!crystalSlots.manual) {
		crystalSlots.acc = Math.min(crystalSlots.acc + (now - crystalSlots.last), 1000 / 60 * 6);
		while (crystalSlots.acc >= 1000 / 60) { crystalSlots.acc -= 1000 / 60; g.step(); }
		if (g.done) { close(); return; }
	}
	crystalSlots.last = now;
	const u = H / 480;
	const hint = g.ui?.kind === 'bet' ? '▲▼: bet   Z: start   X: quit'
		: g.ui ? 'Z: OK   X: back' : 'Z: stop the reel';
	menuChrome(W, H, u, 'SLOTS', hint, false);
	const screen = renderGb(g);
	const scale = Math.max(1, Math.min((W - 32 * u) / GB_W, (H - 140 * u) / GB_H));
	const sw = GB_W * scale, sh = GB_H * scale;
	const x = (W - sw) / 2, y = 72 * u;
	sctx.save();
	sctx.imageSmoothingEnabled = false;
	sctx.drawImage(screen, x, y, sw, sh);
	sctx.restore();
	// tap targets (A / B, and the bet / yes-no cursor)
	const bw = 84 * u, bh = 40 * u, by = Math.min(H - bh - 8 * u, y + sh + 10 * u);
	const btns = [['slkey:ArrowUp', '▲'], ['slkey:ArrowDown', '▼'], ['slkey:x', 'B'], ['slkey:z', 'A']];
	const gap = 10 * u, total = btns.length * bw + (btns.length - 1) * gap;
	btns.forEach(([id, label], i) => {
		const b = { id, x: (W - total) / 2 + i * (bw + gap), y: by, w: bw, h: bh, label, center: true };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === id, u);
	});
}
