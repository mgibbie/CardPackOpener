// pokeblock_case.js — the POKeBLOCK CASE (pokeemerald pokeblock.c) and feeding a
// block to a POKeMON (use_pokeblock.c, pokeblock_feed.c).
//
//   field    the bag's POKeBLOCK CASE: a block -> USE / TOSS / CANCEL.
//            USE picks a party POKeMON ("<mon> gets a POKeBLOCK?"), it eats
//            ("happily" / "disdainfully" by its nature), and each condition that
//            moved is "enhanced" — or "It won't eat anymore…" at full sheen.
//            TOSS: "Throw away this <block>?" -> "The <block> was thrown away."
//   feeder   the Safari Zone's POKeBLOCK FEEDER (special OpenPokeblockCaseOnFeeder):
//            USE / CANCEL; the block goes on the feeder, VAR_RESULT = its slot
//            (0xFFFF when cancelled), STR_VAR_1 = its name
// The rules live in pokeblock.js; this is the menu.
import * as BUI from './battleui.js';
import { sctx } from './ow_core.js';
import { menuChrome } from './ow_menus.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';
import * as PB from './pokeblock.js';
import { sfx } from './sound.js';

export const pbCase = {
	open: false, context: 'field', mode: 'list', idx: 0, act: 0, monIdx: 0,
	yesNo: null, msgs: [], after: null, slot: -1, onExit: null, result: 0xffff,
};
const C = pbCase;

export function openPokeblockCase(context = 'field', onExit = null) {
	Object.assign(C, { open: true, context, mode: 'list', idx: 0, act: 0, monIdx: 0, yesNo: null, msgs: [], after: null, slot: -1, onExit, result: 0xffff });
	sfx('ui_open');
}
function close() {
	C.open = false;
	const cb = C.onExit; C.onExit = null;
	cb?.(C.result);
}
const rows = () => PB.caseList();
const actions = () => (C.context === 'feeder' ? ['USE', 'CANCEL'] : ['USE', 'TOSS', 'CANCEL']);
function say(lines, after) { C.msgs = Array.isArray(lines) ? lines.slice() : [lines]; C.after = after || null; }

export function pokeblockCaseKey(k) {
	const A = k === 'z' || k === 'Enter' || k === ' ', B = k === 'x' || k === 'Escape' || k === 'Backspace';
	const up = k === 'ArrowUp', down = k === 'ArrowDown';
	if (C.msgs.length) {
		if (A || B) { sfx('ui_select'); C.msgs.shift(); if (!C.msgs.length) { const f = C.after; C.after = null; f?.(); } }
		return;
	}
	if (C.yesNo) {
		if (up || down) { C.yesNo.idx ^= 1; sfx('ui_move'); }
		if (A || B) { const yes = A && C.yesNo.idx === 0; const cb = C.yesNo.cb; C.yesNo = null; sfx('ui_select'); cb(yes); }
		return;
	}
	if (C.mode === 'list') {
		const n = rows().length + 1;   // + CANCEL
		if (up) { C.idx = (C.idx + n - 1) % n; sfx('ui_move'); }
		if (down) { C.idx = (C.idx + 1) % n; sfx('ui_move'); }
		if (B) { sfx('ui_cancel'); close(); return; }
		if (A) {
			const r = rows()[C.idx];
			if (!r) { sfx('ui_select'); close(); return; }
			C.slot = r.slot; C.mode = 'actions'; C.act = 0; sfx('ui_select');
		}
		return;
	}
	if (C.mode === 'actions') {
		const acts = actions();
		if (up) { C.act = (C.act + acts.length - 1) % acts.length; sfx('ui_move'); }
		if (down) { C.act = (C.act + 1) % acts.length; sfx('ui_move'); }
		if (B) { C.mode = 'list'; return; }
		if (!A) return;
		const a = acts[C.act], block = PB.loadCase()[C.slot];
		if (a === 'CANCEL' || !block) { C.mode = 'list'; return; }
		if (a === 'TOSS') {
			C.yesNo = { idx: 0, msg: `Throw away this\n${PB.pokeblockName(block.color)}?`, cb: yes => {
				if (!yes) { C.mode = 'list'; return; }
				say(`The ${PB.pokeblockName(block.color)}\nwas thrown away.`, () => {
					PB.removePokeblock(C.slot);
					C.mode = 'list'; C.idx = Math.min(C.idx, rows().length);
				});
			} };
			return;
		}
		if (C.context === 'feeder') {   // PokeblockAction_UseOnPokeblockFeeder
			C.result = C.slot;
			C.placed = block;
			PB.removePokeblock(C.slot);
			close();
			return;
		}
		C.mode = 'pickmon'; C.monIdx = 0;   // ChooseMonToGivePokeblock
		return;
	}
	if (C.mode === 'pickmon') {
		const party = S.party || [], n = party.length + 1;   // + CANCEL
		if (up) { C.monIdx = (C.monIdx + n - 1) % n; sfx('ui_move'); }
		if (down) { C.monIdx = (C.monIdx + 1) % n; sfx('ui_move'); }
		if (B) { C.mode = 'list'; return; }
		if (!A) return;
		const mon = party[C.monIdx];
		if (!mon) { C.mode = 'list'; return; }
		C.yesNo = { idx: 0, msg: `${mon.nickname || mon.name} gets a POKeBLOCK?`, cb: yes => {
			if (!yes) return;
			if (PB.sheenMaxed(mon)) { say("It won't eat anymore…"); return; }
			const block = PB.loadCase()[C.slot];
			if (!block) { C.mode = 'list'; return; }
			const r = PB.feedPokeblock(mon, block);
			PB.removePokeblock(C.slot);
			saveParty(S.party);
			sfx('heal');
			C.lastFeed = r;
			say([r.ate, ...r.lines], () => { C.mode = 'list'; C.idx = Math.min(C.idx, rows().length); });
		} };
	}
}

