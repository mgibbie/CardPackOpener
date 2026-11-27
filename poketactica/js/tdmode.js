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
import { BONUS, deckKinds, DECK_MIN } from './td/cards.js';
import { PASSIVES, heroById, rarityOf, pairsOf, pairWith, pairFor, PASSIVE_REV } from './td/heroes.js';
import { portraitImg } from './td/portraits.js';
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
// (the kind's PICTURE, on the card and wherever the kind is named: plan item B5. A card showed its shape and a coloured band.)
const BONUS_ICON = { tall: '⬆️', water: '💧', lava: '🔥', grass: '🌿', ice: '❄️', red: '⚔️', blue: '✨', purple: '🎯', beacon: '🔆', mud: '🟫', caltrops: '📌', bastion: '🏰', tidepool: '🌊', dynamo: '⚡', trellis: '🌱', dragonspire: '🐉', ninjaperch: '🥷', mindspire: '🔮' };
const bonusIcon = (k) => (BONUS_ICON[k] ? BONUS_ICON[k] + ' ' : '');
// (the card's band is narrow: the panels are named by their colour there; the whole name is in the hint and the label)
const bandName = (k) => BONUS[k].name.replace(/ panel$/, '');
const SHAPE_NAME = { one: '1 tile', two: '2 in a line', three: '3 in a line', corner: 'Corner', I: 'I', O: 'O', T: 'T', L: 'L', J: 'J', S: 'S', Z: 'Z' };
const MZ_WAY = 0xffd23c, MZ_OK = 0x4be07a, MZ_BAD = 0xfe5f55, MZ_LOOSE = 0x7cd0ff;
/** A shape as a little picture (for a card, a reward). */
function glyph(shape, turns = 0, px = 7) {
	const cells = turned(shape, turns), w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1, on = new Set(cells.map(([x, y]) => y * w + x));
	let out = '';
	for (let i = 0; i < w * h; i++) out += on.has(i) ? '<i class="on"></i>' : '<i></i>';
	return `<span class="pt-mz-shape" style="grid-template-columns:repeat(${w},${px}px);--px:${px}px" aria-hidden="true">${out}</span>`;
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
		const at = T.pin || P.cursor, why = TD.cardWhy(T.S, c, T.turns, at.x, at.y);
		return { c, at, cells: cellsAt(c.shape, T.turns, at.x, at.y), why, ways: why ? null : TD.waysWith(T.S, c.shape, T.turns, at.x, at.y, c.bonus) };
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
	const recipe = () => tdRecipe({ seed: T.seed, mapId: T.map.id, squad: T.squad, startWave: T.startWave, inputs: T.inputs, end: T.S.tick, wave: T.S.cleared, over: T.S.over, hero: T.hero, rev: T.S.rev, deck2: !!T.S.deck2 });   // (rev: the rules the run is being played by, not today's: a resumed run keeps its own)
	/** This device's copy of the run in progress (a reload resumes it); cleared when it ends. */
	function save() { if (!playing() || !ctx.store) return; ctx.store(T.S.over ? null : { v: 1, recipe: recipe(), ts: Date.now() }); T.savedAt = T.S.tick; }
	/** Put a run (a new one, a re-run one) on the board. */
	/** How a maze's blocks are drawn (terrain3d.js `block` / `blockfree`): a terrain block keeps its water, lava, grass or ice. */
	const blockLook = (S) => () => { const W = S.B.map.w, out = {}; for (const b of S.blocks) if (!(BONUS[b.bonus] || {}).ground) for (const [x, y] of b.cells) out[y * W + x] = (BONUS[b.bonus] || {}).floor || ((BONUS[b.bonus] || {}).aura ? 'beacon' : b.locked ? 'block' + (+b.id.slice(1) % 4) : 'blockfree'); return out; };   // (each locked block in one of four stones, by its number: the pieces read as pieces)
	function adopt(S) { P.groundOver = S.mode === 'maze' ? blockLook(S) : null; T.S = S; P.S = S.B; P.disp = { units: {}, geo: S.B.geo }; T.ghost = {}; T.gone = {}; if (S.mode === 'maze' && T.shown) ctx.buildScene(S.B.map); }   // (a maze's blocks are part of the ground)

	// ---- orders: applied now, written down with their tick
	function order(a, quiet) {
		const why = TD.applyInput(T.S, a, data);
		if (why) { if (!quiet) { ctx.sfx.error(); ctx.toast(why[0].toUpperCase() + why.slice(1)); } return why; }
		T.inputs.push([T.S.tick, a]); T.autoT = 0;
		if (maze()) { T.pin = null; if (T.card && !T.S.hand.some((c) => c.id === T.card)) T.card = null; }
		play(T.S.ev); T.S.ev = [];
		sync(); draw(); save();
		return null;
	}

	// ---- effects (owner, 2026-11-24: "big numbers and bursts", with a setting that turns them down): full, or calm.
	// A device that asks for less motion starts calm; the field menu's switch is remembered on this device.
	const FX_KEY = 'magepunk_poketactica_tdfx_v1';
	const calm = () => { if (T.calm == null) { let v = null; try { v = localStorage.getItem(FX_KEY); } catch { /* not remembered */ } T.calm = v ? v === 'calm' : (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } return T.calm; };
	const setCalm = (b) => { T.calm = !!b; try { localStorage.setItem(FX_KEY, b ? 'calm' : 'full'); } catch { /* not remembered */ } };
	const fxItem = () => ({ label: `Effects <small>${calm() ? 'calm: plain numbers, no bursts' : 'full: big numbers and bursts'}</small>`, color: 'bal-blue', go: () => { setCalm(!calm()); openField(); } });

	// ---- two more switches, remembered on this device (improvement plan, 2026-11-25)
	//   reach   every tower's reach at once, not only the one under the cursor
	//   auto    Maze Builder: the next wave is called by itself a few seconds after the last order, when nothing waits on a choice
	const REACH_KEY = 'magepunk_poketactica_tdreach_v1', AUTO_KEY = 'magepunk_poketactica_mzauto_v1', AUTO_SECS = 4;
	const flag = (key) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
	const setFlag = (key, b) => { try { if (b) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch { /* not remembered */ } };
	const allReach = () => { if (T.allReach == null) T.allReach = flag(REACH_KEY); return T.allReach; };
	const autoOn = () => { if (T.auto == null) T.auto = flag(AUTO_KEY); return T.auto; };
	const reachItem = () => ({ label: `Reach shown <small>${allReach() ? 'every tower at once' : 'the tower under the cursor'}</small>`, color: 'bal-blue', go: () => { T.allReach = !allReach(); setFlag(REACH_KEY, T.allReach); draw(); openField(); } });
	const autoItem = () => ({ label: `Next wave <small>${autoOn() ? 'by itself, ' + AUTO_SECS + 's after your last order' : 'when you call it'}</small>`, color: 'bal-blue', go: () => { T.auto = !autoOn(); setFlag(AUTO_KEY, T.auto); T.autoT = 0; openField(); } });
	/** May the next wave call itself now? Not before the first wave (the maze is still to build), and never over a choice. */
	const autoReady = () => maze() && playing() && autoOn() && T.S.phase === 'wait' && !T.S.over && T.S.wave >= 1 && !T.S.pick && !T.S.perks && !P.menu && !T.paused && !T.card && !T.dragging;
	/** Every tower's reach, as one list of tiles (each once). */
	function reachAll() {
		const S = T.S, key = S.towers.map((t) => t.uid + ':' + t.x + ',' + t.y).join('|') + '#' + (S.blocks ? S.blocks.length : 0) + '#' + S.wave;
		if (T.reachAllKey === key) return T.reachAllTiles;
		const seen = new Set(), out = [];
		for (const t of S.towers) for (const q of TD.towerReach(S, t.uid, data)) { const k = q[0] + ',' + q[1]; if (!seen.has(k)) { seen.add(k); out.push(q); } }
		T.reachAllKey = key; T.reachAllTiles = out;
		return out;
	}
	/** Damage dealt this run, tower by tower (the field menu's panel; the results had it as one line of text). */
	function openDamage() {
		const S = T.S, rows = S.towers.map((t) => ({ u: unit(t.uid), n: T.dealt[t.uid] || 0 })).filter((r) => r.u).sort((a, b) => b.n - a.n), total = rows.reduce((a, r) => a + r.n, 0);
		P.mode = 'td-menu';
		const items = rows.map((r) => ({ label: `${esc(nameOf(r.u.species))} <small>Lv ${r.u.level} · ${r.n.toLocaleString('en-US')} · ${total ? Math.round(100 * r.n / total) : 0}%</small><span class="pt-dmg-bar" style="--w:${total ? Math.round(100 * r.n / rows[0].n) : 0}%"></span>`, color: 'bal-blue', go: () => { closeMenu(); P.cursor = { x: r.u.x, y: r.u.y }; ctx.follow(); draw(); } }));
		items.push({ label: 'Close', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, rows.length ? `Damage dealt · ${total.toLocaleString('en-US')} in all` : 'Damage dealt · no towers yet');
		P.menu.i = items.length - 1; ctx.menuMove(0);
	}
	const damageItem = () => ({ label: 'Damage dealt <small>tower by tower</small>', color: 'bal-blue', go: openDamage });

	// ---- the speed last played at is this device's next run's (owner's list, 2026-11-24: every run started at 1×)
	const SPEED_KEY = 'magepunk_poketactica_tdspeed_v1';
	const savedSpeed = () => { try { const n = +localStorage.getItem(SPEED_KEY); return n >= 1 && n <= 3 ? Math.floor(n) : 1; } catch { return 1; } };
	// ---- damage dealt this run, a figurine (the page's own count, from the sim's hits: a resumed run counts its past again)
	const tally = (evs) => { for (const e of evs) if (e.t === 'hit' && e.uid && e.dmg > 0) T.dealt[e.uid] = (T.dealt[e.uid] || 0) + e.dmg; };
	const dealtSay = (uid) => (T.dealt[uid] ? ' · dealt ' + T.dealt[uid].toLocaleString('en-US') : '');
	const KIND_MANY = { runner: 'Runners', splitter: 'Splitters', shield: 'Shielded', healer: 'Healers' };
	// ---- BY WHICH ROAD (plan item T3): a map with more than one way in has its gates NUMBERED on the board, and the wave
	// to come says how many come by each. (Two bases behind one gate: the bases are numbered instead. A moving gate opens one
	// way a wave: its badge already says which, and the number on the board says which is open.)
	const roadWord = (S) => (S.paths.length > 1 && S.paths.every((p) => p[0][0] === S.paths[0][0][0] && p[0][1] === S.paths[0][0][1]) ? 'base' : 'gate');
	function roadMarks(S) {
		if (!S || S.paths.length < 2) return [];
		const word = roadWord(S), live = TD.laneNow(S);
		return S.paths.map((p, k) => { const at = word === 'base' ? p[p.length - 1] : p[0]; return { x: at[0], y: at[1], text: String(k + 1), color: live == null || live === k ? '#ffd23c' : '#9aa3ab', sub: word + (live != null ? (live === k ? ' · open' : ' · shut') : '') }; });
	}
	// ---- the wave to come (the same list the sim will spawn: td/sim.js waveOf), said shortly: "BOSS Onix · 8 Rattata · 3 Geodude"
	function nextWave() {
		const S = T.S, n = S.wave + 1, key = S.seed + ':' + n;
		if (T.nextKey === key) return T.nextSay;
		const list = TD.waveFor(S, n, data), count = {}, boss = list.filter((w) => w.boss);
		for (const w of list) if (!w.boss) { const k = w.sp + '|' + (w.trait || ''); count[k] = (count[k] || 0) + 1; }
		// (the wave IN PICTURES, plan item T3: each kind of enemy with its own picture beside its number and name)
		const pic = (sp, big) => { const f = (data.species[sp] || {}).sprite; return f ? '<img class="pt-next-pic' + (big ? ' is-boss' : '') + '" src="/overworld/data/pokemon/' + esc(f) + '" alt="" draggable="false">' : ''; };
		const kindTag = (tr) => (tr ? ' <span class="pt-kind pt-kind-' + tr + '">' + esc(KIND_MANY[tr]) + '</span>' : '');
		const parts = [...boss.map((w) => '<b class="pt-next-boss">BOSS ' + pic(w.sp, true) + esc(nameOf(w.sp)) + (w.trick ? ' · ' + esc(TD.BOSS_TRICKS[w.trick].name) : '') + '</b>'), ...Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, c]) => { const [sp, tr] = k.split('|'); return '<span class="pt-next-one">' + c + ' ' + pic(sp) + esc(nameOf(sp)) + kindTag(tr) + '</span>'; })];
		// (Maze Builder: the two waves after it, in a line each, so a maze can be built for what is coming)
		const short = (m) => { const l = TD.waveFor(S, m, data), b = l.find((w) => w.boss), tr = (l.find((w) => w.trait) || {}).trait; return '<span class="pt-next-n">' + m + '</span> ' + (b ? '<b class="pt-next-boss">BOSS' + (b.trick ? ' · ' + esc(TD.BOSS_TRICKS[b.trick].name) : '') + '</b>' : l.length + ' foes') + (tr ? ' · ' + (TD.isEliteWave(m) && tr !== 'healer' ? 'all ' : '') + '<span class="pt-kind pt-kind-' + tr + '">' + esc(KIND_MANY[tr]) + '</span>' : ''); };
		const kind = (list.find((w) => w.trait) || {}).trait || null, trick = (boss[0] || {}).trick || null;
		let roads = '';
		if (!S.shift && S.paths.length > 1) {
			const word = roadWord(S), by = S.paths.map(() => 0); for (const w of list) by[w.gate % by.length]++;
			const Word = word[0].toUpperCase() + word.slice(1);
			roads = by.map((c, k) => `<span class="pt-next-one">${Word} ${k + 1}: <b>${c}</b></span>`).join(' · ') + (boss.length ? ` · <b class="pt-next-boss">BOSS ${word === 'base' ? 'to' : 'by'} ${word} ${(boss[0].gate % by.length) + 1}</b>` : '');
		}
		T.nextKey = key; T.nextSay = { roads, html: parts.join(' · '), lv: list[0] ? list[0].lv : 0, boss: boss.length > 0, n: list.length, kind, trick, elite: S.mode === 'maze' && S.rev >= 14 && TD.isEliteWave(n) && !!kind,
			why: kind ? TD.TRAITS[kind].name + ': ' + TD.TRAITS[kind].say : trick ? TD.BOSS_TRICKS[trick].name + ': ' + TD.BOSS_TRICKS[trick].say : '', more: S.mode === 'maze' ? [short(n + 1), short(n + 2)] : [] };
		return T.nextSay;
	}
	// ---- where a figurine not yet placed would reach from the cursor's tile (the first free one): the same red tiles a tower shows
	function reachIf(x, y) {
		const S = T.S, fig = firstFree(); if (fig < 0) return [];
		const key = [x, y, fig, S.towers.length, S.blocks ? S.blocks.length : 0, S.wave].join();
		if (T.reachKey === key) return T.reachTiles;
		let tiles = [];
		try { const C = TD.fromSnapshot(TD.toSnapshot(S)); if (!TD.applyInput(C, { t: 'place', fig, x, y }, data)) { const t = C.towers[C.towers.length - 1]; tiles = TD.towerReach(C, t.uid, data); } } catch { tiles = []; }
		T.reachKey = key; T.reachTiles = tiles;
		return tiles;
	}

	// ---- the sim's events, shown
	function play(evs) {
		const D = P.disp, now = performance.now() / 1000;
		tally(evs);
		for (const e of evs) {
			const u = e.uid && D.units[e.uid];
			if (e.t === 'use' && u) { u.anim = 'Attack'; u.t0 = now; ctx.moveFx(e, u); if (now - T.lastSfx > 0.12) { T.lastSfx = now; ctx.sfx.card && ctx.sfx.card(); } }
			else if (e.t === 'hit' && D.units[e.target]) { const v = D.units[e.target], hit = unit(e.target), heavy = !!e.crit || e.eff > 1 || (!!hit && e.dmg >= hit.maxHP * 0.25); v.flash = 1; v.hurt = now; ctx.pop(e.target, '-' + e.dmg, e.crit ? '#ff7a5a' : e.eff > 1 ? '#ffd23c' : e.eff > 0 && e.eff < 1 ? '#b8c2c6' : '#ffffff', { big: heavy ? 2 : 1, calm: calm(), at: v.wx || [v.x, v.y] }); ctx.fx({ k: 'impact', at: [v.wx ? v.wx[0] : v.x, v.wx ? v.wx[1] : v.y], t: 0, dur: 0.25, color: '#ffffff' }); }
			else if (e.t === 'hurt' && u) ctx.pop(e.uid, '-' + e.n, '#c8a0ff');
			else if (e.t === 'miss' && e.target) ctx.pop(e.target, 'Miss', '#cccccc');
			else if (e.t === 'immune') ctx.pop(e.uid, 'Immune', '#cccccc');
			else if (e.t === 'status' && u) ctx.pop(e.uid, e.st.toUpperCase(), '#e0b36b');
			else if (e.t === 'confused' && u) ctx.pop(e.uid, 'CONFUSED', '#e0b36b');
			else if (e.t === 'shook' && u) ctx.pop(e.uid, 'Shook it off', '#cccccc');
			else if (e.t === 'sp' && u) ctx.pop(e.uid, '+' + e.n + ' SP', '#7cd0ff');
			else if (e.t === 'boost' && u) ctx.pop(e.uid, Object.entries(e.changes).map(([k, d]) => (d > 0 ? '+' : '') + d + ' ' + k.toUpperCase()).join(' '), Object.values(e.changes)[0] > 0 ? '#7cf08a' : '#e0b36b');
			else if (e.t === 'fell') { const g = T.ghost[e.uid]; if (g) ctx.fx({ k: 'ring', at: g, r: 1, t: 0, dur: 0.4, color: e.boss ? '#ffd23c' : '#ffffff' }); if (g && !calm()) { ctx.fx({ k: 'burst', at: g, n: e.boss ? 26 : 12, t: 0, dur: e.boss ? 0.9 : 0.6, color: e.boss ? '#ffd23c' : '#ffe9b0' }); if (e.boss) ctx.shake(0.6); } if (e.boss) { ctx.banner('Boss down!'); ctx.sfx.coin && ctx.sfx.coin(); } }
			else if (e.t === 'leak') { ctx.shake(0.5); ctx.sfx.error(); ctx.toast('One got through: ' + e.lives + ' lives left'); }
			else if (e.t === 'cracked' && u) ctx.pop(e.uid, 'Shield broken', '#9fe0ff');
			else if (e.t === 'mend' && u) ctx.pop(e.uid, '+' + e.n, '#7dff9a');
			else if (e.t === 'spawn' && e.called) { if (now - (T.lastCall || 0) > 1) { T.lastCall = now; ctx.toast('The boss calls for help!'); } }
			else if (e.t === 'wave') { const sp = T.S.spawn || [], k = (sp.find((w) => w.trait) || {}).trait, tk = (sp.find((w) => w.trick) || {}).trick; ctx.banner('Wave ' + e.n + (e.boss ? ' · BOSS' + (tk ? ' · ' + TD.BOSS_TRICKS[tk].name : '') : '') + (k ? ' · ' + (TD.isEliteWave(e.n) ? 'ELITE ' : '') + KIND_MANY[k] : '')); if (maze()) ctx.buildScene(T.S.B.map); }   // (a maze's blocks lock: they look it)
			else if (e.t === 'clear') { ctx.sfx.coin && ctx.sfx.coin(); ctx.toast('Wave ' + e.n + ' cleared · PP refilled' + (e.slots > T.slotsSeen ? ' · a new slot!' : '')); T.slotsSeen = e.slots; if (maze() && !calm()) { const b = T.S.B.map.base; ctx.fx({ k: 'coins', at: [b.x, b.y], to: '#td-gold', n: 6, t: 0, dur: 0.9, color: '#ffd23c' }); } if (maze() && playing()) { T.clearedNow = true; if (T.S.pick) openPick(); else if (T.S.perks) openPerk(); } }
			else if (e.t === 'perk') { ctx.sfx.coin && ctx.sfx.coin(); ctx.toast('Passive: ' + PASSIVES[e.id].name); }
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
		el.id = 'pt-td'; el.className = 'pt-td'; el.hidden = true;
		el.addEventListener('click', barClick);
		document.body.appendChild(el);
		return (T.bar = el);
	}
	/** Maze Builder's hand: its own tray along the bottom of the screen. */
	function tray() {
		if (T.tray) return T.tray;
		const el = document.createElement('div');
		el.id = 'td-hand'; el.className = 'pt-mz-tray'; el.hidden = true;
		el.addEventListener('click', (ev) => { if (T.dragDone) { T.dragDone = false; ev.preventDefault(); return; } barClick(ev); });
		el.addEventListener('pointerdown', dragDown);
		document.body.appendChild(el);
		return (T.tray = el);
	}
	// ---- a card DRAGGED onto the board (a finger, a pen or the mouse): the ghost follows, letting go lays it where it may go.
	// (Tap a card, tap a tile, tap again still works; a laid block can be taken back until the wave is called.)
	const DRAG_PX = 14;
	function dragDown(ev) {
		const b = ev.target.closest('[data-act="card"]'); if (!b || !building() || !ctx.tileAt) return;
		const d = { id: b.dataset.id, x: ev.clientX, y: ev.clientY, pid: ev.pointerId, on: false };
		const tileOf = (e) => { const t = ctx.tileAt(e.clientX, e.clientY), M = T.S.B.map; return t && t[0] >= 0 && t[1] >= 0 && t[0] < M.w && t[1] < M.h ? { x: t[0], y: t[1] } : null; };
		const overTray = (e) => { const r = tray().getBoundingClientRect(); return e.clientY >= r.top + 6 && e.clientX >= r.left && e.clientX <= r.right; };
		const move = (e) => {
			if (e.pointerId !== d.pid) return;
			if (!d.on) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_PX) return; d.on = true; T.dragging = true; T.card = d.id; T.turns = 0; T.pin = null; document.body.classList.add('pt-mzdrag'); }
			const t = overTray(e) ? null : tileOf(e);
			if (t && (t.x !== P.cursor.x || t.y !== P.cursor.y)) { P.cursor = t; draw(); } else if (!T.dragDrawn) draw();
			T.dragDrawn = true; T.dragOver = !!t;
		};
		const up = (e) => {
			if (e.pointerId !== d.pid) return;
			window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
			if (!d.on) return;
			T.dragging = false; T.dragDrawn = false; T.dragDone = true; setTimeout(() => { T.dragDone = false; }, 350);
			document.body.classList.remove('pt-mzdrag');
			const t = e.type === 'pointerup' && !overTray(e) ? tileOf(e) : null;
			if (!t || !cardSel()) { draw(); return; }   // (let go over the hand, or off the board: the card stays chosen)
			P.cursor = t; T.pin = null;
			const g = ghost();
			if (g.why) { ctx.sfx.error(); ctx.toast(g.why[0].toUpperCase() + g.why.slice(1)); draw(); return; }
			T.pin = t; lay();
		};
		window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
	}
	function barClick(ev) {
		{
			const b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
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
			else if (b.dataset.act === 'reward') { if (T.S.pick) openPick(); else openPerk(); }
			else if (b.dataset.act === 'hero') openHero();
		}
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
	/** The hand as cards, fanned along the bottom; the chosen one lifts, with what it can do above it; the draw pile beside. */
	function drawTray(v, key) {
		const el = tray();
		document.body.classList.toggle('pt-mzhand', building());   // (the pop-up messages stand clear of the hand)
		if (!building()) { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; el.dataset.h = ''; } return; }
		const sel = cardSel(), n = v.hand.length;
		const cards = v.hand.map((c, i) => {
			const on = !!sel && sel.id === c.id, tilt = n > 1 ? ((i - (n - 1) / 2) * (n > 5 ? 3 : 4)).toFixed(1) : 0, dip = Math.round(Math.abs(i - (n - 1) / 2) ** 2 * 2);
			return `<button class="pt-mz-card${on ? ' is-on' : ''}${c.bonus ? ' is-bonus pt-mz-b-' + c.bonus + (BONUS[c.bonus].hero ? ' is-herocard' : '') : ''}" data-act="card" data-id="${c.id}" aria-pressed="${on}" aria-label="${esc(SHAPE_NAME[c.shape])}${c.bonus ? ', ' + esc(BONUS[c.bonus].name) : ''}" style="--tilt:${tilt}deg;--dip:${dip}px">${c.bonus && BONUS_ICON[c.bonus] ? '<span class="pt-mz-kind" aria-hidden="true">' + BONUS_ICON[c.bonus] + '</span>' : ''}<span class="pt-mz-face">${glyph(c.shape, on ? T.turns : 0, 13)}</span><span class="pt-mz-name">${c.bonus ? esc(bandName(c.bonus)) : esc(SHAPE_NAME[c.shape])}</span></button>`;
		}).join('');
		const acts = sel ? `<div class="pt-mz-acts"><button class="bal-btn bal-sm bal-blue" data-act="turn">⟳ Turn ${key('C')}</button><button class="bal-btn bal-sm bal-green" data-act="lay">✓ ${T.pin ? 'Lay it' : 'Put it'} ${key('Z')}</button><button class="bal-btn bal-sm bal-grey" data-act="discard">Discard +${v.discardGold}●</button></div>` : '';
		const pile = `<button class="pt-mz-pile" data-act="draw" ${n >= v.handMax || v.gold < v.drawCost ? 'disabled' : ''} aria-label="Draw a card for ${v.drawCost} gold"><span class="pt-mz-bubble">Draw ${v.drawCost}●</span><span class="pt-mz-deck">?</span></button>`;
		const html = `${acts}<div class="pt-mz-fan">${cards || '<span class="bal-badge bal-grey">No cards</span>'}</div>${n ? '<span class="pt-mz-next">' + key('V') + '</span>' : ''}${pile}`;
		if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
		el.hidden = false;
	}
	/** The HUD, in the screen's corners (owner, 2026-11-24, both modes): who and what you have top-left, the wave top-right,
	 *  the wave's button and the clock's bottom-right; the coach top-centre, a replay's controls bottom-centre. */
	function drawBar() {
		const v = TD.view(T.S), el = bar(), mz = v.mode === 'maze';
		const bossNext = TD.isBossWave(v.wave + 1) ? ' · BOSS' : '';
		const wave = v.phase === 'wave' ? `Wave ${v.wave}${TD.isBossWave(v.wave) ? ' · BOSS' : ''} <span class="bal-muted">${v.left} left</span>` : mz ? `Next: wave ${v.wave + 1}${bossNext} <span class="bal-muted" id="td-auto">${autoReady() ? 'in ' + Math.max(1, Math.ceil(AUTO_SECS - (T.autoT || 0))) + 's' : autoOn() && v.wave >= 1 ? 'by itself when you are done' : 'when you call it'}</span>` : `Next: wave ${v.wave + 1}${bossNext} <span class="bal-muted">in ${Math.ceil(v.nextIn / TD.TPS)}s</span>`;
		const key = (k) => `<span class="bal-key">${k}</span>`;
		const purseN = mz ? v.gold : v.energy;
		const purse = mz ? `<span class="bal-badge bal-gold" id="td-gold">● ${v.gold}</span>` : `<span class="bal-badge bal-gold" id="td-energy">⚡ ${v.energy}</span>`;
		// (a moving gate: which of the gates the next enemies come by, and that way's length alone)
		const wayBadge = mz ? (v.gateOn != null ? `<span class="bal-badge bal-orange" id="td-gate">Gate ${v.gateOn + 1} of ${v.ways.length}</span>` : '') + `<span class="bal-badge bal-grey" id="td-way">Way ${v.gateOn != null ? wayLen([v.ways[v.gateOn]]) : wayLen(v.ways)}</span>` : '';
		const hero = mz && v.hero ? heroById(v.hero) : null;
		const heroChip = hero ? `<button class="pt-hero-chip" data-act="hero" id="td-hero" aria-label="${esc(hero.name)}: ${v.passives.length} passive${v.passives.length === 1 ? '' : 's'}">${portraitImg(hero.id)}<b>${esc(hero.name)}</b><span class="bal-badge bal-purple">${v.passives.length}</span></button>` : '';
		const tl = `<div class="pt-hud pt-hud-tl bal-panel" id="td-tl">${heroChip}<div class="pt-hud-stats"><span class="bal-badge bal-red" id="td-lives">♥ ${v.lives}</span>${purse}<span class="bal-badge bal-purple" id="td-slots">${v.towers.length}/${v.slots} towers</span></div></div>`;
		const nx = v.phase === 'wait' && !v.over ? nextWave() : null;
		const tr = `<div class="pt-hud pt-hud-tr bal-panel${nx ? ' has-next' : ''}" id="td-tr"><div class="pt-hud-stats"><span class="bal-badge ${nx && nx.boss ? 'bal-red' : 'bal-blue'}" id="td-wave">${wave}</span>${wayBadge}${v.weather ? `<span class="bal-badge bal-grey">${esc(v.weather)}</span>` : ''}</div>${nx ? `<div class="pt-next" id="td-next"><span class="bal-muted">Lv ${nx.lv}</span> ${nx.elite ? '<b class="pt-next-elite">ELITE</b> ' : ''}${nx.html}</div>${nx.roads ? '<div class="pt-next pt-next-roads" id="td-next-roads">' + nx.roads + '</div>' : ''}${nx.why ? '<div class="pt-next pt-next-why" id="td-next-why">' + esc(nx.why) + '</div>' : ''}${nx.more.length ? '<div class="pt-next pt-next-more" id="td-next-more"><span class="bal-muted">then</span> ' + nx.more.join(' <span class="bal-muted">·</span> ') + '</div>' : ''}` : ''}</div>`;
		let rest;
		if (!playing()) {
			rest = T.mode === 'watch' ? `<div class="pt-hud pt-hud-bc bal-panel" id="td-watch"><button class="bal-btn bal-sm bal-grey" data-act="w-start" aria-label="Back to the start">⏮ ${key('X')}</button><button class="bal-btn bal-sm bal-blue" data-act="w-prev" aria-label="The wave before">◀</button><button class="bal-btn bal-sm bal-orange" data-act="w-play">${T.paused || T.ended ? '▶ Play' : '⏸ Pause'} ${key('Z')}</button><button class="bal-btn bal-sm bal-blue" data-act="w-next" aria-label="The next wave">▶</button><button class="bal-btn bal-sm bal-blue" data-act="speed">${T.speed}× ${key('C')}</button><button class="bal-btn bal-sm bal-grey" data-act="w-clip">🔗 ${key('V')}</button></div>`
				: `<div class="pt-hud pt-hud-bc bal-panel"><span class="bal-muted" id="td-follow">${esc(T.followSay || 'Watching live')}</span></div>`;
			if (T.tray) T.tray.hidden = true;
		} else {
			const coach = coachRow();
			rest = `<div class="pt-hud pt-hud-br" id="td-br"><div class="pt-hud-small"><button class="bal-btn bal-sm ${T.paused ? 'bal-orange' : 'bal-grey'}" data-act="pause">${T.paused ? '▶ Resume' : '⏸ Pause'}</button><button class="bal-btn bal-sm bal-blue" data-act="speed">${T.speed}× ${key('C')}</button><button class="bal-btn bal-sm bal-purple" data-act="menu">Menu ${key('⏎')}</button>${mz && (v.pick || v.perks) ? '<button class="bal-btn bal-sm bal-orange" data-act="reward">★ ' + (v.pick ? 'Reward' : 'Passive') + '</button>' : ''}</div><button class="bal-btn bal-green pt-hud-wave" data-act="wave" ${v.phase === 'wait' && !v.over ? '' : 'disabled'}>Wave! ${mz ? '' : key('V')}</button></div>${coach ? '<div class="pt-hud pt-hud-tc">' + coach + '</div>' : ''}`;
			if (mz) drawTray(v, key); else if (T.tray) T.tray.hidden = true;
		}
		const full = tl + tr + rest;
		if (el.dataset.h !== full) {
			el.innerHTML = full; el.dataset.h = full;
			// (the purse jumps when it grows, the lives flinch when one is lost: once, as the number changes)
			const mark = (id, cls) => { const b = el.querySelector(id); if (b) b.classList.add(cls); };
			if (T.seen && T.seen.S === T.S && !calm()) { if (purseN > T.seen.purse) mark(mz ? '#td-gold' : '#td-energy', 'is-bump'); if (v.lives < T.seen.lives) mark('#td-lives', 'is-hit'); }
			T.seen = { purse: purseN, lives: v.lives, S: T.S };
		}
		el.classList.toggle('is-maze', mz);
		el.hidden = false;
		// (the wave's panel grows with what is coming: the hint and the tutorial hang under it, not under where it used to end)
		{ const p = el.querySelector('#td-tr'), b = p ? Math.round(p.getBoundingClientRect().bottom) : 0; if (b && b !== T.under) { T.under = b; document.body.style.setProperty('--td-under', b + 'px'); } }
	}
	/** Highlights: the cursor's tower shows its reach; a free tile shows it can be built on. */
	function draw() {
		const S = T.S, t = towerAt(P.cursor.x, P.cursor.y) || (T.sel && S.towers.find((x) => x.uid === T.sel));
		// (Maze Builder: the way is drawn, as it is or as the ghost block would make it; the ghost green or red; blocks that can still be taken back in blue)
		const g = maze() ? ghost() : null, M = S.B.map;
		const mazeHl = () => { const ways = (g && g.ways) || S.paths, out = []; const live = TD.laneNow(S); for (const [k, p] of ways.entries()) for (const [x, y] of p.slice(1, -1)) out.push([x, y, MZ_WAY, live == null || live === k ? 0.3 : 0.1]); if (building()) for (const b of S.blocks) if (!b.locked) for (const [x, y] of b.cells) out.push([x, y, MZ_LOOSE]); if (g) for (const [x, y] of g.cells) if (x >= 0 && y >= 0 && x < M.w && y < M.h) out.push([x, y, g.why ? MZ_BAD : MZ_OK]); return out; };
		const extra = [...(maze() ? mazeHl() : []), ...S.paths.map((p) => [p[0][0], p[0][1], 0xfe5f55])];
		P.marks = roadMarks(S);
		if (!playing()) { P.hl = { aim: t ? TD.towerReach(S, t.uid, data) : allReach() ? reachAll() : [], extra }; ctx.rebuildOverlay(); drawBar(); $('hint').innerHTML = ''; return; }
		const tk = touchy();
		// (no tower under the cursor and no card in hand: the reach the next figurine would have from here, if it may stand here)
		const foeHere = S.enemies.some((e) => { const v = unit(e.uid); return v && v.x === P.cursor.x && v.y === P.cursor.y; });
		const could = !t && !g && !S.over && !foeHere && firstFree() >= 0 && !TD.placeBlock(S, firstFree(), P.cursor.x, P.cursor.y) && (!maze() || M.height[P.cursor.y * M.w + P.cursor.x] > 0);   // (Maze Builder: a figurine stands on a block, so bare ground shows no "would reach")
		// (the switch "every tower at once": all of them, unless the cursor is on one tower or is trying a figurine's tile)
		P.hl = { aim: t && !g ? TD.towerReach(S, t.uid, data) : could ? reachIf(P.cursor.x, P.cursor.y) : allReach() && !g ? reachAll() : [], extra };
		ctx.rebuildOverlay();
		drawBar();
		if (g) { $('hint').innerHTML = `<b>${esc(SHAPE_NAME[g.c.shape])}${g.c.bonus ? ' · ' + bonusIcon(g.c.bonus) + esc(BONUS[g.c.bonus].name) : ''}</b>${g.c.bonus ? ' <span class="pt-mz-say">' + esc(BONUS[g.c.bonus].text) + '</span>' : ''} · ${g.why ? '<span class="pt-mz-bad">' + esc(g.why[0].toUpperCase() + g.why.slice(1)) + '</span>' : 'Way ' + wayLen(S.paths) + ' → <b>' + wayLen(g.ways) + '</b>'} · <span class="bal-muted">${tk ? (T.pin ? 'Tap it again, or ✓, to lay it' : 'Tap a tile to put it there') : T.pin ? 'Z again: lay it · X: move it' : 'Z: put it here · C: turn · X: back'}</span>`; return; }
		if (maze() && !t && !S.over) { const b = blockAt(P.cursor.x, P.cursor.y), high = M.height[P.cursor.y * M.w + P.cursor.x] > 0; const foe2 = S.enemies.some((e) => { const v = unit(e.uid); return v && v.x === P.cursor.x && v.y === P.cursor.y; }); if (!foe2) { $('hint').innerHTML = high ? `${tk ? 'Tap' : 'Z'}: place a figurine here (${TD.view(S).placeCost}●)${could ? ' <span class="bal-muted">the red tiles: what ' + esc(nameOf(T.squad[firstFree()].species)) + ' would reach</span>' : ''}${b && building() ? (b.locked ? ' · or lift this block (' + TD.view(S).liftCost + '●)' : tk ? ' · or take this block back' : ' · X: take this block back') : ''}${b && b.bonus ? ' · <b>' + esc(BONUS[b.bonus].name) + '</b> <span class="bal-muted">' + esc(BONUS[b.bonus].text) + '</span>' : ''}` : building() ? (S.hand.length ? (tk ? 'Tap a card, then a tile, to bend the way. Figurines stand on blocks.' : 'V: choose a block card, then lay it to bend the way. Figurines stand on blocks.') : 'No cards: draw one, or call the wave.') : 'Figurines stand on blocks.'; return; } }
		const free = !t && !TD.placeBlock(S, firstFree(), P.cursor.x, P.cursor.y);
		// (what the cursor is on, said in full: a tower's level, SP and how often each move fires; an enemy's level and HP)
		const foe = !t && S.enemies.map((e) => ({ e, v: unit(e.uid) })).filter((o) => o.v && o.v.hp > 0 && o.v.x === P.cursor.x && o.v.y === P.cursor.y).sort((a, b) => b.e.d - a.e.d)[0];
		const towerSay = (u) => `<b>${esc(nameOf(u.species))}</b> Lv ${u.level} · SP ${u.sp}/${u.maxSP} · ${u.fig.equipped.map((mid) => { const m = B.moveOf(u, mid, data), k = m ? tdKind(mid, m) : 'none'; return esc(moveName(mid)) + (k === 'none' ? ' (no use here)' : ' ' + (TD.cooldownTicks(u, m) / TD.TPS).toFixed(1) + 's'); }).join(', ')}${dealtSay(u.uid)} · <span class="bal-muted">${tk ? 'Tap it again: its orders' : 'Z: its orders'}</span>`;
		$('hint').innerHTML = S.over ? '' : t ? towerSay(unit(t.uid)) : foe ? `<b>${esc(nameOf(foe.v.species))}</b> Lv ${foe.v.level}${foe.e.boss ? ' · BOSS' : ''}${foe.e.trick ? ' · <b>' + esc(TD.BOSS_TRICKS[foe.e.trick].name) + '</b> <span class="bal-muted">' + esc(TD.BOSS_TRICKS[foe.e.trick].say) + '</span>' : foe.e.trait ? ' · <b>' + esc(TD.TRAITS[foe.e.trait].name) + '</b> <span class="bal-muted">' + esc(foe.e.trait === 'shield' && foe.e.cracked ? 'its shield is broken' : TD.TRAITS[foe.e.trait].say) + '</span>' : ''} · HP ${foe.v.hp}/${foe.v.maxHP}${foe.v.status ? ' · ' + foe.v.status.toUpperCase() : ''}` : free ? (tk ? 'Tap' : 'Z') + ': place a figurine here' + (could ? ' <span class="bal-muted">the red tiles: what ' + esc(nameOf(T.squad[firstFree()].species)) + ' would reach</span>' : '') : TD.freeSlots(S) > 0 && firstFree() >= 0 ? 'Move to a free tile off the road to place a figurine' : '';
	}
	const firstFree = () => T.squad.findIndex((_, i) => !T.S.placed[i]);

	// ---- time
	function togglePause() { T.paused = !T.paused; drawBar(); }
	function nextSpeed() { T.speed = T.mode === 'watch' ? WATCH_SPEEDS[(WATCH_SPEEDS.indexOf(T.speed) + 1) % WATCH_SPEEDS.length] : T.speed % 3 + 1; if (playing()) { try { localStorage.setItem(SPEED_KEY, String(T.speed)); } catch { /* not remembered */ } } ctx.sfx.tab && ctx.sfx.tab(); drawBar(); }
	function callWave() { if (T.S.phase !== 'wait') { ctx.sfx.error(); ctx.toast('A wave is under way'); return; } if (T.S.pick) { openPick(); return; } if (T.S.perks) { openPerk(); return; } T.card = null; T.pin = null; order({ t: 'call' }); T.paused = false; drawBar(); }
	/** Called every frame by the page: real time into ticks. */
	function frame(dt) {
		if (!T.S) return;
		if (T.mode === 'watch') { watchFrame(dt); sync(); return; }
		if (T.mode === 'follow') { followFrame(dt); sync(); return; }
		if (autoReady()) {
			const was = Math.ceil(AUTO_SECS - (T.autoT || 0));
			T.autoT = (T.autoT || 0) + Math.min(0.1, dt);
			if (T.autoT >= AUTO_SECS) { T.autoT = 0; callWave(); }
			else if (Math.ceil(AUTO_SECS - T.autoT) !== was) drawBar();
		} else if (T.autoT) { T.autoT = 0; drawBar(); }
		if (!stopped()) {
			T.acc += Math.min(0.1, dt) * T.speed;
			let n = 0;
			while (T.acc >= TICK && n < MAX_STEPS && !T.S.over) { TD.step(T.S, [], data); play(T.S.ev); T.acc -= TICK; n++; }
			if (n === MAX_STEPS) T.acc = 0;
			// (the wave starting or ending changes what can be done: the HINT is said again, not only the bar. It went on saying
			// "Tap a card, then a tile" all through a wave, when there is no hand)
			if (n) { if (T.S.phase !== T.phaseWas) { T.phaseWas = T.S.phase; draw(); } else drawBar(); }
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
		const map = tdMapById(rec.map, rec.rev || 1);
		if (!map) return false;
		enter('watch', map, rec.seed, rec.squad, rec.startWave, rec.hero);
		T.rec = rec; T.drv = tdDriver(rec, data); T.marks = []; T.ended = false; T.inputs = rec.inputs;
		adopt(T.drv.S);
		show(map);
		if (opts.wave > rec.startWave) wJump(opts.wave);
		ctx.banner(rec.label || 'Replay');
		return true;
	}

	// ---- follow: a friend's live run. snap: { td: 1, head: { seed, map, squad, startWave }, inputs, tick, hash, over }
	function follow(snap, say) {
		const head = snap.head, map = head && tdMapById(head.map, head.rev || 1);
		if (!map) return false;
		T.followSay = say || T.followSay;
		const rec = { ...head, inputs: snap.inputs };
		if (T.mode !== 'follow' || !T.drv || T.seed !== head.seed) {
			enter('follow', map, head.seed, head.squad, head.startWave, head.hero);
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
	function enter(mode, map, seed, squad, startWave, hero) {
		T.mode = mode; T.map = map; T.seed = seed; T.squad = squad; T.startWave = startWave || 1; T.hero = isMazeMap(map) && hero && heroById(hero) ? hero : null;
		T.speed = 1; T.paused = false; T.acc = 0; T.shownOver = false; T.sel = null; T.ended = false; T.savedAt = 0; T.checked = null;
		T.card = null; T.turns = 0; T.pin = null; T.shown = false; T.seen = null; T.dealt = {}; T.nextKey = null; T.reachKey = null;
		if (mode === 'play') T.speed = savedSpeed();
		P.screen = 'td'; P.mode = 'td'; P.menu = null; P.sel = null;
		P.setup = null; P.actions = []; P.anims = []; P.busy = false; P.teamMap = null; P.online = null;
		document.body.classList.add('pt-tding');
		$('result').hidden = true;
	}
	function show(map) {
		P.sceneryKind = T.map.scenery || null;   // (what stands round the board: td/scenery.js)
		ctx.buildScene(P.S.map);
		P.cursor = { x: T.S.paths[0][0][0], y: T.S.paths[0][0][1] };
		T.shown = true;
		ctx.placeCam(); ctx.setZoom(typeof innerWidth === 'number' && innerWidth < 600 ? (map.big ? 2.6 : 1.3) : 1);   // (a phone starts closer: the whole board at once is too small to tap; a big Maze Builder map closer still, the view on the cursor by the gate)
		T.slotsSeen = TD.slotsOf(T.S);
		sync(); draw();
	}

	// ---- menus (the battle's own command window; while one is open the game is paused)
	const closeMenu = () => { P.mode = 'td'; T.sel = null; ctx.setMenu(null); draw(); };
	// ---- Maze Builder's menus
	/** A block or a rock: place a figurine on it (for gold), or take the block back / lift it. */
	function openBlockTile(x, y) {
		const S = T.S, b = blockAt(x, y), V = TD.view(S), cost = V.placeCost, done = (a) => () => { ctx.setMenu(null); P.mode = 'td'; order(a); };
		P.mode = 'td-menu';
		const items = T.squad.map((f, i) => (S.placed[i] ? null : { label: `${esc(nameOf(f.species))} <small>Lv ${f.level} · ${f.equipped.map((m) => esc(moveName(m))).join(', ')}</small>`, color: 'bal-blue', off: S.gold < cost && 'Not enough gold', go: done({ t: 'place', fig: i, x, y }) })).filter(Boolean);
		if (b && building()) items.push(b.locked ? { label: `Lift this block <small>back to your hand · ${V.liftCost}●</small>`, color: 'bal-gold', off: S.gold < V.liftCost && 'Not enough gold', go: done({ t: 'lift', id: b.id }) } : { label: 'Take this block back <small>free until the wave is called</small>', color: 'bal-orange', go: done({ t: 'unblock', id: b.id }) });
		items.push({ label: 'Cancel', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, `Place here · ${cost}● (you have ${S.gold}●)`);
	}
	/** The rewards for the wave just cleared: pick one (after a boss wave, two). */
	function openPick() {
		const S = T.S; if (!S.pick) return;
		P.mode = 'td-menu';
		const after = () => { if (T.S.pick) openPick(); else if (T.S.perks) openPerk(); };
		const say = (o) => (o.k === 'bonus' ? `${glyph(o.shape)} ${bonusIcon(o.bonus)}${esc(BONUS[o.bonus].name)} block <small>${esc(BONUS[o.bonus].text)}</small>` : o.k === 'gold' ? `${o.n}● <small>gold</small>` : o.k === 'cards' ? 'Two plain blocks <small>you choose the shapes</small>' : o.k === 'trim' ? '✂ Take a card out of your deck <small>you choose which · it stops coming round</small>' : o.k === 'upgrade' ? `⬆ ${esc(BONUS[o.bonus].name)} on a card of your deck <small>you choose which · ${esc(BONUS[o.bonus].text)}</small>` : '♥ One life back');
		const items = S.pick.opts.map((o, i) => (o ? { label: say(o), color: o.k === 'bonus' || o.k === 'upgrade' ? 'bal-purple' : o.k === 'gold' ? 'bal-gold' : o.k === 'life' ? 'bal-red' : o.k === 'trim' ? 'bal-orange' : 'bal-blue', go: () => { if (o.k === 'cards') return openShapes(i, []); if (o.k === 'trim' || o.k === 'upgrade') return openDeckPick(i, o); ctx.setMenu(null); P.mode = 'td'; order({ t: 'pick', i }); after(); } } : null)).filter(Boolean);
		{ const pv = TD.view(S).pick; items.push({ label: `Change these rewards <small>${pv.rerollCost}● · three new ones</small>`, color: 'bal-gold', off: (!pv.canReroll && 'You have already picked from these') || (S.gold < pv.rerollCost && 'Not enough gold'), go: () => { ctx.setMenu(null); P.mode = 'td'; if (!order({ t: 'reroll' })) openPick(); } }); }
		items.push({ label: 'Decide later <small>the next wave waits for it</small>', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, `Wave ${S.cleared} cleared · pick ${S.pick.pick === 1 ? 'a reward' : S.pick.pick + ' rewards'} · ${S.gold}●`);
	}
	/** A reward that changes the deck (rules 15): which card it is for. The deck by kind; a kind it cannot be used on is shown, shut. */
	function openDeckPick(i, o) {
		const S = T.S, kinds = deckKinds(S.deck), small = S.deck.length <= DECK_MIN;
		P.mode = 'td-menu';
		const after = () => { if (T.S.pick) openPick(); else if (T.S.perks) openPerk(); };
		const items = kinds.map((k) => ({ label: `${glyph(k.shape)} ${esc(k.bonus ? BONUS[k.bonus].name + ' ' : '')}${esc(SHAPE_NAME[k.shape])} <small>×${k.n}${o.k === 'upgrade' && !k.bonus ? ' · becomes ' + esc(BONUS[o.bonus].name) : ''}</small>`, color: k.bonus ? 'bal-purple' : 'bal-blue',
			off: o.k === 'trim' ? small && 'Your deck is at its smallest (' + DECK_MIN + ' cards)' : !!k.bonus && 'That card has a bonus already',
			go: () => { ctx.setMenu(null); P.mode = 'td'; if (!order({ t: 'pick', i, card: k.at })) ctx.toast(o.k === 'trim' ? 'Out of your deck: ' + (k.bonus ? BONUS[k.bonus].name + ' ' : '') + SHAPE_NAME[k.shape] : SHAPE_NAME[k.shape] + ' is now a ' + BONUS[o.bonus].name + ' block'); after(); } }));
		items.push({ label: 'Back <small>to the rewards</small>', color: 'bal-grey', go: openPick });
		ctx.setMenu(items, o.k === 'trim' ? `Take which card out? · a deck of ${S.deck.length}` : `${BONUS[o.bonus].name} on which card? · a deck of ${S.deck.length}`);
	}
	/** After a boss wave: the hero picks one of three passives (td/heroes.js). */
	function openPerk() {
		const S = T.S; if (!S.perks) return;
		const h = heroById(S.hero);
		P.mode = 'td-menu';
		// (plan item B3: a rare passive is gold and says so; one that would finish a pair says the pair and what it adds)
		const items = S.perks.map((id, i) => { const pw = pairWith(S, id), pf = pairFor(id), rare = rarityOf(id) === 'rare'; return { label: `${rare ? '<span class="bal-badge bal-gold pt-rare">RARE</span> ' : ''}${esc(PASSIVES[id].name)} <small>${esc(PASSIVES[id].text)}${pw ? ' <b class="pt-pair">Pairs with ' + esc(PASSIVES[pw.ids.find((x) => x !== id)].name) + ' (you have it): ' + esc(pw.name) + '. ' + esc(pw.text) + '</b>' : pf && S.rev >= PASSIVE_REV ? ' <span class="pt-pair-hint">A pair with ' + esc(PASSIVES[pf.ids.find((x) => x !== id)].name) + '.</span>' : ''}</small>`, color: rare ? 'bal-gold' : h && h.pool.includes(id) ? 'bal-purple' : 'bal-blue', go: () => { ctx.setMenu(null); P.mode = 'td'; order({ t: 'perk', i }); } }; });
		items.push({ label: 'Decide later <small>the next wave waits for it</small>', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, `${h ? h.name : 'Hero'} · pick a passive for the rest of the run`);
	}
	/** Who the run is played as: the hero's passives so far, and the deck. */
	function openHero() {
		const S = T.S, h = heroById(S.hero); if (!h) return;
		P.mode = 'td-menu';
		const items = [...S.passives.map((id) => ({ label: `${rarityOf(id) === 'rare' ? '<span class="bal-badge bal-gold pt-rare">RARE</span> ' : ''}${esc(PASSIVES[id].name)} <small>${esc(PASSIVES[id].text)}</small>`, color: id === h.passive ? 'bal-orange' : rarityOf(id) === 'rare' ? 'bal-gold' : 'bal-purple', go: () => openHero() })),
			...pairsOf(S).map((p) => ({ label: `<span class="bal-badge bal-green pt-pairon">PAIR</span> ${esc(p.name)} <small>${p.ids.map((x) => esc(PASSIVES[x].name)).join(' + ')}: ${esc(p.text)}</small>`, color: 'bal-green', go: () => openHero() }))];
		items.push({ label: `Deck <small>${deckKinds(S.deck).map((k) => (k.bonus ? BONUS[k.bonus].name + ' ' : '') + SHAPE_NAME[k.shape] + (k.n > 1 ? ' ×' + k.n : '')).map(esc).join(' · ')}</small>`, color: 'bal-blue', go: () => openHero() });
		items.push({ label: 'Close', color: 'bal-grey', go: closeMenu });
		ctx.setMenu(items, `${h.name} · ${h.title} · a deck of ${S.deck.length} cards`);
		P.menu.i = items.length - 1; ctx.menuMove(0);
	}
	function openShapes(i, got) {
		P.mode = 'td-menu';
		const items = Object.keys(SHAPES).map((sh) => ({ label: `${glyph(sh)} ${esc(SHAPE_NAME[sh])}`, color: 'bal-blue', go: () => { const next = [...got, sh]; if (next.length < 2) return openShapes(i, next); ctx.setMenu(null); P.mode = 'td'; order({ t: 'pick', i, shapes: next }); if (T.S.pick) openPick(); else if (T.S.perks) openPerk(); } }));
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
				wait ? { label: S.pick || S.perks ? (S.pick ? 'Pick your reward' : 'Pick your passive') + ' <small>the next wave waits for it</small>' : `Call wave ${S.wave + 1} <small>your blocks lock when it starts</small>`, color: 'bal-green', go: () => { ctx.setMenu(null); P.mode = 'td'; callWave(); } } : { label: 'Resume', color: 'bal-green', go: () => { T.paused = false; closeMenu(); } },
				...(wait ? [{ label: 'Keep building', color: 'bal-blue', go: () => { T.paused = false; closeMenu(); } }, { label: `Draw a card <small>${v.drawCost}●</small>`, color: 'bal-gold', off: (v.hand.length >= v.handMax && 'The hand is full') || (E < v.drawCost && 'Not enough gold'), go: () => { order({ t: 'draw' }); openField(); } }] : []),
				{ label: `Speed <small>${T.speed}×</small>`, color: 'bal-blue', go: () => { nextSpeed(); openField(); } },
				autoItem(), reachItem(), damageItem(),
				fxItem(),
				...(S.hero ? [{ label: `${esc(heroById(S.hero).name)} <small>${S.passives.length} passive${S.passives.length === 1 ? '' : 's'} · a deck of ${S.deck.length}</small>`, color: 'bal-purple', go: openHero }] : []),
				{ label: 'How to play', color: 'bal-grey', go: () => { closeMenu(); ctx.help(); } },
				{ label: 'Retire <small>end the run, keep what it earned</small>', color: 'bal-red', go: () => { ctx.setMenu([{ label: 'Retire', color: 'bal-red', go: () => { ctx.setMenu(null); P.mode = 'td'; order({ t: 'retire' }); } }, { label: 'Keep playing', color: 'bal-green', go: closeMenu }], 'Retire? The run ends at wave ' + S.cleared + '.'); P.menu.i = 1; ctx.menuMove(0); } },
			], `${wait ? 'Building' : 'Paused'} · wave ${S.wave || 1} · ♥ ${S.lives} · ${E}●`);
			return;
		}
		ctx.setMenu([
			{ label: 'Resume', color: 'bal-green', go: () => { T.paused = false; closeMenu(); } },
			{ label: `Speed <small>${T.speed}×</small>`, color: 'bal-blue', go: () => { nextSpeed(); openField(); } },
				reachItem(), damageItem(),
				fxItem(),
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
		ctx.onOver({ S: T.S, map: T.map, seed: T.seed, squad: T.squad, inputs: T.inputs, recipe: recipe(), record: T.S.cleared > T.best, hero: T.hero, dealt: T.S.towers.map((t) => ({ uid: t.uid, species: unit(t.uid).species, n: T.dealt[t.uid] || 0 })) });
	}

	// ---- in and out
	/** A new run on a map with a squad (figurines, in order). opts: { seed, startWave, rev (tests: a run under older rules, on the map those rules knew) } */
	function open(mapId, squad, opts = {}) {
		const map = typeof mapId === 'string' ? tdMapById(mapId, opts.rev) : mapId;
		if (!map || !squad.length) return false;
		// (the sim runs on the figurines as a recipe keeps them, so the live run and its replay are the very same run)
		enter('play', map, opts.seed || 'td-' + Date.now().toString(36), squad.slice(0, TD.SQUAD_MAX).map(slimFig), opts.startWave || 1, opts.hero);
		T.best = opts.best || 0; T.inputs = []; T.rec = null; T.drv = null;
		T.sawOrders = false; T.coach = opts.coach === false || coachSeen(isMazeMap(map) ? COACH_MZ_KEY : COACH_KEY) ? null : 0;   // (the first run of each kind on this device is coached)
		adopt(TD.newRun(T.seed, { map, squad: T.squad, startWave: T.startWave, ...(T.hero ? { hero: T.hero } : {}), ...(T.hero && opts.deck2 === true ? { deck2: true } : {}), ...(opts.rev ? { rev: opts.rev } : {}) }, data));
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
		const rec = saved && saved.recipe, map = rec && tdMapById(rec.map, rec.rev || 1);
		if (!map) return false;
		enter('play', map, rec.seed, rec.squad, rec.startWave, rec.hero);
		T.best = opts.best || 0; T.inputs = rec.inputs.map(([t, a]) => [t, a]); T.rec = null; T.drv = null;
		adopt(tdRunTo(rec, rec.end, data, (ev) => tally(ev)));
		show(map);
		T.paused = true; drawBar();
		ctx.banner('Resumed · wave ' + Math.max(1, T.S.wave) + ' · paused');
		save();
		broadcast();
		return true;
	}
	/** A signed-in player's run goes live for friends: the recipe so far, the tick it stands on and its hash. (The head carries
	 *  the run's rules revision: a follower must play it by the same rules; without it they fell back to the first.) */
	function broadcast() {
		if (!ctx.live) return;
		ctx.live(() => (T.S && playing() ? { td: 1, head: { seed: T.seed, map: T.map.id, squad: T.squad, startWave: T.startWave, rev: T.S.rev, ...(T.hero ? { hero: T.hero } : {}) }, inputs: T.inputs, tick: T.S.tick, hash: TD.hashOf(T.S), over: T.S.over } : null),
			() => 'Poketactica · ' + (isMazeMap(T.map) ? 'Maze Builder' : 'Tower Defense') + ' · ' + T.map.name + ' · wave ' + Math.max(1, T.S ? T.S.wave : 1),
			// (a bet: does this run beat the map's best wave?)
			() => (T.S && playing() ? { run: T.seed, prog: T.S.cleared, res: T.S.over ? (T.S.cleared > T.best ? 'win' : 'lose') : null } : null));
	}
	function close() {
		if (T.S && playing() && !T.S.over) save();
		document.body.classList.remove('pt-tding'); P.sceneryKind = null;
		if (T.bar) T.bar.hidden = true;
		if (T.tray) { T.tray.hidden = true; T.tray.innerHTML = ''; T.tray.dataset.h = ''; }
		document.body.classList.remove('pt-mzhand');
		ctx.setMenu(null);
		P.hl = {}; P.marks = null; T.S = null; P.groundOver = null;
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
			T.autoT = 0;
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
	function tap(x, y) { T.autoT = 0; if (!playing()) { P.cursor = { x, y }; draw(); return; } if (P.menu) { closeMenu(); return; } if (T.S.over) return; if (cardSel()) { ghostStep(x, y); return; } P.cursor = { x, y }; act(x, y); }
	return { open, resume, watch, follow, close, onAction, onWatchAction, tap, frame, order, recipe, T, get active() { return P.screen === 'td' && !!T.S; }, view: () => TD.view(T.S), hash: () => TD.hashOf(T.S) };
}
