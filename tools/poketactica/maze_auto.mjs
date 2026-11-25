// maze_auto.mjs — a headless auto-player for Tower Defense's MAZE BUILDER (Plans/POKETACTICA_MAZE_BUILDER_PLAN.md stage 5:
// tuning). It plays a map many times with a simple, sensible builder and prints how far the runs get, so the gold
// numbers, the enemies' HP and the stop limit can be set against the plan's targets.
// The builder, each build phase: takes a reward (a bonus block if one is offered, else gold, else cards, else a life);
// lays its cards along a plain back-and-forth plan (a wall down every other column, the gaps at the top and the bottom
// in turn: one block alone rarely lengthens a way over open ground, a wall does), most of the card on the plan and
// never shortening the way; with a full hand it discards a card that fits nowhere; stands each figurine it can pay for on the block or rock that covers the most of the way; draws while it has
// gold to spare and nothing else to buy; then calls the wave.
//   node tools/poketactica/maze_auto.mjs [--map=mz-field | all] [--level=18] [--runs=4] [--squad=12] [--max=120000] [--style=maze|line|none] [--hero=brock|misty|surge|erika|lance] [--rev=13]
//     --style=line: lays no blocks but the ones its figurines need (how much the maze itself is worth)
import path from 'path';
import { fileURLToPath } from 'url';
import * as TD from '../../poketactica/js/td/sim.js';
import { tdKind } from '../../poketactica/js/td/effects.js';
import { MAZE_MAPS, tdMapById } from '../../poketactica/js/td/maps.js';
import { tdRewards } from '../../poketactica/js/td/rewards.js';
import { cellsAt, wayLength, SHAPES } from '../../poketactica/js/td/maze.js';
import { placeCost, drawCost, HAND_MAX } from '../../poketactica/js/td/cards.js';
import { moveOf } from '../../poketactica/js/engine/battle.js';
import { slimFig } from '../../poketactica/js/replay.js';
import { loadData, squadAt } from './td_auto.mjs';

