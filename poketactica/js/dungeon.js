// dungeon.js — the generated dungeon (stage 7, Disgaea's Item World): endless floors made from a run's seed, each harder
// than the one before. Every tenth floor is a BOSS floor; clearing one is an exit: it becomes a checkpoint (the
// collection's `deep`, figcol.js, synced), and a new run may start on the floor after any checkpoint reached.
//   - a floor is generated in the campaign's map format (campaign.js), so the same checks, builder and setup serve both
//   - the same (seed, floor) always gives the same floor: a run can be resumed, replayed and watched
//   - foes: their level grows with the floor (floorLevel); the species pool widens with it (base stat total), legendary
//     Pokémon only as deep bosses
//   - every floor cleared pays stars (floorStars); a boss floor three times as many, and the boss's figurine
//   - a lost floor ends the run (what the figurines learned they keep, as everywhere)
// The run itself (seed and floor) lives on the device (RUN_KEY); only the checkpoint travels with the account.
import { reach, isTile } from './engine/grid.js';
import { makeRng } from '../../overworld/rules/rng.js';

export const BOSS_EVERY = 10, MAX_LEVEL = 999;
export const RUN_KEY = 'magepunk_poketactica_dungeon_v1';
const JUMP = 2;   // the lowest Jump any figurine has: every foe must be reachable with it

/** The held item a boss floor's boss carries: its first type's booster (goods.js HELD). */
export const BOSS_HELD = Object.freeze({ Fire: 'charcoal', Water: 'mysticwater', Electric: 'magnet', Grass: 'miracleseed', Ice: 'nevermeltice', Fighting: 'blackbelt', Poison: 'poisonbarb',
	Ground: 'softsand', Flying: 'sharpbeak', Psychic: 'twistedspoon', Bug: 'silverpowder', Rock: 'hardstone', Ghost: 'spelltag', Dragon: 'dragonfang', Dark: 'blackglasses', Steel: 'metalcoat', Normal: 'silkscarf' });
/** Foe level on a floor: 4 on floor 1, +1.5 a floor; a boss five more. */
export const floorLevel = (floor, boss = false) => Math.min(MAX_LEVEL, Math.round(2.5 + 1.5 * floor) + (boss ? 5 : 0));
export const isBossFloor = (floor) => floor % BOSS_EVERY === 0;
/** Stars for clearing a floor: 10 + 2 a floor, a boss floor three times as many. */
export const floorStars = (floor) => (10 + 2 * floor) * (isBossFloor(floor) ? 3 : 1);
/** The floors a new run may start on: 1, and the floor after each checkpoint reached (deep = deepest boss floor cleared). */
export const startFloors = (deep) => { const out = [1]; for (let f = BOSS_EVERY; f <= (deep | 0); f += BOSS_EVERY) out.push(f + 1); return out; };
/** The boss's figurine id: the run's and the floor's, so it exists once whichever device the run's result lands on. */
export const bossFigId = (sp, seed, floor) => (sp + '-dgn-' + seed + '-f' + floor).replace(/[^a-z0-9_-]/g, '').slice(0, 60);

// ---------------------------------------------------------------- the species a floor can field
// legendary and mythical Pokémon (and Ultra Beasts), by National Dex number: only deep bosses are these
const LEGEND = [[144, 146], [150, 151], [243, 245], [249, 251], [377, 386], [480, 494], [638, 649], [716, 721], [772, 773], [785, 809], [888, 898], [905, 905], [1001, 1010], [1014, 1017], [1024, 1025]];
export const isLegend = (num) => LEGEND.some(([a, b]) => num >= a && num <= b);
const pools = new WeakMap();
function speciesPool(data) {
	if (pools.has(data.species)) return pools.get(data.species);
	const byNum = new Map();
	for (const [id, sp] of Object.entries(data.species)) {
		if (!(sp.num >= 1 && sp.num <= 1025) || !sp.baseStats || !(sp.learnset || []).length) continue;
		const prev = byNum.get(sp.num);
		if (!prev || id.length < prev.id.length) byNum.set(sp.num, { id, num: sp.num, types: sp.types || [], bst: Object.values(sp.baseStats).reduce((a, b) => a + b, 0), legend: isLegend(sp.num) });
	}
	const list = [...byNum.values()].sort((a, b) => a.num - b.num);
	pools.set(data.species, list);
	return list;
}
/** The base stat totals a floor's foes come from: low on early floors, rising to everything by floor 60. */
const bstBand = (floor) => [Math.min(420, 180 + 4 * floor), Math.min(800, 330 + 6 * floor)];
export function pickSpecies(rng, data, floor, boss) {
	const all = speciesPool(data);
	let [lo, hi] = bstBand(floor);
	if (boss) { lo += 80; hi += 120; }
	let pool = all.filter((s) => s.bst >= lo && s.bst <= hi && (!s.legend || (boss && floor >= 30)));
	if (pool.length < 8) pool = all.filter((s) => !s.legend || boss).sort((a, b) => Math.abs(a.bst - (lo + hi) / 2) - Math.abs(b.bst - (lo + hi) / 2)).slice(0, 40);
	return pool[Math.floor(rng() * pool.length)];
}