// ---------- draw ----------
const FLAVOR_COLOR = ['#e05050', '#4f7fe0', '#e888c0', '#58b058', '#e0c040'];
let icons = null;
function pokeblockIcons() {
	if (!icons && typeof Image !== 'undefined') { icons = new Image(); icons.src = new URL('./minigames/blender/pokeblock.png', import.meta.url).href; }
	return icons?.complete ? icons : null;
}
function drawIcon(color, x, y, size) {
	const img = pokeblockIcons();
	if (!img) return;
	sctx.imageSmoothingEnabled = false;
	sctx.drawImage(img, 0, color * 8, 8, 8, x, y, size, size);
}
// the condition pentagon (use_pokeblock.c's graph): COOL top, then clockwise
// BEAUTY, CUTE, SMART, TOUGH
function conditionGraph(mon, cx, cy, r, u) {
	const c = PB.cond(mon), keys = ['cool', 'beauty', 'cute', 'smart', 'tough'];
	const pt = (i, k) => [cx + Math.sin(i * 2 * Math.PI / 5) * r * k, cy - Math.cos(i * 2 * Math.PI / 5) * r * k];
	sctx.strokeStyle = BUI.C.panelBorder; sctx.lineWidth = 2;
	sctx.beginPath(); keys.forEach((_, i) => { const [x, y] = pt(i, 1); i ? sctx.lineTo(x, y) : sctx.moveTo(x, y); }); sctx.closePath(); sctx.stroke();
	sctx.fillStyle = 'rgba(232,184,74,0.55)';
	sctx.beginPath(); keys.forEach((k, i) => { const [x, y] = pt(i, Math.max(0.04, c[k] / 255)); i ? sctx.lineTo(x, y) : sctx.moveTo(x, y); }); sctx.closePath(); sctx.fill();
	sctx.fillStyle = BUI.C.dim; sctx.font = `${Math.round(12 * u)}px m6x11plus, monospace`; sctx.textAlign = 'center';
	keys.forEach((k, i) => { const [x, y] = pt(i, 1.25); sctx.fillText(`${k.toUpperCase()} ${c[k]}`, x, y + 4 * u); });
	sctx.fillText(`SHEEN ${c.sheen}/255`, cx, cy + r + 34 * u);
	sctx.textAlign = 'left';
}
export function drawPokeblockCase(W, H) {
	const u = H / 480;
	const list = rows();
	if (C.mode === 'pickmon') {
		menuChrome(W, H, u, 'POKeBLOCK', 'Who gets the POKeBLOCK?');
		const party = S.party || [];
		[...party, null].forEach((m, i) => {
			const id = 'pbm:' + i, b = { id, x: 24 * u, y: (76 + i * 48) * u, w: W * 0.46, h: 42 * u, label: m ? `${m.nickname || m.name}  Lv${m.level}` : 'CANCEL', center: false };
			S.menuUi.push(b); BUI.button(sctx, b, S.menuHover === id || C.monIdx === i, u);
		});
		const mon = party[C.monIdx];
		if (mon) conditionGraph(mon, W * 0.76, H * 0.42, Math.min(W * 0.16, 120 * u), u);
	} else {
		menuChrome(W, H, u, 'POKeBLOCK CASE', `${list.length}/${PB.POKEBLOCKS_COUNT}`);
		const all = [...list, null];
		const start = Math.max(0, Math.min(C.idx - 3, all.length - 8));
		all.slice(start, start + 8).forEach((r, i) => {
			const idx = start + i, id = 'pbc:' + idx;
			const b = { id, x: 24 * u, y: (76 + i * 46) * u, w: W * 0.55, h: 40 * u, label: r ? `      ${PB.pokeblockName(r.color)}` : 'CANCEL', center: false };
			S.menuUi.push(b); BUI.button(sctx, b, S.menuHover === id || C.idx === idx, u);
			if (r) {
				drawIcon(r.color, b.x + 10 * u, b.y + 8 * u, 24 * u);
				sctx.fillStyle = BUI.C.dim; sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
				sctx.textAlign = 'right'; sctx.fillText(`Lv${PB.highestFlavorLevel(r)}`, b.x + b.w - 10 * u, b.y + 26 * u); sctx.textAlign = 'left';
			}
		});
		// DrawPokeblockInfo: which flavors it has, and its FEEL
		const sel = list[C.idx];
		const px = W * 0.62, py = 84 * u;
		sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
		if (sel) {
			PB.FLAVORS.forEach((f, i) => {
				const has = sel[f] > 0;
				sctx.fillStyle = has ? FLAVOR_COLOR[i] : BUI.C.faint;
				sctx.fillText(`${f.toUpperCase()}`, px + (i >= 3 ? 110 * u : 0), py + (i % 3) * 26 * u);
				if (has) drawIcon(sel.color, px + (i >= 3 ? 110 * u : 0) - 22 * u, py + (i % 3) * 26 * u - 14 * u, 16 * u);
			});
			sctx.fillStyle = BUI.C.text;
			sctx.fillText(`FEEL ${PB.pokeblockFeel(sel)}`, px, py + 3 * 26 * u + 8 * u);
		}
		if (C.mode === 'actions') {
			actions().forEach((a, i) => {
				const id = 'pba:' + i, b = { id, x: W * 0.62, y: (220 + i * 46) * u, w: W * 0.3, h: 40 * u, label: a, center: true };
				S.menuUi.push(b); BUI.button(sctx, b, S.menuHover === id || C.act === i, u);
			});
		}
	}
	const box = text => {
		sctx.fillStyle = '#f8f8f8'; sctx.fillRect(16 * u, H - 92 * u, W - 32 * u, 76 * u);
		sctx.strokeStyle = '#506078'; sctx.lineWidth = 3; sctx.strokeRect(16 * u, H - 92 * u, W - 32 * u, 76 * u);
		sctx.fillStyle = '#383838'; sctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
		text.split('\n').forEach((l, i) => sctx.fillText(l, 32 * u, H - 62 * u + i * 24 * u));
	};
	if (C.msgs.length) box(C.msgs[0]);
	else if (C.yesNo) {
		box(C.yesNo.msg);
		['YES', 'NO'].forEach((t, i) => {
			const id = 'pby:' + i, b = { id, x: W - 140 * u, y: H - 200 * u + i * 50 * u, w: 110 * u, h: 42 * u, label: t, center: true };
			S.menuUi.push(b); BUI.button(sctx, b, S.menuHover === id || C.yesNo.idx === i, u);
		});
	}
}
// tap/click: a row, an action, a mon, YES/NO
export function pokeblockCaseClick(kind, a) {
	if (C.msgs.length) { pokeblockCaseKey('z'); return; }
	if (kind === 'pby' && C.yesNo) { C.yesNo.idx = +a; pokeblockCaseKey('z'); return; }
	if (kind === 'pbc') { C.idx = +a; pokeblockCaseKey('z'); return; }
	if (kind === 'pba') { C.act = +a; pokeblockCaseKey('z'); return; }
	if (kind === 'pbm') { C.monIdx = +a; pokeblockCaseKey('z'); }
}
