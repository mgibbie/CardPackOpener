// tdmode.js — TOWER DEFENSE on the board (owner, 2026-11-23; Plans/POKETACTICA_TOWER_DEFENSE_PLAN.md). The simulation
// is td/sim.js (exact, tick by tick); this file is the page: it steps the sim in real time (pause, 1× / 2× / 3×), draws
// the towers and the enemies walking on Poketactica's own board, and takes the player's orders. Every menu pauses.
//   keyboard / pad: arrows move the cursor · Z a free tile: place a figurine there; a tower: its orders · X back ·
//                   C speed 1× 2× 3× · V call the next wave · Enter (Start) pause + the field menu · Q / E turn the board
//   touch: tap a tile (place / a tower's orders); the bar's buttons: pause, speed, wave, menu
// A run is { seed, map, squad, inputs: [[tick, order]] }: every order is applied at once and written down with the tick
// it was given on, so the sim replays it exactly (td/replay.js). From that one recipe:
//   play    the player's run: saved on this device as it goes (a reload RESUMES it at its tick, paused), broadcast to
//           friends (the recipe so far + the tick), and stored as a replay when it ends
//   watch   a replay: Z play / pause · ← → the wave before / after · C speed 1× 2× 4× 8× · X the start · V a link to here
//   follow  a friend's live run: the same sim, run a moment behind what they have reached, checked against their hash
import * as TD from './td/sim.js';
import { tdKind } from './td/effects.js';
import { tdMapById, isMazeMap } from './td/maps.js';
import { cellsAt, turned, wayLength, SHAPES } from './td/maze.js';
import { BONUS, GOLD, placeCost } from './td/cards.js';
import { tdRecipe, tdDriver, tdRunTo } from './td/replay.js';
import { slimFig } from './replay.js';

const RULE_NAME = { first: 'First (furthest along)', last: 'Last (furthest back)', strong: 'Strongest', weak: 'Weakest', fast: 'Fastest' };
const KIND_SAY = { damage: '', foe: 'status', buff: 'boost', sp: 'gives SP', weather: 'weather', paint: 'terrain', field: 'field', trap: 'road hazard', none: 'no effect here' };
const TICK = 1 / TD.TPS, MAX_STEPS = 12, SAVE_EVERY = TD.TPS, WATCH_SPEEDS = [1, 2, 4, 8], FOLLOW_LAG = 30;
const COACH_KEY = 'magepunk_poketactica_tdcoach_v1';   // (this device has been shown the ropes)
// the first run's coach: one thing at a time, each ticked off by doing it (key: keyboard / controller words; touch: a phone's)
const COACH = [
	{ key: 'Move to a free tile <b>beside the road</b> and press <b>Z</b> to place a figurine. It attacks by itself.', touch: '<b>Tap a free tile beside the road</b> and pick a figurine. It attacks by itself.', done: (S) => S.towers.length >= 1 },
	{ key: 'Fill your slots. Put the cursor on a tower: the <b>red tiles</b> are what it can reach.', touch: 'Fill your slots. Tap a tower: the <b>red tiles</b> are what it can reach.', done: (S) => TD.freeSlots(S) === 0 || S.towers.length >= S.placed.length || S.wave >= 2 },
	{ key: 'Enemies walk the road to the gate. Each one through costs a <b>♥</b>. <b>Wave!</b> calls the next wave early.', touch: 'Enemies walk the road to the gate. Each one through costs a <b>♥</b>. <b>Wave!</b> calls the next wave early.', done: (S) => S.wave >= 2 },
	{ key: 'Press <b>Z</b> on a tower for its orders: who it aims at, which moves it uses, and what <b>⚡</b> buys.', touch: 'Tap a tower twice for its orders: who it aims at, which moves it uses, and what <b>⚡</b> buys.', done: (S, T) => !!T.sawOrders || S.wave >= 4 },
	{ key: '<b>C</b> speeds things up. The run lasts until the ♥ run out. Nobody is lost here: it is safe training.', touch: 'The <b>1×</b> button speeds things up. The run lasts until the ♥ run out. Nobody is lost here.', done: (S, T) => T.speed > 1 || S.wave >= 4 },
];
// ---- Maze Builder (owner, 2026-11-24; Plans/POKETACTICA_MAZE_BUILDER_PLAN.md): a map with gates and no road
//   keyboard / pad: V the next card in the hand (after the last: none) · C turn it · Z put the ghost, Z again lay it ·
//                   X back (the ghost, the card; on a block laid this round: take it back) · Enter the field menu (call the wave)
//   touch: tap a card, tap a tile (the ghost), the ✓ button (or the same tile again) lays it
const SHAPE_NAME = { one: '1 tile', two: '2 in a line', three: '3 in a line', corner: 'Corner', I: 'I', O: 'O', T: 'T', L: 'L', J: 'J', S: 'S', Z: 'Z' };
const MZ_WAY = 0xffd23c, MZ_OK = 0x4be07a, MZ_BAD = 0xfe5f55, MZ_LOOSE = 0x7cd0ff;
/** A shape as a little picture (for a card, a reward). */
function glyph(shape, turns = 0) {
	const cells = turned(shape, turns), w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1, on = new Set(cells.map(([x, y]) => y * w + x));
	let out = '';
	for (let i = 0; i < w * h; i++) out += on.has(i) ? '<i class="on"></i>' : '<i></i>';
	return `<span class="pt-mz-shape" style="grid-template-columns:repeat(${w},7px)" aria-hidden="true">${out}</span>`;
}
const COACH_MZ_KEY = 'magepunk_poketactica_mzcoach_v1';   // (this device has been shown Maze Builder's ropes)
const COACH_MZ = [
	{ key: 'There is no road. The <b>yellow tiles</b> are the way enemies will walk. Press <b>V</b> to choose a block card.', touch: 'There is no road. The <b>yellow tiles</b> are the way enemies will walk. <b>Tap a block card</b>.', done: (S, T) => !!T.card || S.blocks.length >= 1 },
	{ key: 'Move it across the way. <b>C</b> turns it. <b>Z</b> puts it, <b>Z</b> again lays it. The way must stay open.', touch: '<b>Tap a tile</b> on the way to put it there. <b>Turn</b> turns it, <b>Lay it</b> lays it. The way must stay open.', done: (S) => S.blocks.length >= 1 },
	{ key: 'Figurines stand <b>on blocks</b>. Put the cursor on a block and press <b>Z</b>. Each one costs <b>●</b> gold.', touch: 'Figurines stand <b>on blocks</b>. <b>Tap a block</b> and pick one. Each costs <b>●</b> gold.', done: (S) => S.towers.length >= 1 },
	{ key: 'Lay more blocks to make the way longer, then press <b>Enter</b> and call the wave. Blocks lock when it starts.', touch: 'Lay more blocks to make the way longer, then tap <b>Wave!</b> Blocks lock when it starts.', done: (S) => S.wave >= 1 },
	{ key: 'After each wave: gold, a <b>reward</b> to pick, and 3 new cards. Bonus blocks make the figurine on them stronger.', touch: 'After each wave: gold, a <b>reward</b> to pick, and 3 new cards. Bonus blocks make the figurine on them stronger.', done: (S) => S.cleared >= 1 && !S.pick },
];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** ctx: { P, B, data, $, sfx, toast, banner, buildScene, rebuildOverlay, placeCam, setZoom, follow, stepFor, setMenu, menuMove,
 *  menuPick, pop, moveFx, fx(effect), shake(n), onOver(run) } */