/** A species of one TYPE for a floor's depth (the Item World: a type booster's world holds that type; itemworld.js). From
 *  the floor's own band when it has a few of that type, else the ones of that type nearest the band; any species if none. */
export function pickSpeciesOfType(rng, data, floor, boss, type) {
	const all = speciesPool(data).filter((s) => s.types.includes(type) && (!s.legend || (boss && floor >= 30)));
	if (!all.length) return pickSpecies(rng, data, floor, boss);
	let [lo, hi] = bstBand(floor);
	if (boss) { lo += 80; hi += 120; }
	let pool = all.filter((s) => s.bst >= lo && s.bst <= hi);
	if (pool.length < 4) pool = all.slice().sort((a, b) => Math.abs(a.bst - (lo + hi) / 2) - Math.abs(b.bst - (lo + hi) / 2) || a.num - b.num).slice(0, 8);
	return pool[Math.floor(rng() * pool.length)];
}
/** The living-terrain letter a theme is dressed in (its first). */
export const themePatch = (theme) => (THEME_PATCH[theme] || ['.'])[0];

// ---------------------------------------------------------------- the floor
const GEO_LETTERS = ['r', 'b', 'p', 'o', 'c'];
const COLOR = { r: 'red', b: 'blue', p: 'purple', o: 'orange', c: 'cyan', y: 'yellow', g: 'green' };
const STATS = ['atk', 'def', 'spa', 'spd', 'spe'];
const STAT_NAME = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
function shuffle(rng, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** A symbol's effect, and how the tip names it. Deeper floors bring the harsher ones. */
function symbolEffect(rng, floor, types) {
	const kinds = ['heal', 'stat', 'exp', 'invincible', 'typeBoost', ...(floor >= 5 ? ['hurt', 'noMiss'] : []), ...(floor >= 12 ? ['enemyLv', 'silence', 'noLift'] : [])];
	const k = pick(rng, kinds);
	if (k === 'stat') { const stat = pick(rng, STATS); return [{ k, stat, mult: 1.5 }, STAT_NAME[stat] + ' +50%']; }
	if (k === 'typeBoost') { const type = pick(rng, types); return [{ k, type }, type + ' moves ×1.5']; }
	if (k === 'enemyLv') { const n = 1 + Math.floor(floor / 10); return [{ k, n }, 'foes +' + n + ' levels']; }
	return [{ k }, { heal: 'heal 20% each phase', exp: 'EXP ×1.5', invincible: 'invincible', hurt: 'hurt 20% each phase', noMiss: 'never miss', silence: 'no status moves', noLift: 'no lifting' }[k]];
}

/**
 * Floor `floor` (1, 2, ...) of the run `seed`, in the campaign's map format (campaign.js: rows, geo, base, symbols, foes,
 * reward, tip) plus { floor, boss }. `data` is the game data (species, extra) the foes are chosen from.
 */
// how a floor looks, by its ten-floor band (terrain3d.js THEMES), and the living terrain it is dressed in (engine/terrain.js):
// patches drawn from their OWN random stream, after the layout, so a floor's layout is the same as before they existed
export const FLOOR_THEMES = Object.freeze(['cave', 'ruins', 'forest', 'snow', 'volcano', 'islands']);
const THEME_PATCH = { cave: ['w', 'd'], ruins: ['g', 't'], forest: ['t', 't', 'w'], snow: ['i', 'i'], volcano: ['l', 'l'], islands: ['w', 't'] };
export const floorTheme = (floor) => FLOOR_THEMES[Math.floor((Math.max(1, floor) - 1) / BOSS_EVERY) % FLOOR_THEMES.length];
function dressFloor(rseed, floor, w, h, height, keep) {
	const rng = makeRng(rseed + ':ground'), theme = floorTheme(floor), ground = new Array(w * h).fill('.');
	const kinds = THEME_PATCH[theme];
	for (let n = int(rng, 2, 4); n > 0; n--) {
		const L = pick(rng, kinds), pw = int(rng, 1, 3), ph = int(rng, 1, 3), px = int(rng, 0, w - pw), py = int(rng, 0, h - ph);
		for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) if (height[y * w + x] != null && !keep.has(x + ',' + y)) ground[y * w + x] = L;
	}
	const rows = [];
	for (let y = 0; y < h; y++) rows.push(ground.slice(y * w, y * w + w).join(''));
	return { theme, ground: rows };
}