const total = (ways) => ways.reduce((a, p) => a + wayLength(p), 0);
function reachOf(fig, data) {
	let best = 1;
	for (const id of fig.equipped) {
		const m = moveOf({ fig }, id, data);
		if (!m || tdKind(id, m) !== 'damage') continue;
		best = Math.max(best, ['line', 'cone', 'arc', 'dash'].includes(m.s) ? m.n || 1 : (m.r || [1, 1])[1] + (['dia', 'cross'].includes(m.s) ? m.n || 0 : 0));
	}
	return best;
}
/** The plan: a wall down every other column that holds no gate and no base, its one gap at the top and the bottom in turn. -> Set of tile indexes */
function planOf(S) {
	const W = S.B.map.w, H = S.B.map.h, plan = new Set(), keep = new Set([S.B.map.base.x, ...S.gates.map((g) => g[0])]);
	let k = 0, last = -9;
	for (let x = 1; x < W - 1; x++) {
		if (keep.has(x) || keep.has(x - 1) || keep.has(x + 1) || x - last < 2) continue;
		const gap = k++ % 2 ? H - 1 : 0;
		for (let y = 0; y < H; y++) if (y !== gap) plan.add(y * W + x);
		last = x;
	}
	return plan;
}
/** The best place for a card: the most of it on the plan (at least all but one tile), then the longer way; never a shorter one. -> { turns, x, y, gain } or null */
function bestSpot(S, card) {
	const W = S.B.map.w, H = S.B.map.h, now = total(S.paths), plan = planOf(S), size = SHAPES[card.shape].length;
	let best = null;
	for (let turns = 0; turns < (card.shape === 'O' || card.shape === 'one' ? 1 : 4); turns++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const cells = cellsAt(card.shape, turns, x, y), on = cells.filter(([cx, cy]) => plan.has(cy * W + cx)).length;
		if (on < Math.max(1, size - 1)) continue;
		const ways = TD.waysWith(S, card.shape, turns, x, y);
		if (!ways) continue;
		const len = total(ways) - now, gain = on * 100 + len;
		if (len < 0) continue;
		if (!best || gain > best.gain) best = { turns, x, y, gain };
	}
	return best;
}
/** One build phase's orders, applied as they are chosen (each depends on the last). -> how many */
export function build(S, data, style = 'maze') {
	const ap = (a) => TD.applyInput(S, a, data);
	let n = 0;
	while (S.pick) {
		const o = S.pick.opts, i = ['bonus', 'upgrade', 'gold', 'cards', 'life'].map((k) => o.findIndex((x) => x && x.k === k)).find((k) => k >= 0);
		// (rules 15: an upgrade goes on the deck's first plain card; it never trims: its plan wants every block)
		if (ap({ t: 'pick', i, ...(o[i].k === 'cards' ? { shapes: ['I', 'L'] } : {}), ...(o[i].k === 'upgrade' ? { card: (S.deck || []).findIndex((c) => !c.bonus) } : {}) })) break;
		n++;
	}
	while (S.perks) { if (ap({ t: 'perk', i: 0 })) break; n++; }   // (a hero's passive: the first offered)
	const layAll = (need) => {
		for (let guard = 0; guard < 12; guard++) {
			let best = null;
			for (const c of S.hand) { const b = bestSpot(S, c); if (b && b.gain >= need && (!best || b.gain > best.gain)) best = { ...b, card: c.id }; }
			if (!best || ap({ t: 'block', card: best.card, turns: best.turns, x: best.x, y: best.y })) break;
			n++;
		}
	};
	const standing = () => { const W = S.B.map.w; let k = 0; for (let i = 0; i < W * S.B.map.h; i++) if (S.B.map.height[i] > 0 && !S.towers.some((t) => t.y * W + t.x === i)) k++; return k; };
	if (style === 'maze') layAll(1);
	// figurines: each on the raised tile that covers the most of the way
	for (let guard = 0; guard < TD.SQUAD_MAX; guard++) {
		const fig = S.squad.findIndex((_, i) => !S.placed[i]);
		if (fig < 0 || S.gold < TD.view(S).placeCost) break;
		if (!standing()) {   // (nowhere to stand: a block for it, even one that does not lengthen the way)
			const c = S.hand[0], b = c && bestSpot(S, c);
			if (!b || ap({ t: 'block', card: c.id, turns: b.turns, x: b.x, y: b.y })) break;
			n++;
		}
		const r = reachOf(S.squad[fig], data), W = S.B.map.w, H = S.B.map.h;
		let best = null;
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
			if (TD.placeBlock(S, fig, x, y)) continue;
			let score = 0;
			for (const p of S.paths) for (const [px, py] of p) if (Math.abs(px - x) + Math.abs(py - y) <= r) score++;
			if (score > 0 && (!best || score > best.score)) best = { score, x, y };
		}
		if (!best || ap({ t: 'place', fig, x: best.x, y: best.y })) break;
		n++;
	}
	if (style === 'maze') {
		// spare gold: more cards (never the gold the next figurine needs)
		const waiting = S.squad.some((_, i) => !S.placed[i]);
		for (let guard = 0; guard < 4; guard++) {
			if (S.hand.length >= TD.view(S).handMax) { const dead = S.hand.find((c) => !bestSpot(S, c) || bestSpot(S, c).gain < 1); if (!dead || ap({ t: 'discard', card: dead.id })) break; n++; continue; }
			{ const v = TD.view(S); if (S.gold - v.drawCost < (waiting ? v.placeCost : 0) || ap({ t: 'draw' })) break; }
			n++; layAll(1);
		}
	}
	return n;
}
/** One run to its end (or `max` ticks). */
export function mazeRun(seed, map, squad, data, max = 120000, style = 'maze', each, hero = null, rev = 0) {
	const S = TD.newRun(seed, { map, squad: squad.map(slimFig), ...(hero ? { hero } : {}), ...(rev ? { rev } : {}) }, data);   // (rev: as a run of that rules revision, e.g. 13: before the enemy kinds)
	while (!S.over && S.tick < max) {
		if (S.phase === 'wait') { build(S, data, style); TD.applyInput(S, { t: 'call' }, data); }
		TD.step(S, [], data);
		if (each) each(S);
	}
	const r = tdRewards(S);
	return { wave: S.cleared, ticks: S.tick, kills: S.kills, lives: S.lives, stars: r.stars, exp: Object.values(r.exp).reduce((a, b) => a + b, 0), over: S.over, towers: S.towers.length, blocks: S.blocks.length, way: total(S.paths), gold: S.gold, hash: TD.hashOf(S), passives: (S.passives || []).length, deck: S.deck ? S.deck.length : 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const data = loadData(), runs = +arg('runs', 4), level = +arg('level', 18), size = +arg('squad', 12), max = +arg('max', 120000), style = arg('style', 'maze'), hero = arg('hero', '') || null, rev = +arg('rev', 0) || 0;
	const maps = arg('map', 'all') === 'all' ? MAZE_MAPS : [tdMapById(arg('map', 'mz-field'))];
	for (const m of maps) {
		const squad = squadAt(level, size, data), out = [];
		for (let k = 0; k < runs; k++) out.push(mazeRun('mz-auto-' + m.id + '-' + k, m, squad, data, max, style, null, hero, rev));
		const avg = (f) => out.reduce((a, o) => a + f(o), 0) / out.length, min = (o) => o.ticks / TD.TPS / 60;
		console.log(`${m.name}, ${size} at Lv ${level} (${style}${hero ? ', ' + hero : ''}): waves ${Math.min(...out.map((o) => o.wave))}-${Math.max(...out.map((o) => o.wave))} (avg ${avg((o) => o.wave).toFixed(1)}) · ${avg(min).toFixed(1)} min at 1× · ${avg((o) => o.stars).toFixed(0)} ★ = ${(avg((o) => o.stars) / avg(min)).toFixed(1)} ★/min · EXP ${(avg((o) => o.exp) / avg(min)).toFixed(0)}/min · way ${avg((o) => o.way).toFixed(0)} · blocks ${avg((o) => o.blocks).toFixed(0)} · towers ${avg((o) => o.towers).toFixed(1)} · gold left ${avg((o) => o.gold).toFixed(0)} · unfinished ${out.filter((o) => !o.over).length}`);
	}
}