export function createTdMode(ctx) {
	const { P, B, data, $ } = ctx;
	const T = { S: null, mode: 'play', map: null, seed: null, squad: [], inputs: [], speed: 1, paused: false, acc: 0, bar: null, lastSfx: 0, shownOver: false, drv: null, rec: null, marks: [], target: 0, best: 0 };
	const nameOf = (sp) => (data.species[sp] || {}).name || sp;
	const moveName = (id) => (data.moves[id] || {}).name || id;
	const unit = (uid) => T.S.B.units.find((u) => u.uid === uid) || null;
	const towerAt = (x, y) => T.S.towers.find((t) => t.x === x && t.y === y) || null;
	const stopped = () => T.paused || !!P.menu || !T.S || !!T.S.over;
	const playing = () => T.mode === 'play';
	// ---- Maze Builder: the card in hand, its ghost on the board
	const maze = () => !!T.S && T.S.mode === 'maze';
	const building = () => maze() && playing() && T.S.phase === 'wait' && !T.S.over;
	const cardSel = () => (building() && T.card ? T.S.hand.find((c) => c.id === T.card) || null : null);
	const blockAt = (x, y) => (maze() ? T.S.blocks.find((b) => b.cells.some(([cx, cy]) => cx === x && cy === y)) || null : null);
	/** The chosen card as it would lie at the pinned tile (or under the cursor): its tiles, why not, and the way it would give. */
	function ghost() {
		const c = cardSel(); if (!c) return null;
		const at = T.pin || P.cursor, why = TD.blockWhy(T.S, c.shape, T.turns, at.x, at.y);
		return { c, at, cells: cellsAt(c.shape, T.turns, at.x, at.y), why, ways: why ? null : TD.waysWith(T.S, c.shape, T.turns, at.x, at.y) };
	}
	const wayLen = (ways) => ways.map((p) => wayLength(p)).join(' + ');
	const pickCard = (id) => { T.card = id && id !== T.card ? id : null; T.turns = 0; T.pin = null; ctx.sfx.tab && ctx.sfx.tab(); draw(); };
	const turnCard = () => { T.turns = (T.turns + 1) % 4; T.pin = null; ctx.sfx.tab && ctx.sfx.tab(); draw(); };
	/** Z / a tap with a card chosen: the first puts the ghost (if it may go there), the second lays the block. */
	function ghostStep(x, y) {
		if (T.pin && T.pin.x === x && T.pin.y === y) return lay();
		T.pin = null; P.cursor = { x, y };
		const g = ghost();
		if (g.why) { ctx.sfx.error(); ctx.toast(g.why[0].toUpperCase() + g.why.slice(1)); draw(); return; }
		T.pin = { x, y }; ctx.sfx.press(); draw();
	}
	function lay() { const g = ghost(); if (!g) return; order({ t: 'block', card: g.c.id, turns: T.turns, x: g.at.x, y: g.at.y }); }
	/** The run so far, as a recipe (a replay, a broadcast, a save). */
	const recipe = () => tdRecipe({ seed: T.seed, mapId: T.map.id, squad: T.squad, startWave: T.startWave, inputs: T.inputs, end: T.S.tick, wave: T.S.cleared, over: T.S.over });
	/** This device's copy of the run in progress (a reload resumes it); cleared when it ends. */
	function save() { if (!playing() || !ctx.store) return; ctx.store(T.S.over ? null : { v: 1, recipe: recipe(), ts: Date.now() }); T.savedAt = T.S.tick; }
	/** Put a run (a new one, a re-run one) on the board. */
	/** How a maze's blocks are drawn (terrain3d.js `block` / `blockfree`): a terrain block keeps its water, lava, grass or ice. */
	const blockLook = (S) => () => { const W = S.B.map.w, out = {}; for (const b of S.blocks) if (!(BONUS[b.bonus] || {}).ground) for (const [x, y] of b.cells) out[y * W + x] = b.locked ? 'block' : 'blockfree'; return out; };
	function adopt(S) { P.groundOver = S.mode === 'maze' ? blockLook(S) : null; T.S = S; P.S = S.B; P.disp = { units: {}, geo: S.B.geo }; T.ghost = {}; T.gone = {}; if (S.mode === 'maze' && T.shown) ctx.buildScene(S.B.map); }   // (a maze's blocks are part of the ground)

	// ---- orders: applied now, written down with their tick
	function order(a, quiet) {
		const why = TD.applyInput(T.S, a, data);
		if (why) { if (!quiet) { ctx.sfx.error(); ctx.toast(why[0].toUpperCase() + why.slice(1)); } return why; }
		T.inputs.push([T.S.tick, a]);
		if (maze()) { T.pin = null; if (T.card && !T.S.hand.some((c) => c.id === T.card)) T.card = null; }
		play(T.S.ev); T.S.ev = [];
		sync(); draw(); save();
		return null;
	}

	// ---- the sim's events, shown
	function play(evs) {
		const D = P.disp, now = performance.now() / 1000;
		for (const e of evs) {
			const u = e.uid && D.units[e.uid];
			if (e.t === 'use' && u) { u.anim = 'Attack'; u.t0 = now; ctx.moveFx(e, u); if (now - T.lastSfx > 0.12) { T.lastSfx = now; ctx.sfx.card && ctx.sfx.card(); } }
			else if (e.t === 'hit' && D.units[e.target]) { const v = D.units[e.target]; v.flash = 1; v.hurt = now; ctx.pop(e.target, '-' + e.dmg, e.crit ? '#ff7a5a' : e.eff > 1 ? '#ffd23c' : e.eff > 0 && e.eff < 1 ? '#b8c2c6' : '#ffffff'); ctx.fx({ k: 'impact', at: [v.wx ? v.wx[0] : v.x, v.wx ? v.wx[1] : v.y], t: 0, dur: 0.25, color: '#ffffff' }); }
			else if (e.t === 'hurt' && u) ctx.pop(e.uid, '-' + e.n, '#c8a0ff');
			else if (e.t === 'miss' && e.target) ctx.pop(e.target, 'Miss', '#cccccc');
			else if (e.t === 'immune') ctx.pop(e.uid, 'Immune', '#cccccc');
			else if (e.t === 'status' && u) ctx.pop(e.uid, e.st.toUpperCase(), '#e0b36b');
			else if (e.t === 'confused' && u) ctx.pop(e.uid, 'CONFUSED', '#e0b36b');
			else if (e.t === 'shook' && u) ctx.pop(e.uid, 'Shook it off', '#cccccc');
			else if (e.t === 'sp' && u) ctx.pop(e.uid, '+' + e.n + ' SP', '#7cd0ff');
			else if (e.t === 'boost' && u) ctx.pop(e.uid, Object.entries(e.changes).map(([k, d]) => (d > 0 ? '+' : '') + d + ' ' + k.toUpperCase()).join(' '), Object.values(e.changes)[0] > 0 ? '#7cf08a' : '#e0b36b');
			else if (e.t === 'fell') { const g = T.ghost[e.uid]; if (g) ctx.fx({ k: 'ring', at: g, r: 1, t: 0, dur: 0.4, color: e.boss ? '#ffd23c' : '#ffffff' }); if (e.boss) { ctx.banner('Boss down!'); ctx.sfx.coin && ctx.sfx.coin(); } }
			else if (e.t === 'leak') { ctx.shake(0.5); ctx.sfx.error(); ctx.toast('One got through: ' + e.lives + ' lives left'); }
			else if (e.t === 'wave') { ctx.banner(e.boss ? 'Wave ' + e.n + ' · BOSS' : 'Wave ' + e.n); if (maze()) ctx.buildScene(T.S.B.map); }   // (a maze's blocks lock: they look it)
			else if (e.t === 'clear') { ctx.sfx.coin && ctx.sfx.coin(); ctx.toast('Wave ' + e.n + ' cleared · PP refilled' + (e.slots > T.slotsSeen ? ' · a new slot!' : '')); T.slotsSeen = e.slots; if (maze() && playing()) { T.clearedNow = true; if (T.S.pick) openPick(); } }
			else if (e.t === 'block' || e.t === 'unblock') { ctx.buildScene(T.S.B.map); ctx.sfx.card && ctx.sfx.card(); }
			else if (e.t === 'weather') ctx.toast(e.kind ? 'Weather: ' + e.kind : 'The weather cleared');
			else if (e.t === 'terrain') ctx.rebuildOverlay();
			else if (e.t === 'over') over();
		}
	}

	// ---- the board's units, as the page draws them: towers stand, enemies walk between the path's tiles
	function sync() {
		const S = T.S, D = P.disp, now = performance.now() / 1000, seen = new Set();
		for (const t of S.towers) {
			const u = unit(t.uid); seen.add(t.uid);
			const d = D.units[t.uid] || (D.units[t.uid] = { anim: 'Idle', t0: 0, flash: 0 });
			d.x = t.x; d.y = t.y; d.wx = null; d.hp = u.maxHP; d.facing = u.facing; d.alive = true; d.nobar = true;
			if (d.anim === 'Attack' && now - d.t0 > 0.45) d.anim = 'Idle';
		}
		for (const e of S.enemies) {
			const u = unit(e.uid); seen.add(e.uid);
			const d = D.units[e.uid] || (D.units[e.uid] = { anim: 'Walk', t0: 0, flash: 0 });
			const p = S.paths[e.gate] || S.paths[0], f = Math.min(p.length - 1, e.d / TD.SUB), i = Math.min(p.length - 2, Math.floor(f)), k = f - i;
			const a = p[i], b = p[i + 1];
			d.wx = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
			d.x = u.x; d.y = u.y; d.hp = u.hp; d.facing = u.facing; d.alive = true;
			d.anim = d.hurt && now - d.hurt < 0.25 ? 'Hurt' : S.tick < e.stop ? 'Idle' : 'Walk';
			T.ghost[e.uid] = d.wx;
		}
		for (const uid of Object.keys(D.units)) if (!seen.has(uid)) delete D.units[uid];
		// (T.ghost: where each enemy was last drawn, for its knockout ring; forgotten once it is gone and the ring has started)
		for (const uid of Object.keys(T.ghost)) if (!seen.has(uid)) { if (T.gone[uid]) { delete T.ghost[uid]; delete T.gone[uid]; } else T.gone[uid] = 1; }
	}

	// ---- the bar
	function bar() {
		if (T.bar) return T.bar;
		const el = document.createElement('div');
		el.id = 'pt-td'; el.className = 'bal-panel pt-td'; el.hidden = true;
		el.addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-act]'); if (!b) return;
			ctx.sfx.press();
			if (b.dataset.act === 'coach-skip') { coachDone(); drawBar(); }
			else if (b.dataset.act === 'w-start') wStart();
			else if (b.dataset.act === 'w-prev') wJump(Math.max(T.rec.startWave, T.S.wave - 1));
			else if (b.dataset.act === 'w-next') wJump(T.S.wave + 1);
			else if (b.dataset.act === 'w-play') togglePause();
			else if (b.dataset.act === 'w-clip') ctx.clip && ctx.clip(Math.max(1, T.S.wave));
			else if (b.dataset.act === 'pause') togglePause();
			else if (b.dataset.act === 'speed') nextSpeed();
			else if (b.dataset.act === 'wave') callWave();
			else if (b.dataset.act === 'menu') openField();
			else if (b.dataset.act === 'card') pickCard(b.dataset.id);
			else if (b.dataset.act === 'turn') turnCard();
			else if (b.dataset.act === 'lay') { if (T.pin) lay(); else ghostStep(P.cursor.x, P.cursor.y); }
			else if (b.dataset.act === 'draw') order({ t: 'draw' });
			else if (b.dataset.act === 'discard') { if (T.card) order({ t: 'discard', card: T.card }); }
			else if (b.dataset.act === 'reward') openPick();
		});
		document.body.appendChild(el);
		return (T.bar = el);
	}
	// ---- the first run's coach: a row in the bar, one step at a time
	const touchy = () => { try { return !!ctx.touch || matchMedia('(pointer: coarse)').matches; } catch { return false; } };
	const coachKey = () => (maze() ? COACH_MZ_KEY : COACH_KEY), coachList = () => (maze() ? COACH_MZ : COACH);
	const coachSeen = (key = COACH_KEY) => { try { return localStorage.getItem(key) === 'done'; } catch { return true; } };
	const coachDone = () => { const key = coachKey(); T.coach = null; try { localStorage.setItem(key, 'done'); } catch { /* shown again next time */ } };
	function coachRow() {
		if (!playing() || T.coach == null || T.S.over) return '';
		const LIST = coachList();
		while (T.coach < LIST.length && LIST[T.coach].done(T.S, T)) T.coach++;
		if (T.coach >= LIST.length) { coachDone(); return ''; }
		const c = LIST[T.coach];
		return `<div class="pt-mm-coach" id="td-coach"><span class="bal-badge bal-orange">${T.coach + 1}/${LIST.length}</span><span>${touchy() ? c.touch : c.key}</span><button class="bal-btn bal-sm bal-grey" data-act="coach-skip">Skip</button></div>`;
	}
	/** Maze Builder's row: the hand (each card a button), and what the chosen card can do. */
	function handRow(v, key) {
		if (!building()) return '';
		const sel = cardSel();
		const cards = v.hand.map((c) => `<button class="bal-btn bal-sm pt-mz-card ${sel && sel.id === c.id ? 'bal-orange is-on' : c.bonus ? 'bal-purple' : 'bal-grey'}" data-act="card" data-id="${c.id}" aria-pressed="${sel && sel.id === c.id}" aria-label="${esc(SHAPE_NAME[c.shape])}${c.bonus ? ', ' + esc(BONUS[c.bonus].name) : ''}">${glyph(c.shape, sel && sel.id === c.id ? T.turns : 0)}${c.bonus ? '<small>' + esc(BONUS[c.bonus].name) + '</small>' : ''}</button>`).join('');
		const acts = sel ? `<button class="bal-btn bal-sm bal-blue" data-act="turn">⟳ Turn ${key('C')}</button><button class="bal-btn bal-sm bal-green" data-act="lay">✓ ${T.pin ? 'Lay it' : 'Put it'} ${key('Z')}</button><button class="bal-btn bal-sm bal-grey" data-act="discard">Discard +${GOLD.discard}●</button>`
			: `<button class="bal-btn bal-sm bal-gold" data-act="draw" ${v.hand.length >= v.handMax || v.gold < v.drawCost ? 'disabled' : ''}>Draw ${v.drawCost}●</button>`;
		return `<div class="pt-td-row pt-mz-hand" id="td-hand">${cards || '<span class="bal-muted">No cards</span>'}${v.hand.length ? key('V') : ''}${acts}${v.pick ? '<button class="bal-btn bal-sm bal-orange" data-act="reward">★ Reward</button>' : ''}</div>`;
	}
	function drawBar() {
		const v = TD.view(T.S), el = bar(), mz = v.mode === 'maze';
		const wave = v.phase === 'wave' ? `Wave ${v.wave}${TD.isBossWave(v.wave) ? ' · BOSS' : ''} <span class="bal-muted">${v.left} left</span>` : mz ? `Next: wave ${v.wave + 1} <span class="bal-muted">when you call it</span>` : `Next: wave ${v.wave + 1} <span class="bal-muted">in ${Math.ceil(v.nextIn / TD.TPS)}s</span>`;
		const key = (k) => `<span class="bal-key">${k}</span>`;
		const purse = mz ? `<span class="bal-badge bal-gold" id="td-gold">● ${v.gold}</span>` : `<span class="bal-badge bal-gold" id="td-energy">⚡ ${v.energy}</span>`;
		const wayBadge = mz ? `<span class="bal-badge bal-grey" id="td-way">Way ${wayLen(v.ways)}</span>` : '';
		const top = `<div class="pt-td-row"><span class="bal-badge bal-blue" id="td-wave">${wave}</span><span class="bal-badge bal-red" id="td-lives">♥ ${v.lives}</span>${purse}<span class="bal-badge bal-purple" id="td-slots">${v.towers.length}/${v.slots} towers</span>${wayBadge}${v.weather ? `<span class="bal-badge bal-grey">${esc(v.weather)}</span>` : ''}</div>`;
		if (!playing()) {
			const w = T.mode === 'watch' ? `<div class="pt-td-row"><button class="bal-btn bal-sm bal-grey" data-act="w-start" aria-label="Back to the start">⏮ ${key('X')}</button><button class="bal-btn bal-sm bal-blue" data-act="w-prev" aria-label="The wave before">◀</button><button class="bal-btn bal-sm bal-orange" data-act="w-play">${T.paused || T.ended ? '▶ Play' : '⏸ Pause'} ${key('Z')}</button><button class="bal-btn bal-sm bal-blue" data-act="w-next" aria-label="The next wave">▶</button><button class="bal-btn bal-sm bal-blue" data-act="speed">${T.speed}× ${key('C')}</button><button class="bal-btn bal-sm bal-grey" data-act="w-clip">🔗 ${key('V')}</button></div>`
				: `<div class="pt-td-row"><span class="bal-muted" id="td-follow">${esc(T.followSay || 'Watching live')}</span></div>`;
			const h2 = top + w;
			if (el.dataset.h !== h2) { el.innerHTML = h2; el.dataset.h = h2; }
			el.hidden = false;
			return;
		}
		const html = top + `
			<div class="pt-td-row"><button class="bal-btn bal-sm ${T.paused ? 'bal-orange' : 'bal-grey'}" data-act="pause">${T.paused ? '▶ Resume' : '⏸ Pause'}</button><button class="bal-btn bal-sm bal-blue" data-act="speed">${T.speed}× ${key('C')}</button><button class="bal-btn bal-sm bal-green" data-act="wave" ${v.phase === 'wait' && !v.over ? '' : 'disabled'}>Wave! ${mz ? '' : key('V')}</button><button class="bal-btn bal-sm bal-purple" data-act="menu">Menu ${key('⏎')}</button></div>`;
		const full = html + (mz ? handRow(v, key) : '') + coachRow();
		if (el.dataset.h !== full) { el.innerHTML = full; el.dataset.h = full; }
		el.hidden = false;
	}
	/** Highlights: the cursor's tower shows its reach; a free tile shows it can be built on. */
	function draw() {
		const S = T.S, t = towerAt(P.cursor.x, P.cursor.y) || (T.sel && S.towers.find((x) => x.uid === T.sel));
		// (Maze Builder: the way is drawn, as it is or as the ghost block would make it; the ghost green or red; blocks that can still be taken back in blue)
		const g = maze() ? ghost() : null, M = S.B.map;
		const mazeHl = () => { const ways = (g && g.ways) || S.paths, out = []; for (const p of ways) for (const [x, y] of p.slice(1)) out.push([x, y, MZ_WAY]); if (building()) for (const b of S.blocks) if (!b.locked) for (const [x, y] of b.cells) out.push([x, y, MZ_LOOSE]); if (g) for (const [x, y] of g.cells) if (x >= 0 && y >= 0 && x < M.w && y < M.h) out.push([x, y, g.why ? MZ_BAD : MZ_OK]); return out; };
		const extra = [...(maze() ? mazeHl() : []), ...S.paths.map((p) => [p[0][0], p[0][1], 0xfe5f55])];
		if (!playing()) { P.hl = { aim: t ? TD.towerReach(S, t.uid, data) : [], extra }; ctx.rebuildOverlay(); drawBar(); $('hint').innerHTML = ''; return; }
		P.hl = { aim: t && !g ? TD.towerReach(S, t.uid, data) : [], extra };
		ctx.rebuildOverlay();
		drawBar();
		if (g) { $('hint').innerHTML = `<b>${esc(SHAPE_NAME[g.c.shape])}${g.c.bonus ? ' · ' + esc(BONUS[g.c.bonus].name) : ''}</b>${g.c.bonus ? ' <span class="bal-muted">' + esc(BONUS[g.c.bonus].text) + '</span>' : ''} · ${g.why ? '<span class="pt-mz-bad">' + esc(g.why[0].toUpperCase() + g.why.slice(1)) + '</span>' : 'Way ' + wayLen(S.paths) + ' → <b>' + wayLen(g.ways) + '</b>'} · <span class="bal-muted">${T.pin ? 'Z again: lay it · X: move it' : 'Z: put it here · C: turn · X: back'}</span>`; return; }
		if (maze() && !t && !S.over) { const b = blockAt(P.cursor.x, P.cursor.y), high = M.height[P.cursor.y * M.w + P.cursor.x] > 0; const foe2 = S.enemies.some((e) => { const v = unit(e.uid); return v && v.x === P.cursor.x && v.y === P.cursor.y; }); if (!foe2) { $('hint').innerHTML = high ? `Z: place a figurine here (${placeCost(S.towers.length)}●)${b && building() ? (b.locked ? ' · or lift this block (' + GOLD.lift + '●)' : ' · X: take this block back') : ''}${b && b.bonus ? ' · <b>' + esc(BONUS[b.bonus].name) + '</b> <span class="bal-muted">' + esc(BONUS[b.bonus].text) + '</span>' : ''}` : building() ? (S.hand.length ? 'V: choose a block card, then lay it to bend the way. Figurines stand on blocks.' : 'No cards: draw one, or call the wave.') : 'Figurines stand on blocks.'; return; } }
		const free = !t && !TD.placeBlock(S, firstFree(), P.cursor.x, P.cursor.y);
		// (what the cursor is on, said in full: a tower's level, SP and how often each move fires; an enemy's level and HP)
		const foe = !t && S.enemies.map((e) => ({ e, v: unit(e.uid) })).filter((o) => o.v && o.v.hp > 0 && o.v.x === P.cursor.x && o.v.y === P.cursor.y).sort((a, b) => b.e.d - a.e.d)[0];
		const towerSay = (u) => `<b>${esc(nameOf(u.species))}</b> Lv ${u.level} · SP ${u.sp}/${u.maxSP} · ${u.fig.equipped.map((mid) => { const m = B.moveOf(u, mid, data), k = m ? tdKind(mid, m) : 'none'; return esc(moveName(mid)) + (k === 'none' ? ' (no use here)' : ' ' + (TD.cooldownTicks(u, m) / TD.TPS).toFixed(1) + 's'); }).join(', ')} · <span class="bal-muted">Z: its orders</span>`;
		$('hint').innerHTML = S.over ? '' : t ? towerSay(unit(t.uid)) : foe ? `<b>${esc(nameOf(foe.v.species))}</b> Lv ${foe.v.level}${foe.e.boss ? ' · BOSS' : ''} · HP ${foe.v.hp}/${foe.v.maxHP}${foe.v.status ? ' · ' + foe.v.status.toUpperCase() : ''}` : free ? 'Z: place a figurine here' : TD.freeSlots(S) > 0 && firstFree() >= 0 ? 'Move to a free tile off the road to place a figurine' : '';
	}
	const firstFree = () => T.squad.findIndex((_, i) => !T.S.placed[i]);

	// ---- time
	function togglePause() { T.paused = !T.paused; drawBar(); }
	function nextSpeed() { T.speed = T.mode === 'watch' ? WATCH_SPEEDS[(WATCH_SPEEDS.indexOf(T.speed) + 1) % WATCH_SPEEDS.length] : T.speed % 3 + 1; ctx.sfx.tab && ctx.sfx.tab(); drawBar(); }
	function callWave() { if (T.S.phase !== 'wait') { ctx.sfx.error(); ctx.toast('A wave is under way'); return; } if (T.S.pick) { openPick(); return; } T.card = null; T.pin = null; order({ t: 'call' }); T.paused = false; drawBar(); }
	/** Called every frame by the page: real time into ticks. */
	function frame(dt) {
		if (!T.S) return;
		if (T.mode === 'watch') { watchFrame(dt); sync(); return; }
		if (T.mode === 'follow') { followFrame(dt); sync(); return; }
		if (!stopped()) {
			T.acc += Math.min(0.1, dt) * T.speed;
			let n = 0;
			while (T.acc >= TICK && n < MAX_STEPS && !T.S.over) { TD.step(T.S, [], data); play(T.S.ev); T.acc -= TICK; n++; }
			if (n === MAX_STEPS) T.acc = 0;
			if (n) drawBar();
			// (Maze Builder: a cleared wave is saved at once, so a reload comes back to the build phase and its reward pick, not to a moment before)
			if (T.clearedNow) { T.clearedNow = false; save(); }
			if (T.S.tick - (T.savedAt || 0) >= SAVE_EVERY) save();
		}
		sync();
	}

	// ---- watch: a replay
	const note = (evs) => { for (const e of evs) if (e.t === 'wave' && !T.marks.some((m) => m.wave === e.n)) T.marks.push({ wave: e.n, m: T.drv.mark() }); };
	function watchFrame(dt) {
		if (T.paused || T.ended) return;
		T.acc += Math.min(0.1, dt) * T.speed;
		let n = 0;
		while (T.acc >= TICK && n < MAX_STEPS * 4 && !T.ended) {
			const ev = T.drv.step(); T.acc -= TICK; n++;
			if (T.drv.S !== T.S) adopt(T.drv.S);
			note(ev); play(ev);
			if (T.S.over || T.S.tick >= T.rec.end) { const ev2 = T.drv.settle(); play(ev2); T.ended = true; ctx.toast(T.S.over ? 'The run ended on wave ' + T.S.cleared : 'End of the replay'); }
		}
		if (n) drawBar();
	}
	/** Jump to the start of a wave (no animation): from the nearest wave start already seen, or from the beginning. */
	function wJump(w) {
		const rec = T.rec;
		w = Math.max(rec.startWave, w | 0);
		const from = T.marks.filter((m) => m.wave <= w).sort((a, b) => b.wave - a.wave)[0];
		if (from) T.drv.restore(from.m); else { T.drv = tdDriver(rec, data); T.marks = []; }
		T.ended = false;
		while (T.drv.S.wave < w && T.drv.S.tick < rec.end && !T.drv.S.over) note(T.drv.step());
		if (T.drv.S.tick >= rec.end || T.drv.S.over) { T.drv.settle(); T.ended = true; }
		adopt(T.drv.S); T.acc = 0;
		sync(); draw();
		ctx.banner(T.ended ? 'The end' : 'Wave ' + Math.max(1, T.S.wave));
	}
	/** Back to the very start of the run (before any order), paused. */
	function wStart() { T.drv = tdDriver(T.rec, data); T.ended = false; T.acc = 0; T.paused = true; adopt(T.drv.S); sync(); draw(); ctx.banner('The start · paused'); }
	/** A replay: the recipe re-run, with the viewer's controls. opts: { wave (start there) } */
	function watch(rec, opts = {}) {
		const map = tdMapById(rec.map);
		if (!map) return false;
		enter('watch', map, rec.seed, rec.squad, rec.startWave);
		T.rec = rec; T.drv = tdDriver(rec, data); T.marks = []; T.ended = false; T.inputs = rec.inputs;
		adopt(T.drv.S);
		show(map);
		if (opts.wave > rec.startWave) wJump(opts.wave);
		ctx.banner(rec.label || 'Replay');
		return true;
	}

	// ---- follow: a friend's live run. snap: { td: 1, head: { seed, map, squad, startWave }, inputs, tick, hash, over }
	function follow(snap, say) {
		const head = snap.head, map = head && tdMapById(head.map);
		if (!map) return false;
		T.followSay = say || T.followSay;
		const rec = { ...head, inputs: snap.inputs };
		if (T.mode !== 'follow' || !T.drv || T.seed !== head.seed) {
			enter('follow', map, head.seed, head.squad, head.startWave);
			T.rec = rec; T.drv = tdDriver(rec, data);
			T.drv.to(Math.max(0, snap.tick - FOLLOW_LAG));   // (joining late: straight to just behind where they are)
			adopt(T.drv.S);
			show(map);
		} else { T.rec = rec; T.drv.setInputs(snap.inputs); }
		T.target = snap.tick; T.targetHash = snap.hash; T.remoteOver = snap.over || null;
		drawBar();
		return true;
	}
	function followFrame(dt) {
		const S = T.S, behind = T.target - S.tick;
		if (behind > 0 && !S.over) {
			// (keep about a second and a half behind; further back, catch up faster)
			T.acc += Math.min(0.1, dt) * Math.max(1, Math.min(8, behind / FOLLOW_LAG));
			let n = 0;
			while (T.acc >= TICK && n < MAX_STEPS * 4 && T.S.tick < T.target && !T.S.over) { play(T.drv.step()); T.acc -= TICK; n++; }
			if (n) drawBar();
		}
		if (T.S.tick === T.target) {
			const ev = T.drv.settle(); if (ev.length) { play(ev); drawBar(); }
			// both devices run the same sim: the same tick must be the same state. If not, run it again from the start.
			if (T.targetHash && T.checked !== T.target + ':' + T.targetHash) {
				T.checked = T.target + ':' + T.targetHash;
				if (TD.hashOf(T.S) !== T.targetHash) { T.drv = tdDriver(T.rec, data); T.drv.to(T.target); adopt(T.drv.S); T.resyncs = (T.resyncs || 0) + 1; sync(); draw(); }
			}
		}
	}

	// ---- shared setup
	function enter(mode, map, seed, squad, startWave) {
		T.mode = mode; T.map = map; T.seed = seed; T.squad = squad; T.startWave = startWave || 1;
		T.speed = 1; T.paused = false; T.acc = 0; T.shownOver = false; T.sel = null; T.ended = false; T.savedAt = 0; T.checked = null;
		T.card = null; T.turns = 0; T.pin = null; T.shown = false;
		P.screen = 'td'; P.mode = 'td'; P.menu = null; P.sel = null;
		P.setup = null; P.actions = []; P.anims = []; P.busy = false; P.teamMap = null; P.online = null;
		document.body.classList.add('pt-tding');
		$('result').hidden = true;
	}
	function show(map) {
		ctx.buildScene(P.S.map);
		P.cursor = { x: T.S.paths[0][0][0], y: T.S.paths[0][0][1] };
		T.shown = true;
		ctx.placeCam(); ctx.setZoom(typeof innerWidth === 'number' && innerWidth < 600 ? 1.3 : 1);   // (a phone starts closer: the whole board at once is too small to tap)
		T.slotsSeen = TD.slotsOf(T.S);
		sync(); draw();
	}

	// ---- menus (the battle's own command window; while one is open the game is paused)
	const closeMenu = () => { P.mode = 'td'; T.sel = null; ctx.setMenu(null); draw(); };
	// ---- Maze Builder's menus
	/** A block or a rock: place a figurine on it (for gold), or take the block back / lift it. */
	function openBlockTile(x, y) {
		const S = T.S, b = blockAt(x, y), cost = placeCost(S.towers.length), done = (a) => () => { ctx.setMenu(null); P.mode = 'td'; order(a); };
		P.mode = 'td-menu';
		const items = T.squad.map((f, i) => (S.placed[i] ? null : { label: `${esc(nameOf(f.species))} <small>Lv ${f.level} · ${f.equipped.map((m) => esc(moveName(m))).join(', ')}</small>`, color: 'bal-blue', off: S.gold < cost && 'Not enough gold', go: done({ t: 'place', fig: i, x, y }) })).filter(Boolean);
		if (b && building()) items.push(b.locked ? { label: `Lift this block <small>back to your hand · ${GOLD.lift}●</small>`, color: 'bal-gold', off: S.gold < GOLD.lift && 'Not enough gold', go: done({ t: 'lift', id: b.id }) } : { label: 'Take this block back <small>free until the wave is called</small>', color: 'bal-orange', go: done({ t: 'unblock', id: b.id }) });
		items.push({ label: 'Cancel', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, `Place here · ${cost}● (you have ${S.gold}●)`);
	}
	/** The rewards for the wave just cleared: pick one (after a boss wave, two). */
	function openPick() {
		const S = T.S; if (!S.pick) return;
		P.mode = 'td-menu';
		const after = () => { if (T.S.pick) openPick(); };
		const say = (o) => (o.k === 'bonus' ? `${glyph(o.shape)} ${esc(BONUS[o.bonus].name)} block <small>${esc(BONUS[o.bonus].text)}</small>` : o.k === 'gold' ? `${o.n}● <small>gold</small>` : o.k === 'cards' ? 'Two plain blocks <small>you choose the shapes</small>' : '♥ One life back');
		const items = S.pick.opts.map((o, i) => (o ? { label: say(o), color: o.k === 'bonus' ? 'bal-purple' : o.k === 'gold' ? 'bal-gold' : o.k === 'life' ? 'bal-red' : 'bal-blue', go: () => { if (o.k === 'cards') return openShapes(i, []); ctx.setMenu(null); P.mode = 'td'; order({ t: 'pick', i }); after(); } } : null)).filter(Boolean);
		items.push({ label: 'Decide later <small>the next wave waits for it</small>', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, `Wave ${S.cleared} cleared · pick ${S.pick.pick === 1 ? 'a reward' : S.pick.pick + ' rewards'}`);
	}
	function openShapes(i, got) {
		P.mode = 'td-menu';
		const items = Object.keys(SHAPES).map((sh) => ({ label: `${glyph(sh)} ${esc(SHAPE_NAME[sh])}`, color: 'bal-blue', go: () => { const next = [...got, sh]; if (next.length < 2) return openShapes(i, next); ctx.setMenu(null); P.mode = 'td'; order({ t: 'pick', i, shapes: next }); if (T.S.pick) openPick(); } }));
		items.push({ label: 'Back', color: 'bal-grey', go: openPick });
		ctx.setMenu(items, got.length ? 'The second block' : 'The first block');
	}
	function openPlace(x, y) {
		const S = T.S;
		if (maze()) { if (S.B.map.height[y * S.B.map.w + x] > 0) { if (firstFree() < 0 && !blockAt(x, y)) { ctx.sfx.error(); ctx.toast('Every figurine is on the board'); return; } return openBlockTile(x, y); } ctx.sfx.error(); ctx.toast(building() ? 'Figurines stand on blocks: choose a card and lay one' : 'Figurines stand on blocks'); return; }
		if (S.onPath[y * S.B.map.w + x]) { ctx.sfx.error(); ctx.toast('That is the road: place figurines beside it'); return; }
		const why = TD.placeBlock(S, Math.max(0, firstFree()), x, y);
		if (firstFree() < 0) { ctx.sfx.error(); ctx.toast('Every figurine is on the board'); return; }
		if (why && why !== 'already on the board') { ctx.sfx.error(); ctx.toast(why[0].toUpperCase() + why.slice(1)); return; }
		P.mode = 'td-menu';
		const items = T.squad.map((f, i) => (S.placed[i] ? null : { label: `${esc(nameOf(f.species))} <small>Lv ${f.level} · ${f.equipped.map((m) => esc(moveName(m))).join(', ')}</small>`, color: 'bal-blue', go: () => { ctx.setMenu(null); P.mode = 'td'; order({ t: 'place', fig: i, x, y }); } })).filter(Boolean);
		items.push({ label: 'Cancel', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, `Place here · ${TD.freeSlots(S)} slot${TD.freeSlots(S) === 1 ? '' : 's'} free`);
	}
	function openTower(t, focus = 0) {
		const S = T.S, u = unit(t.uid), mz = maze(), E = mz ? S.gold : S.energy, coin = mz ? '●' : ' ⚡', short = mz ? 'Not enough gold' : 'Not enough energy';
		P.mode = 'td-menu'; T.sel = t.uid; T.sawOrders = true;
		const re = (i) => () => { const again = S.towers.find((x) => x.uid === t.uid); if (again) openTower(again, i); else closeMenu(); };
		const items = [];
		items.push({ label: `Target: <b>${RULE_NAME[t.rule]}</b>`, color: 'bal-blue', go: () => { order({ t: 'rule', uid: t.uid, rule: TD.RULES[(TD.RULES.indexOf(t.rule) + 1) % TD.RULES.length] }); re(0)(); } });
		u.fig.equipped.forEach((mid, k) => {
			const m = B.moveOf(u, mid, data), kind = m ? tdKind(mid, m) : 'none', off = !!t.off[mid];
			const cd = Math.max(0, (t.cd[mid] || 0) - S.tick);
			items.push({ label: `${off ? '☐' : '☑'} ${esc(moveName(mid))} <small>${kind === 'none' ? KIND_SAY.none : `${KIND_SAY[kind] ? KIND_SAY[kind] + ' · ' : ''}SP ${m.spCost} · PP ${u.pp[mid]} · ${(TD.cooldownTicks(u, m) / TD.TPS).toFixed(1)}s${cd ? ' (ready in ' + (cd / TD.TPS).toFixed(1) + 's)' : ''}`}</small>`, color: kind === 'none' ? 'bal-grey' : off ? 'bal-grey' : 'bal-green', off: kind === 'none' && 'It has no effect in Tower Defense', go: () => { order({ t: 'toggle', uid: t.uid, move: mid }); re(1 + k)(); } });
		});
		if (u.lift) {
			const near = S.enemies.map((e) => ({ e, v: unit(e.uid) })).filter((o) => !o.e.boss && Math.abs(o.v.x - u.x) + Math.abs(o.v.y - u.y) === 1).sort((a, b) => b.e.d - a.e.d)[0];
			const wait = Math.max(0, t.throwCd - S.tick);
			items.push({ label: `Throw <small>${wait ? 'ready in ' + Math.ceil(wait / TD.TPS) + 's' : near ? 'the ' + esc(nameOf(near.v.species)) + ' beside it, back down the road' : 'no enemy beside it'}</small>`, color: 'bal-orange', off: (wait && 'Not ready yet') || (!near && 'No enemy stands next to it'), go: () => { order({ t: 'throw', uid: t.uid, target: near.e.uid }); closeMenu(); } });
		}
		const iRefill = items.length;
		items.push({ label: `Refill SP <small>${u.sp}/${u.maxSP} · ${TD.ENERGY.sp}${coin}</small>`, color: 'bal-gold', off: (u.sp >= u.maxSP && 'Its SP is full') || (E < TD.ENERGY.sp && short), go: () => { order({ t: 'spend', kind: 'sp', uid: t.uid }); re(iRefill)(); } });
		items.push({ label: `Overdrive <small>cooldowns halved for 10 s · ${TD.ENERGY.overdrive}${coin}</small>`, color: 'bal-gold', off: E < TD.ENERGY.overdrive && short, go: () => { order({ t: 'spend', kind: 'overdrive', uid: t.uid }); closeMenu(); } });
		if (!mz) items.push({ label: `Swap out now <small>the slot is free at once · ${TD.ENERGY.swap} ⚡</small>`, color: 'bal-gold', off: E < TD.ENERGY.swap && 'Not enough energy', go: () => { order({ t: 'spend', kind: 'swap', uid: t.uid }); closeMenu(); } });
		items.push({ label: mz ? `Recall <small>${S.phase === 'wait' && t.bp === S.wave ? t.cost : t.cost >> 1}● back</small>` : 'Recall <small>its slot rests 10 s</small>', color: 'bal-red', go: () => { order({ t: 'recall', uid: t.uid }); closeMenu(); } });
		items.push({ label: 'Close', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, `${nameOf(u.species)} Lv ${u.level} · SP ${u.sp}/${u.maxSP}`);
		if (focus) { P.menu.i = Math.min(focus, items.length - 1); ctx.menuMove(0); }
		draw();
	}
	function openField() {
		const S = T.S, mz = maze(), E = mz ? S.gold : S.energy, cost = TD.ENERGY.slot * (S.bought + 1), full = TD.slotsOf(S) >= TD.SQUAD_MAX;
		P.mode = 'td-menu';
		if (mz) {
			// (Maze Builder: the wave is called from here on a keyboard or a controller: Enter, then Z)
			const v = TD.view(S), wait = S.phase === 'wait';
			ctx.setMenu([
				wait ? { label: S.pick ? 'Pick your reward <small>the next wave waits for it</small>' : `Call wave ${S.wave + 1} <small>your blocks lock when it starts</small>`, color: 'bal-green', go: () => { ctx.setMenu(null); P.mode = 'td'; callWave(); } } : { label: 'Resume', color: 'bal-green', go: () => { T.paused = false; closeMenu(); } },
				...(wait ? [{ label: 'Keep building', color: 'bal-blue', go: () => { T.paused = false; closeMenu(); } }, { label: `Draw a card <small>${v.drawCost}●</small>`, color: 'bal-gold', off: (v.hand.length >= v.handMax && 'The hand is full') || (E < v.drawCost && 'Not enough gold'), go: () => { order({ t: 'draw' }); openField(); } }] : []),
				{ label: `Speed <small>${T.speed}×</small>`, color: 'bal-blue', go: () => { nextSpeed(); openField(); } },
				{ label: 'How to play', color: 'bal-grey', go: () => { closeMenu(); ctx.help(); } },
				{ label: 'Retire <small>end the run, keep what it earned</small>', color: 'bal-red', go: () => { ctx.setMenu([{ label: 'Retire', color: 'bal-red', go: () => { ctx.setMenu(null); P.mode = 'td'; order({ t: 'retire' }); } }, { label: 'Keep playing', color: 'bal-green', go: closeMenu }], 'Retire? The run ends at wave ' + S.cleared + '.'); P.menu.i = 1; ctx.menuMove(0); } },
			], `${wait ? 'Building' : 'Paused'} · wave ${S.wave || 1} · ♥ ${S.lives} · ${E}●`);
			return;
		}
		ctx.setMenu([
			{ label: 'Resume', color: 'bal-green', go: () => { T.paused = false; closeMenu(); } },
			{ label: `Speed <small>${T.speed}×</small>`, color: 'bal-blue', go: () => { nextSpeed(); openField(); } },
			{ label: `Call the next wave <small>${S.phase === 'wait' ? 'early: bonus energy' : 'a wave is under way'}</small>`, color: 'bal-green', off: S.phase !== 'wait' && 'A wave is under way', go: () => { ctx.setMenu(null); P.mode = 'td'; callWave(); } },
			{ label: `Open a slot <small>${full ? 'every slot is open' : cost + ' ⚡'}</small>`, color: 'bal-gold', off: (full && 'Every slot is open') || (E < cost && 'Not enough energy'), go: () => { order({ t: 'spend', kind: 'slot' }); openField(); } },
			{ label: 'How to play', color: 'bal-grey', go: () => { closeMenu(); ctx.help(); } },
			{ label: 'Retire <small>end the run, keep what it earned</small>', color: 'bal-red', go: () => { ctx.setMenu([{ label: 'Retire', color: 'bal-red', go: () => { ctx.setMenu(null); P.mode = 'td'; order({ t: 'retire' }); } }, { label: 'Keep playing', color: 'bal-green', go: closeMenu }], 'Retire? The run ends at wave ' + S.cleared + '.'); P.menu.i = 1; ctx.menuMove(0); } },
		], `Paused · wave ${S.wave || 1} · ♥ ${S.lives} · ⚡ ${E}`);
	}

	// ---- the end of a run
	function over() {
		if (T.shownOver) return;
		T.shownOver = true;
		ctx.setMenu(null); P.mode = 'td';
		drawBar();
		if (!playing()) return;
		save();
		ctx.onOver({ S: T.S, map: T.map, seed: T.seed, squad: T.squad, inputs: T.inputs, recipe: recipe(), record: T.S.cleared > T.best });
	}

	// ---- in and out
	/** A new run on a map with a squad (figurines, in order). opts: { seed, startWave } */
	function open(mapId, squad, opts = {}) {
		const map = typeof mapId === 'string' ? tdMapById(mapId) : mapId;
		if (!map || !squad.length) return false;
		// (the sim runs on the figurines as a recipe keeps them, so the live run and its replay are the very same run)
		enter('play', map, opts.seed || 'td-' + Date.now().toString(36), squad.slice(0, TD.SQUAD_MAX).map(slimFig), opts.startWave || 1);
		T.best = opts.best || 0; T.inputs = []; T.rec = null; T.drv = null;
		T.sawOrders = false; T.coach = opts.coach === false || coachSeen(isMazeMap(map) ? COACH_MZ_KEY : COACH_KEY) ? null : 0;   // (the first run of each kind on this device is coached)
		adopt(TD.newRun(T.seed, { map, squad: T.squad, startWave: T.startWave }, data));
		show(map);
		// (start the cursor on a free tile beside the road)
		if (isMazeMap(map)) { const p = T.S.paths[0], at = p[Math.min(3, p.length - 2)]; P.cursor = { x: at[0], y: at[1] }; }
		else { const S = T.S, W = S.B.map.w, H = S.B.map.h; let best = null; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!TD.placeBlock(S, 0, x, y)) { const d = Math.min(...map.paths[0].slice(0, 6).map(([px, py]) => Math.abs(px - x) + Math.abs(py - y))); if (!best || d < best.d) best = { d, x, y }; } if (best) P.cursor = { x: best.x, y: best.y }; }
		ctx.follow && ctx.follow();
		draw();
		ctx.banner(map.name);
		save();
		broadcast();
		return true;
	}
	/** A run saved on this device (a reload, a locked phone): re-run to its tick, and paused there. */
	function resume(saved, opts = {}) {
		const rec = saved && saved.recipe, map = rec && tdMapById(rec.map);
		if (!map) return false;
		enter('play', map, rec.seed, rec.squad, rec.startWave);
		T.best = opts.best || 0; T.inputs = rec.inputs.map(([t, a]) => [t, a]); T.rec = null; T.drv = null;
		adopt(tdRunTo(rec, rec.end, data));
		show(map);
		T.paused = true; drawBar();
		ctx.banner('Resumed · wave ' + Math.max(1, T.S.wave) + ' · paused');
		save();
		broadcast();
		return true;
	}
	/** A signed-in player's run goes live for friends: the recipe so far, the tick it stands on and its hash. */
	function broadcast() {
		if (!ctx.live) return;
		ctx.live(() => (T.S && playing() ? { td: 1, head: { seed: T.seed, map: T.map.id, squad: T.squad, startWave: T.startWave }, inputs: T.inputs, tick: T.S.tick, hash: TD.hashOf(T.S), over: T.S.over } : null),
			() => 'Poketactica · ' + (isMazeMap(T.map) ? 'Maze Builder' : 'Tower Defense') + ' · ' + T.map.name + ' · wave ' + Math.max(1, T.S ? T.S.wave : 1),
			// (a bet: does this run beat the map's best wave?)
			() => (T.S && playing() ? { run: T.seed, prog: T.S.cleared, res: T.S.over ? (T.S.cleared > T.best ? 'win' : 'lose') : null } : null));
	}
	function close() {
		if (T.S && playing() && !T.S.over) save();
		document.body.classList.remove('pt-tding');
		if (T.bar) T.bar.hidden = true;
		ctx.setMenu(null);
		P.hl = {}; T.S = null; P.groundOver = null;
	}
	/** A viewer's keys (a replay; a live run has none but the camera). */
	function onWatchAction(action, o = {}) {
		if (!T.S) return false;
		if (['up', 'down'].includes(action)) return true;
		if (T.mode !== 'watch') return ['left', 'right', 'confirm', 'cancel', 'secondary', 'context', 'menu'].includes(action);
		if (o.repeat) return true;
		if (action === 'confirm') { if (T.ended) wStart(); else togglePause(); return true; }
		if (action === 'left') { wJump(Math.max(T.rec.startWave, T.S.wave - 1)); return true; }
		if (action === 'right') { wJump(T.S.wave + 1); return true; }
		if (action === 'cancel') { wStart(); return true; }
		if (action === 'secondary') { nextSpeed(); return true; }
		if (action === 'context') { if (ctx.clip) ctx.clip(Math.max(1, T.S.wave)); return true; }
		return action === 'menu';
	}
	function onAction(action, o = {}) {
		if (!T.S) return false;
		if (!playing()) return onWatchAction(action, o);
		if (P.menu) {
			if (['up', 'down', 'left', 'right'].includes(action)) { ctx.menuMove(action === 'up' || action === 'left' ? -1 : 1); return true; }
			if (action === 'confirm') { if (!o.repeat) ctx.menuPick(); return true; }
			if (action === 'cancel' || action === 'menu') { if (!o.repeat) { T.paused = false; closeMenu(); } return true; }
			return true;
		}
		if (T.S.over) return false;
		if (['up', 'down', 'left', 'right'].includes(action)) {
			const [dx, dy] = ctx.stepFor(action), m = T.S.B.map;
			P.cursor = { x: Math.max(0, Math.min(m.w - 1, P.cursor.x + dx)), y: Math.max(0, Math.min(m.h - 1, P.cursor.y + dy)) };
			T.pin = null;   // (the ghost goes with the cursor again)
			ctx.follow(); draw(); return true;
		}
		if (maze()) {
			const sel = cardSel();
			if (action === 'confirm' && sel) { if (!o.repeat) ghostStep(P.cursor.x, P.cursor.y); return true; }
			if (action === 'cancel') {
				if (o.repeat) return true;
				if (T.pin) { T.pin = null; draw(); }
				else if (sel) pickCard(null);
				else { const b = building() && blockAt(P.cursor.x, P.cursor.y); if (b && !b.locked) order({ t: 'unblock', id: b.id }); }
				return true;
			}
			if (action === 'secondary' && sel) { if (!o.repeat) turnCard(); return true; }
			if (action === 'context') {
				if (o.repeat) return true;
				// V: the next card in the hand; after the last, none. (With no cards to choose, it calls the wave as on the Road.)
				if (building() && T.S.hand.length) { const h = T.S.hand, k = h.findIndex((c) => c.id === T.card); T.card = null; pickCard(k + 1 < h.length ? h[k + 1].id : null); if (k + 1 >= h.length) draw(); }
				else callWave();
				return true;
			}
		}
		if (action === 'confirm') { if (!o.repeat) act(P.cursor.x, P.cursor.y); return true; }
		if (action === 'cancel') return true;
		if (action === 'secondary') { if (!o.repeat) nextSpeed(); return true; }
		if (action === 'context') { if (!o.repeat) callWave(); return true; }
		if (action === 'menu') { if (!o.repeat) { ctx.sfx.press(); openField(); } return true; }
		return false;   // (Q / E: the page turns the board)
	}
	function act(x, y) { const t = towerAt(x, y); ctx.sfx.press(); if (t) openTower(t); else openPlace(x, y); }
	function tap(x, y) { if (!playing()) { P.cursor = { x, y }; draw(); return; } if (P.menu) { closeMenu(); return; } if (T.S.over) return; if (cardSel()) { ghostStep(x, y); return; } P.cursor = { x, y }; act(x, y); }
	return { open, resume, watch, follow, close, onAction, onWatchAction, tap, frame, order, recipe, T, get active() { return P.screen === 'td' && !!T.S; }, view: () => TD.view(T.S), hash: () => TD.hashOf(T.S) };
}
