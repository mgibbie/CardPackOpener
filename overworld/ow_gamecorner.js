// ow_gamecorner.js — the Johto GAME CORNER: Voltorb Flip, coins and the prize counter.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Bag from './bag.js';
import { buildMon as battleBuildMon } from './battle.js';
import * as BUI from './battleui.js';
import { battle, sctx } from './ow_core.js';
import { menuChrome, optionList } from './ow_menus.js';
import { slotsMenu } from './ow_minigames.js';
import { S } from './ow_state.js';
import { addCaught, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import { sfx } from './sound.js';
import * as VFlip from './voltorbflip.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { dexMilestoneCheck } from './ow_follower.js';


// ---------- GAME CORNER (Voltorb Flip + coins + prizes) ----------
// The corners shipped as furniture: slot machines nobody could pull, clerks
// with mute scripts. The counter (services 'gamecorner' zone) now opens a hub:
// play VOLTORB FLIP for coins, buy coins for money, spend coins at the prize
// desk. Coins live in the COIN CASE (bag.js, capped 9,999) — the clerk hands
// you the case free on your first visit.
export const gcMenu = { open: false, mode: 'hub', idx: 0, flash: null };
export const vfMenu = { open: false, game: null, cur: 12, flash: null };
const GC_PRIZES = [
	{ mon: 'abra', cost: 180 }, { mon: 'clefairy', cost: 500 },
	{ mon: 'dratini', cost: 2800 }, { mon: 'scyther', cost: 5500 }, { mon: 'porygon', cost: 9999 },
	{ item: 'tmthunderbolt', cost: 4000 }, { item: 'tmicebeam', cost: 4000 }, { item: 'tmflamethrower', cost: 4000 },
];
function gcRows() {
	if (gcMenu.mode === 'hub') return ['PLAY VOLTORB FLIP', 'PLAY SLOTS', 'BUY COINS', 'PRIZE CORNER', 'Leave'];
	if (gcMenu.mode === 'coins') return ['50 COINS — $1,000', '500 COINS — $10,000', 'Back'];
	return GC_PRIZES.map(pz => {
		const name = pz.mon ? (battle.data.species[pz.mon]?.name?.toUpperCase() || pz.mon.toUpperCase()) : Bag.ITEMS[pz.item].name;
		return `${name} — ${pz.cost.toLocaleString()} COINS`;
	}).concat(['Back']);
}
export function gcKey(k) {
	const rows = gcRows();
	if (k === 'ArrowUp') gcMenu.idx = (gcMenu.idx + rows.length - 1) % rows.length;
	if (k === 'ArrowDown') gcMenu.idx = (gcMenu.idx + 1) % rows.length;
	if (k === 'x' || k === 'Escape') {
		if (gcMenu.mode === 'hub') gcMenu.open = false;
		else { gcMenu.mode = 'hub'; gcMenu.idx = 0; gcMenu.flash = null; }
		return;
	}
	if (k !== 'z' && k !== 'Enter') return;
	if (gcMenu.mode === 'hub') {
		if (gcMenu.idx === 0) { gcMenu.open = false; vfMenu.open = true; vfMenu.game = VFlip.newGame(1); vfMenu.cur = 12; vfMenu.flash = null; }
		else if (gcMenu.idx === 1) { gcMenu.open = false; slotsMenu.open = true; slotsMenu.game = null; slotsMenu.msg = null; }
		else if (gcMenu.idx === 2) { gcMenu.mode = 'coins'; gcMenu.idx = 0; gcMenu.flash = null; }
		else if (gcMenu.idx === 3) { gcMenu.mode = 'prizes'; gcMenu.idx = 0; gcMenu.flash = null; }
		else gcMenu.open = false;
	} else if (gcMenu.mode === 'coins') {
		const deal = [[50, 1000], [500, 10000]][gcMenu.idx];
		if (!deal) { gcMenu.mode = 'hub'; gcMenu.idx = 0; return; }
		if (Bag.getCoins() >= Bag.COIN_CAP) { sfx('ui_denied'); gcMenu.flash = 'Your COIN CASE is full!'; }
		else if (!Bag.spend(deal[1])) { sfx('ui_denied'); gcMenu.flash = 'Not enough money!'; }
		else { Bag.addCoins(deal[0]); sfx('money'); gcMenu.flash = `Bought ${deal[0]} coins!`; }
	} else {
		const pz = GC_PRIZES[gcMenu.idx];
		if (!pz) { gcMenu.mode = 'hub'; gcMenu.idx = 0; return; }
		if (!Bag.spendCoins(pz.cost)) { sfx('ui_denied'); gcMenu.flash = 'Not enough coins!'; return; }
		sfx('item_get');
		if (pz.item) { Bag.addItem(pz.item); gcMenu.flash = `${Bag.ITEMS[pz.item].name} is yours!`; }
		else {
			const mon = buildMonForGift(pz.mon, 25);
			if (!mon) { Bag.addCoins(pz.cost); gcMenu.flash = 'The prize desk is out of stock...'; return; }
			Dex.markSeen(pz.mon); Dex.markCaught(pz.mon); dexMilestoneCheck();
			const where = addCaught(S.party, mon);
			saveParty(S.party);
			gcMenu.flash = `${mon.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box!'}`;
		}
	}
}
export function vfKey(k) {
	const g = vfMenu.game;
	if (!g) { vfMenu.open = false; return; }
	if (g.phase !== 'play') {
		// round over: Z deals the next round at the earned level, X leaves
		if (k === 'z' || k === 'Enter') { vfMenu.game = VFlip.nextRound(g); vfMenu.cur = 12; vfMenu.flash = null; }
		if (k === 'x' || k === 'Escape') vfMenu.open = false;
		return;
	}
	if (k === 'ArrowUp') vfMenu.cur = (vfMenu.cur + 20) % 25;
	if (k === 'ArrowDown') vfMenu.cur = (vfMenu.cur + 5) % 25;
	if (k === 'ArrowLeft') vfMenu.cur = vfMenu.cur % 5 === 0 ? vfMenu.cur + 4 : vfMenu.cur - 1;
	if (k === 'ArrowRight') vfMenu.cur = vfMenu.cur % 5 === 4 ? vfMenu.cur - 4 : vfMenu.cur + 1;
	if (k === 'x' || k === 'Escape') { vfMenu.open = false; return; }   // forfeits the round score
	if (k === 'z' || k === 'Enter') {
		const r = VFlip.flip(g, vfMenu.cur);
		if (r === 'volt') vfMenu.flash = 'A VOLTORB! The round score is gone... Z = next round, X = leave.';
		else if (r === 'clear') {
			Bag.addCoins(g.coins);
			vfMenu.flash = `Cleared! Banked ${g.coins} coins. Z = level ${g.nextLevel}, X = leave.`;
		}
	}
}
export function drawGcMenu(W, H) {
	const title = gcMenu.mode === 'coins' ? 'COIN COUNTER' : gcMenu.mode === 'prizes' ? 'PRIZE CORNER' : 'GAME CORNER';
	const sub = `Coins: ${Bag.getCoins().toLocaleString()}   Money: $${Bag.getMoney().toLocaleString()}`;
	optionList(W, H, H / 480, title, sub, gcRows(), gcMenu.idx, 'gc:', gcMenu.flash);
}
export function drawVfMenu(W, H) {
	const u = H / 480;
	const g = vfMenu.game;
	if (!g) return;
	menuChrome(W, H, u, `VOLTORB FLIP — LEVEL ${g.level}`,
		vfMenu.flash || `Round: ${g.coins} coins   Case: ${Bag.getCoins().toLocaleString()}   Z flip · X quit`);
	const hint = VFlip.hints(g.board);
	const cell = 52 * u, gap = 6 * u;
	const gx = W / 2 - (cell * 6 + gap * 5) / 2, gy = 84 * u;
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	for (let i = 0; i < 25; i++) {
		const cx = gx + (i % 5) * (cell + gap), cy = gy + Math.floor(i / 5) * (cell + gap);
		const t = g.board[i];
		const sel = vfMenu.cur === i && g.phase === 'play';
		sctx.fillStyle = t.flipped ? (t.v === 0 ? '#7a2030' : '#2c4a37') : (sel ? '#4a4a80' : '#333355');
		sctx.fillRect(cx, cy, cell, cell);
		if (sel) { sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 2; sctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2); }
		if (t.flipped) {
			sctx.fillStyle = t.v === 0 ? '#ff8899' : '#cfe8d8';
			sctx.textAlign = 'center';
			sctx.fillText(t.v === 0 ? 'V!' : String(t.v), cx + cell / 2, cy + cell / 2 + 5 * u);
			sctx.textAlign = 'left';
		}
		S.menuUi.push({ id: 'vf:' + i, x: cx, y: cy, w: cell, h: cell, label: '' });
	}
	// hint chips: sum over Voltorb count — right of each row, below each column
	for (let i = 0; i < 5; i++) {
		for (const [hx, hy, h2] of [
			[gx + 5 * (cell + gap), gy + i * (cell + gap), hint.rows[i]],
			[gx + i * (cell + gap), gy + 5 * (cell + gap), hint.cols[i]],
		]) {
			sctx.fillStyle = '#20223a';
			sctx.fillRect(hx, hy, cell, cell);
			sctx.fillStyle = BUI.C.text;
			sctx.fillText(String(h2.sum), hx + 6 * u, hy + 20 * u);
			sctx.fillStyle = '#ff8899';
			sctx.fillText('V' + h2.volts, hx + 6 * u, hy + 44 * u);
		}
	}
}

export function buildMonForGift(species, level) {
	return battleBuildMon(species, level, battle.data);
}

