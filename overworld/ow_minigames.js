// ow_minigames.js — Trainer Hill (the timed four-floor climb on Route 111) and the Game Corner slot machines.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Bag from './bag.js';
import { buildMon as battleBuildMon } from './battle.js';
import * as BUI from './battleui.js';
import { Journal } from './journal.js';
import { battle, dialog, evolution, hud, npcs, sctx, world } from './ow_core.js';
import { menuChrome } from './ow_menus.js';
import { S } from './ow_state.js';
import { healParty, leadMon, saveParty } from './party.js';
import { safeLoad, safeSave } from './safestore.js';
import * as Slots from './slots.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import {
	gcMenu,
} from './main.js';

// ---------- Trainer Hill (Hoenn, Route 111) ----------
// The timed four-floor gauntlet: sign up at the reception desk, the clock
// starts, and each floor spawns two HILL GUARDS (Emerald loads its trainers
// dynamically — the shipped floors carry none, so they're injected at floor
// load onto scanned-passable tiles). Both guards must fall before the stairs
// up unseal. The gentleman on the roof pays by your time; the elevator rides
// down. The run lives in memory (leaving voids it); only the BEST time
// persists (magepunk_trainerhill_v1).
const HILL_KEY = 'magepunk_trainerhill_v1';
S.hillRun = null; // { start, beatenSet: {'1F:0':true}, guards: {'1F': [[x,y],[x,y]]} }
export const HILL_FLOORS = { TrainerHill_1F: '1F', TrainerHill_2F: '2F', TrainerHill_3F: '3F', TrainerHill_4F: '4F' };
const HILL_NEXT = { TrainerHill_1F: 'MAP_TRAINER_HILL_2F', TrainerHill_2F: 'MAP_TRAINER_HILL_3F', TrainerHill_3F: 'MAP_TRAINER_HILL_4F', TrainerHill_4F: 'MAP_TRAINER_HILL_ROOF' };
const HILL_GFX = {
	'1F': ['OBJ_EVENT_GFX_CAMPER', 'OBJ_EVENT_GFX_PICNICKER'],
	'2F': ['OBJ_EVENT_GFX_BUG_CATCHER', 'OBJ_EVENT_GFX_LASS'],
	'3F': ['OBJ_EVENT_GFX_BLACK_BELT', 'OBJ_EVENT_GFX_HIKER'],
	'4F': ['OBJ_EVENT_GFX_GENTLEMAN', 'OBJ_EVENT_GFX_PSYCHIC_M'],
};
const HILL_THEMES = {
	'1F': ['pidgeotto', 'raticate', 'furret', 'dodrio'],
	'2F': ['beedrill', 'butterfree', 'ariados', 'ledian'],
	'3F': ['machoke', 'graveler', 'hitmonchan', 'sudowoodo'],
	'4F': ['skarmory', 'dragonair', 'magneton', 'lairon'],
};
const hillElapsed = () => S.hillRun ? Math.floor((Date.now() - S.hillRun.start) / 1000) : 0;
const hillTimeStr = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export function hillGuardsLeft(key) {
	return (S.hillRun?.guards?.[key] || [[], []]).filter((_, i) => !S.hillRun.beatenSet[`${key}:${i}`]).length;
}
// inject this floor's unbeaten guards as real NPC objects before npcs load
export function hillPrepFloor(label) {
	const key = HILL_FLOORS[label];
	if (!key) return;
	const map = world.current?.map;
	if (!map) return;
	map.object_events = (map.object_events || []).filter(o => !o._hill); // clear stale injections
	if (!S.hillRun) return;
	if (!S.hillRun.guards[key]) {
		// two deterministic interior spots: scan outward from the centerline at
		// one-third and two-thirds height for plain passable floor
		const lay = world.current.layout;
		const spots = [];
		for (const fy of [Math.floor(lay.height / 3), Math.floor((lay.height * 2) / 3)]) {
			let placed = false;
			for (let dx = 0; dx < lay.width && !placed; dx++) {
				const x = Math.floor(lay.width / 2) + (dx % 2 ? -1 : 1) * Math.ceil(dx / 2);
				for (const y of [fy, fy + 1, fy - 1]) {
					if (x > 0 && y > 1 && x < lay.width - 1 && y < lay.height - 1
						&& world.isPassable(x, y) && !world.warpAt(x, y) && !spots.some(([sx, sy]) => sx === x && sy === y)) {
						spots.push([x, y]); placed = true; break;
					}
				}
			}
		}
		S.hillRun.guards[key] = spots;
	}
	S.hillRun.guards[key].forEach(([x, y], i) => {
		if (S.hillRun.beatenSet[`${key}:${i}`]) return;
		map.object_events.push({ _hill: `${key}:${i}`, graphics_id: HILL_GFX[key][i] || 'OBJ_EVENT_GFX_CAMPER', x, y, script: '0x0' });
	});
	hud.textContent = `TRAINER HILL ${key} — ${hillTimeStr(hillElapsed())} on the clock`;
}
export function hillGuardAt(fx, fy) {
	const key = HILL_FLOORS[world.current?.name];
	if (!key || !S.hillRun) return null;
	const i = (S.hillRun.guards[key] || []).findIndex(([x, y], gi) => x === fx && y === fy && !S.hillRun.beatenSet[`${key}:${gi}`]);
	return i >= 0 ? { key, i } : null;
}
export function startHillBattle(key, idx) {
	const lead = leadMon(S.party);
	const lv = Math.max(20, Math.min(255, lead?.level || 20));
	const pool = HILL_THEMES[key];
	const foes = [0, 1].map(() => battleBuildMon(pool[Math.floor(Math.random() * pool.length)], lv, battle.data)).filter(Boolean);
	if (!foes.length) return;
	battle.endSpec = null; // leaving mid-bout voids the run anyway (it's in-memory)
	battle.startTrainer(S.party, foes, { displayName: `HILL GUARD ${key}-${idx + 1}` }, result => {
		if (result === 'victory') {
			S.hillRun.beatenSet[`${key}:${idx}`] = true;
			Bag.earn(lv * 40);
			const [gx, gy] = S.hillRun.guards[key][idx];
			const n = npcs.list.find(o => o.tx === gx && o.ty === gy);
			if (n) n.hidden = true;
			const left = hillGuardsLeft(key);
			hud.textContent = left ? `Guard down! ${left} more holds this floor. (${hillTimeStr(hillElapsed())})`
				: `Floor ${key} cleared — the stairs are open! (${hillTimeStr(hillElapsed())})`;
			saveParty(S.party);
			evolution.check(S.party, battle.data);
		} else if (result === 'defeat') {
			S.hillRun = null;
			healParty(S.party);
			hud.textContent = 'The Trainer Hill challenge ends — party healed.';
		}
	});
}
// warp gates: no wandering upstairs without a run, no stairs past unbeaten guards
export function hillWarp(w) {
	const here = world.current?.name || '';
	if (here === 'TrainerHill_Entrance' && w.dest_map === 'MAP_TRAINER_HILL_1F' && !S.hillRun) {
		dialog.open('The attendant stops you.\n\n"Sign up at the reception desk first —\nthe HILL runs on the clock!"');
		return 'blocked';
	}
	if (HILL_FLOORS[here] && w.dest_map === HILL_NEXT[here] && S.hillRun && hillGuardsLeft(HILL_FLOORS[here]) > 0) {
		dialog.open(`The way up is barred!\n\n${hillGuardsLeft(HILL_FLOORS[here])} HILL GUARD${hillGuardsLeft(HILL_FLOORS[here]) === 1 ? '' : 'S'} on this floor still\nstand${hillGuardsLeft(HILL_FLOORS[here]) === 1 ? 's' : ''} undefeated.`);
		return 'blocked';
	}
	return null;
}
export function hillReceptionTalk() {
	const best = safeLoad(HILL_KEY, {})?.best;
	if (S.hillRun) {
		dialog.open(`RECEPTION: You're ${hillTimeStr(hillElapsed())} in, climbing well!\n\nRetire from the challenge?   Z = Retire   X = Keep going`, d => {
			if (d !== 'x') { S.hillRun = null; hud.textContent = 'You retired from the Trainer Hill challenge.'; }
		});
		return;
	}
	if (!S.party.length) { dialog.open('RECEPTION: You need POKeMON to take the HILL!'); return; }
	dialog.open(`RECEPTION: Welcome to TRAINER HILL!\n\nFour floors, two HILL GUARDS each, and the\nclock runs until the roof. Prizes by your time!${best ? `\nYour best: ${hillTimeStr(best)}.` : ''}\n\nTake the challenge?   Z = Yes   X = No`, d => {
		if (d === 'x') return;
		S.hillRun = { start: Date.now(), beatenSet: {}, guards: {} };
		sfx('ui_select');
		hud.textContent = 'The clock is running — up the HILL!';
	});
}
export function hillPrizeTalk() {
	if (!S.hillRun) { dialog.open('GENTLEMAN: Magnificent view, no? Take the\nchallenge from the entrance to earn it properly!'); return; }
	const secs = hillElapsed();
	const prize = secs <= 480 ? 'ppmax' : secs <= 720 ? 'rarecandy' : secs <= 960 ? 'starpiece' : 'nugget';
	Bag.addItem(prize, 1);
	const st = safeLoad(HILL_KEY, {});
	const isBest = !st.best || secs < st.best;
	if (isBest) { st.best = secs; safeSave(HILL_KEY, st); }
	if (!st.cleared) { st.cleared = true; safeSave(HILL_KEY, st); Journal.add(`Conquered Trainer Hill in ${hillTimeStr(secs)}!`); }
	S.hillRun = null;
	sfx('levelup');
	dialog.open(`GENTLEMAN: All eight guards, in ${hillTimeStr(secs)}!${isBest ? '\nA NEW PERSONAL BEST!' : ''}\n\nHere — a ${Bag.ITEMS[prize].name} for your climb.\nThe elevator will take you down.`);
}