export function genFloor(seed, floor, data) {
	floor = Math.max(1, floor | 0);
	// (a layout whose reachable ground can't hold every foe is drawn again; the last try is flat ground)
	for (let k = 0; k < 12; k++) { const m = tryFloor(seed + ':floor' + floor + (k ? ':' + k : ''), floor, data, k === 11); if (m) return m; }
	return null;
}
function tryFloor(rseed, floor, data, flat) {
	const rng = makeRng(rseed), boss = isBossFloor(floor);
	const w = int(rng, 8, 12), h = int(rng, 7, 10), N = w * h;
	// heights: plateaus (higher ones deeper down), a few gaps
	const height = new Array(N).fill(0), maxH = Math.min(6, 2 + Math.floor(floor / 8));
	for (let i = int(rng, 2, 4 + Math.min(4, floor >> 3)); i > 0; i--) {
		const pw = int(rng, 2, 4), ph = int(rng, 2, 4), px = int(rng, 0, w - pw), py = int(rng, 0, h - ph), ht = int(rng, 1, maxH);
		for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) height[y * w + x] = Math.max(height[y * w + x], ht);
	}
	// the base: a ground-level tile in a corner region
	const corner = int(rng, 0, 3), bx = corner & 1 ? w - 1 - int(rng, 0, 1) : int(rng, 0, 1), by = corner & 2 ? h - 1 - int(rng, 0, 1) : int(rng, 0, 1);
	for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (x >= 0 && y >= 0 && x < w && y < h) height[y * w + x] = 0;
	for (let i = int(rng, 0, 3); i > 0; i--) { const x = int(rng, 0, w - 1), y = int(rng, 0, h - 1); if (Math.abs(x - bx) + Math.abs(y - by) > 2) height[y * w + x] = null; }
	if (flat) height.fill(0);
	const map = { w, h, height };
	const walk = reach(map, bx, by, 999, JUMP, () => null);
	// Geo: a few coloured patches
	const geo = new Array(N).fill('.');
	const letters = shuffle(rng, [...GEO_LETTERS, ...(floor >= 8 ? ['y', 'g'] : [])]).slice(0, int(rng, 1, 3));
	for (const L of letters) for (let i = int(rng, 1, 2); i > 0; i--) {
		const pw = int(rng, 2, 5), ph = int(rng, 2, 4), px = int(rng, 0, w - pw), py = int(rng, 0, h - ph);
		for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) if (height[y * w + x] != null) geo[y * w + x] = L;
	}
	// foes: on tiles reachable from the base, away from it (the far ones first)
	const taken = new Set([bx + ',' + by]);
	const far = shuffle(rng, [...walk.values()].filter((t) => Math.abs(t.x - bx) + Math.abs(t.y - by) >= 4)).sort((a, b) => b.d - a.d);
	const spots = far.filter((_, i) => i < Math.max(12, far.length >> 1));
	shuffle(rng, spots);
	const nFoes = Math.min(8, 3 + Math.floor(floor / 6)), foes = [];
	for (let i = 0; i < nFoes && spots.length; i++) {
		const t = spots.pop(); taken.add(t.x + ',' + t.y);
		const isBoss = boss && i === 0, sp = pickSpecies(rng, data, floor, isBoss);
		foes.push({ sp: sp.id, lv: floorLevel(floor, isBoss), x: t.x, y: t.y, ai: isBoss ? 'aggro' : rng() < 0.75 ? 'aggro' : 'passive', ...(isBoss ? { boss: true } : {}) });
	}
	if (foes.length < nFoes) return null;
	// Geo Symbols: on coloured tiles a figurine can walk up to
	const types = [...new Set(foes.flatMap((f) => data.species[f.sp].types || []))];
	const symbols = [], named = [];
	const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walk.has((x + dx) + ',' + (y + dy)));
	const cand = shuffle(rng, [...Array(N).keys()].filter((i) => geo[i] !== '.' && height[i] != null && near(i % w, Math.floor(i / w))));
	for (let n = int(rng, floor >= 3 ? 1 : 0, Math.min(3, 1 + Math.floor(floor / 10))); n > 0 && cand.length;) {
		const i = cand.pop(), x = i % w, y = Math.floor(i / w);
		if (taken.has(x + ',' + y)) continue;
		taken.add(x + ',' + y); n--;
		const [effect, what] = symbolEffect(rng, floor, types.length ? types : ['Normal']);
		const others = letters.filter((L) => L !== geo[i]);
		symbols.push({ x, y, color: others.length && rng() < 0.5 ? COLOR[pick(rng, others)] : 'clear', effect });
		named.push(what + ' on ' + COLOR[geo[i]]);
	}
	const rows = [], geoRows = [];
	for (let y = 0; y < h; y++) {
		let r = '', g = '';
		for (let x = 0; x < w; x++) { const v = height[y * w + x]; r += v == null ? '#' : v === 0 ? '.' : String(v); g += geo[y * w + x]; }
		rows.push(r); geoRows.push(g);
	}
	const bossFoe = foes.find((f) => f.boss);
	if (bossFoe) bossFoe.held = BOSS_HELD[((data.species[bossFoe.sp] || {}).types || [])[0]] || 'sitrusberry';   // (a boss holds its type's booster; no random draw, so the floor's layout is unchanged)
	const tip = floor === 1 ? 'Every floor is new and a little harder. Clear floor 10, the first boss floor, to set a checkpoint: later runs can start after it.'
		: boss ? `Boss floor! Beat ${(data.species[bossFoe.sp] || {}).name || bossFoe.sp} (Lv ${bossFoe.lv}) for its figurine, ${floorStars(floor)} ★ and a checkpoint.`
		: (named.length ? 'Geo Symbols: ' + named.join('; ') + '. ' : '') + `Clear it for ${floorStars(floor)} ★. Next boss: floor ${Math.ceil(floor / BOSS_EVERY) * BOSS_EVERY}.`;
	// living terrain: kept off the base, the foes' tiles and the symbols (a foe never starts in lava)
	const dress = dressFloor(rseed, floor, w, h, height, new Set([...taken, ...[[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => (bx + dx) + ',' + (by + dy))]));
	return {
		id: 'dgn', floor, boss, name: 'Dungeon floor ' + floor + (boss ? ' · Boss' : ''), rows, geo: geoRows, base: [bx, by], symbols, foes, tip, ...dress,
		reward: { stars: floorStars(floor), ...(bossFoe ? { fig: { sp: bossFoe.sp, lv: Math.max(1, bossFoe.lv - 3) } } : {}) },
	};
}

// ---------------------------------------------------------------- the run on this device
/** -> { seed, floor } | null */
export function loadRun(LS = globalThis.localStorage) {
	try { const r = JSON.parse(LS.getItem(RUN_KEY) || 'null'); return r && typeof r.seed === 'string' && /^[a-z0-9]{1,40}$/.test(r.seed) && Number.isInteger(r.floor) && r.floor >= 1 ? { seed: r.seed, floor: r.floor } : null; } catch { return null; }
}
export function saveRun(run, LS = globalThis.localStorage) {
	try { if (run) LS.setItem(RUN_KEY, JSON.stringify({ seed: run.seed, floor: run.floor })); else LS.removeItem(RUN_KEY); } catch { /* (private mode: the run lasts the visit) */ }
}
export const newRun = (floor = 1, now = Date.now()) => ({ seed: 'r' + now.toString(36), floor: Math.max(1, floor | 0) });