// ---------- Game Corner slots ----------
// Voltorb Flip carried the coin loop alone; the classic skill-stop three-reel
// slots (slots.js, pure logic) now spins beside it. Left/Right sets the bet
// (1-3 coins), Z spins and then freezes each reel in turn; payout is the
// middle row times the bet.
export const slotsMenu = { open: false, game: null, bet: 1, msg: null, lastTick: 0 };
export function slotsKey(k) {
	const s = slotsMenu;
	if (k === 'x' || k === 'Escape') {
		if (!s.game || s.game.done) { s.open = false; gcMenu.open = true; return; }
		return; // no walking away mid-spin
	}
	if (!s.game || s.game.done) {
		if (k === 'ArrowLeft') { s.bet = Math.max(1, s.bet - 1); sfx('ui_move'); return; }
		if (k === 'ArrowRight') { s.bet = Math.min(3, s.bet + 1); sfx('ui_move'); return; }
	}
	if (k !== 'z' && k !== 'Enter') return;
	if (!s.game || s.game.done) {
		if (Bag.getCoins() < s.bet) { sfx('ui_denied'); s.msg = 'Not enough coins!'; return; }
		Bag.spendCoins(s.bet);
		s.game = Slots.newGame();
		s.msg = null;
		sfx('ui_select');
		return;
	}
	sfx('ui_select');
	Slots.stopNext(s.game);
	if (s.game.done) {
		const win = Slots.payout(s.game) * s.bet;
		if (win > 0) {
			Bag.addCoins(win);
			sfx(win >= 50 ? 'levelup' : 'money');
			s.msg = `${Slots.row(s.game).join(' · ').toUpperCase()} — won ${win} coins!`;
		} else {
			s.msg = 'No luck this spin...';
		}
	}
}
const SLOT_ART = {
	seven: ['7', '#ff5d5d'], bar: ['BAR', '#ffd75e'], pika: ['PIKA', '#f7d02c'],
	psy: ['PSY', '#e8b34a'], cherry: ['CHR', '#ff7d9c'], berry: ['BRY', '#6be08a'],
};
export function drawSlots(W, H) {
	const u = H / 480;
	const s = slotsMenu;
	menuChrome(W, H, u, 'SLOTS', s.game && !s.game.done ? 'Z: stop the next reel!' : '◄►: bet 1-3   Z: spin   X: back');
	// spin: the reels advance on a frame clock
	if (s.game && !s.game.done) {
		const now = performance.now();
		if (now - s.lastTick > 85) { Slots.tick(s.game); s.lastTick = now; }
	}
	const cw = 92 * u, ch = 64 * u, gx = (W - cw * 3 - 24 * u) / 2, gy = 120 * u;
	for (let off = -1; off <= 1; off++) {
		const syms = s.game ? Slots.row(s.game, off) : ['seven', 'seven', 'seven'];
		syms.forEach((sym, i) => {
			const x = gx + i * (cw + 12 * u), y = gy + (off + 1) * ch;
			sctx.fillStyle = off === 0 ? 'rgba(40,70,110,0.95)' : 'rgba(22,36,60,0.85)';
			BUI.rr(sctx, x, y, cw, ch - 6 * u, 8 * u); sctx.fill();
			if (off === 0) { sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 3; BUI.rr(sctx, x + 1, y + 1, cw - 2, ch - 8 * u, 8 * u); sctx.stroke(); }
			const [label, color] = SLOT_ART[sym] || [sym, '#fff'];
			sctx.fillStyle = off === 0 ? color : 'rgba(255,255,255,0.35)';
			sctx.font = `${Math.round((off === 0 ? 26 : 20) * u)}px m6x11plus, monospace`;
			sctx.textAlign = 'center';
			sctx.fillText(label, x + cw / 2, y + ch / 2 + 8 * u);
			sctx.textAlign = 'left';
		});
	}
	// reel state pips
	if (s.game) {
		s.game.stopped.forEach((st, i) => {
			sctx.fillStyle = st ? BUI.C.accent : BUI.C.dim;
			sctx.beginPath();
			sctx.arc(gx + i * (cw + 12 * u) + cw / 2, gy + 3 * ch + 14 * u, 5 * u, 0, Math.PI * 2);
			sctx.fill();
		});
	}
	sctx.fillStyle = BUI.C.text;
	sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
	sctx.fillText(`BET: ${s.bet}   COINS: ${Bag.getCoins()}`, 40 * u, 96 * u);
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(12 * u)}px m6x11plus, monospace`;
	sctx.fillText('7×3=100  BAR×3=50  PIKA×3=20  PSY×3=10  BRY×3=8  CHR×3=6  CHR×2=2  (× bet)', 40 * u, H - 34 * u);
	if (s.msg) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(s.msg, 40 * u, H - 14 * u);
	}
}

