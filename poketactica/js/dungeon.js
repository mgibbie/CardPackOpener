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

/**
 * A CHOICE BETWEEN FLOORS (Plans/POKETACTICA_MODES_PLAN.md item D2). "The Dungeon is a straight line." After a floor is
 * cleared there are two doors to the next, each saying what is behind it:
 *   the Quiet door    the floor as it is
 *   the Gilded door   the same floor with stronger foes (doorLevel) and more stars (doorStars)
 * A boss floor has one door. Only a run with twists (D1: seed `tw...`) has doors. The run keeps the door taken
 * (`run.door`: 'rich'), so the floor is the same floor when the battle is resumed.
 */
export const DOORS = Object.freeze({ safe: { name: 'Quiet door' }, rich: { name: 'Gilded door', lvPart: 0.15, lvMin: 2, starsPart: 1.5 } });
export const doorLevel = (lv) => Math.min(MAX_LEVEL, lv + Math.max(DOORS.rich.lvMin, Math.ceil(lv * DOORS.rich.lvPart)));
export const doorStars = (floor) => Math.round(floorStars(floor) * DOORS.rich.starsPart);
/** Are there two doors to this floor of this run? */
export const doorsAt = (seed, floor) => hasTwists(seed) && floor > 1 && !isBossFloor(floor);
/** What is behind each door to a floor: -> { safe: { name, level, stars, twist }, rich: {...} } (twist: its name, or null). */
export function doorsSay(seed, floor) {
	const tw = twistOf(seed, floor), twist = tw ? TWISTS[tw].name : null, lv = floorLevel(floor);
	return { safe: { name: DOORS.safe.name, level: lv, stars: floorStars(floor), twist }, rich: { name: DOORS.rich.name, level: doorLevel(lv), stars: doorStars(floor), twist } };
}
function withDoor(m, seed, floor, door) {
	if (door !== 'rich' || !m || !doorsAt(seed, floor)) return m;
	const stars = doorStars(floor);
	return { ...m, door: 'rich', name: m.name + ' · ' + DOORS.rich.name, foes: m.foes.map((f) => ({ ...f, lv: doorLevel(f.lv) })), reward: { ...m.reward, stars },
		tip: `Behind the Gilded door: stronger foes, and ${stars} ★. ` + m.tip.replace('Clear it for ' + floorStars(floor) + ' ★', 'Clear it for ' + stars + ' ★') };
}
export function genFloor(seed, floor, data, door = null) {
	if (door) return withDoor(genFloor(seed, floor, data), seed, Math.max(1, floor | 0), door);
	floor = Math.max(1, floor | 0);
	// (a layout whose reachable ground can't hold every foe is drawn again; the last try is flat ground)
	for (let k = 0; k < 12; k++) { const m = tryFloor(seed + ':floor' + floor + (k ? ':' + k : ''), floor, data, k === 11); if (m) return withGear(withTwist(m, seed, floor, data), seed, floor, data); }
	return null;
}
/**
 * FLOORS WITH A TWIST (Plans/POKETACTICA_MODES_PLAN.md item D1). "Every floor between bosses is the same fight, deeper."
 * Every TWIST_EVERY-th floor that is not a boss floor has one of three twists, picked by a die of its own (the floor
 * under it is the floor it would have been):
 *   geo        nearly every tile is coloured, so the floor's Geo Symbols reach almost everywhere
 *   type       every foe is of one type
 *   treasure   one foe is a TREASURE foe: it does not fight, it runs, and it is gone when turn FLEE_TURN comes round.
 *              Knocked out first, it pays the floor's stars again.
 * Only a run begun with twists has them (its seed says so: `tw...`), so a run under way when this shipped, and a battle
 * saved in one, are what they were.
 */
export const TWIST_EVERY = 3, FLEE_TURN = 4;
export const TWISTS = Object.freeze({
	geo: { name: 'Geo floor', say: 'Nearly every tile is coloured here: the Geo Symbols reach almost everywhere.' },
	type: { name: 'One-type floor', say: 'Every foe here is of one type.' },
	treasure: { name: 'Treasure floor', say: `A treasure foe is here. It does not fight: it runs, and it is gone when turn ${FLEE_TURN} comes round. Knock it out first and the floor pays double.` },
});
const TWIST_KINDS = Object.keys(TWISTS);
export const hasTwists = (seed) => /^tw[a-z0-9]+$/.test(String(seed));
/** The twist of a run's floor: 'geo' | 'type' | 'treasure', or null. */
export const twistOf = (seed, floor) => (hasTwists(seed) && floor >= TWIST_EVERY && floor % TWIST_EVERY === 0 && !isBossFloor(floor) ? TWIST_KINDS[Math.floor(makeRng(seed + ':twist' + floor)() * TWIST_KINDS.length)] : null);
/** What knocking out a floor's treasure foe pays: the floor's stars again. */
export const treasureStars = (floor) => floorStars(floor);
/**
 * FOES WITH LEVELLED ITEMS, DEEP DOWN (Plans/POKETACTICA_MODES_PLAN.md item D3; carried from the Item World plan). "The
 * player's ceiling rose with the Item World; nothing else's did." From floor GEAR_FROM of a run with twists:
 *   the boss's held item is LEVELLED (gearLevel: 10 at floor 30, 1.5 more a floor, 100 at most), and
 *   some of the other foes (gearCount: one at floor 30, one more every 20 floors, four at most) hold their type's
 *   booster at that level too. Which ones is a die of its own. A treasure foe holds nothing.
 * A levelled item is the player's own kind of item (gear.js heldAt): the same rules read it.
 */
export const GEAR_FROM = 30;
export const gearLevel = (floor) => (floor < GEAR_FROM ? 1 : Math.min(100, Math.round(10 + (floor - GEAR_FROM) * 1.5)));
export const gearCount = (floor) => (floor < GEAR_FROM ? 0 : Math.min(4, 1 + Math.floor((floor - GEAR_FROM) / 20)));
/** Does this run's floor have levelled items on its foes? */
export const gearAt = (seed, floor) => hasTwists(seed) && floor >= GEAR_FROM;
function withGear(m, seed, floor, data) {
	if (!m || !gearAt(seed, floor)) return m;
	const rng = makeRng(seed + ':gear' + floor), lv = gearLevel(floor), foes = m.foes.map((f) => ({ ...f }));
	const plain = foes.map((f, i) => i).filter((i) => !foes[i].boss && !foes[i].treasure);
	for (let i = plain.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [plain[i], plain[j]] = [plain[j], plain[i]]; }
	const holders = plain.slice(0, gearCount(floor));
	for (const i of holders) foes[i].held = BOSS_HELD[((data.species[foes[i].sp] || {}).types || [])[0]] || 'sitrusberry';
	let n = 0;
	for (const f of foes) if (f.held) { f.heldLv = lv; n++; }
	if (!n) return m;
	return { ...m, foes, gear: { lv, n }, tip: `Deep floor: ${n} of the foes hold${n === 1 ? 's' : ''} a Lv ${lv} item. ` + m.tip };
}
function withTwist(m, seed, floor, data) {
	const kind = twistOf(seed, floor);
	if (!kind) return m;
	const rng = makeRng(seed + ':twist' + floor + ':' + kind);
	const out = { ...m, twist: kind, name: m.name + ' · ' + TWISTS[kind].name, foes: m.foes.map((f) => ({ ...f })) };
	let say = TWISTS[kind].say;
	if (kind === 'geo') {
		const used = [...new Set(m.geo.join('').replace(/\./g, ''))], letters = used.length ? used : ['b'];
		out.geo = m.geo.map((row, y) => [...row].map((ch, x) => (ch !== '.' || m.rows[y][x] === '#' ? ch : letters[((x >> 1) + (y >> 1)) % letters.length])).join(''));
	} else if (kind === 'type') {
		const types = (data.species[m.foes[0].sp] || {}).types || ['Normal'], type = types[Math.floor(rng() * types.length)];
		out.foes = out.foes.map((f) => ({ ...f, sp: pickSpeciesOfType(rng, data, floor, false, type).id }));
		out.twistType = type; say = `Every foe here is a ${type} type.`;
	} else {
		const f = out.foes[out.foes.length - 1];
		f.ai = 'flee'; f.treasure = true;
		say = `A treasure foe is here (${(data.species[f.sp] || {}).name || f.sp}). It does not fight: it runs, and it is gone when turn ${FLEE_TURN} comes round. Knock it out first for ${treasureStars(floor)} ★ more.`;
	}
	out.tip = say + ' ' + m.tip;
	return out;
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
/** -> { seed, floor, clean? } | null   (clean: the floors this run has cleared in a row with nobody lost) */
export function loadRun(LS = globalThis.localStorage) {
	try { const r = JSON.parse(LS.getItem(RUN_KEY) || 'null'); return r && typeof r.seed === 'string' && /^[a-z0-9]{1,40}$/.test(r.seed) && Number.isInteger(r.floor) && r.floor >= 1 ? { seed: r.seed, floor: r.floor, ...(Number.isInteger(r.clean) && r.clean > 0 ? { clean: Math.min(r.clean, 99999) } : {}), ...(r.door === 'rich' ? { door: 'rich' } : {}) } : null; } catch { return null; }
}
export function saveRun(run, LS = globalThis.localStorage) {
	try { if (run) LS.setItem(RUN_KEY, JSON.stringify({ seed: run.seed, floor: run.floor, ...(run.clean > 0 ? { clean: run.clean } : {}), ...(run.door === 'rich' ? { door: 'rich' } : {}) })); else LS.removeItem(RUN_KEY); } catch { /* (private mode: the run lasts the visit) */ }
}

// ---------------------------------------------------------------- RECORDS THAT MEAN SOMETHING (plan item D5)
// The Dungeon kept one number: the deepest BOSS beaten (the checkpoint). Three more are kept, each a thing a player can
// set out to beat:
//   far     the deepest floor cleared, boss or not (a run that dies on floor 17 got to 16)
//   clean   the most floors cleared in a row, in one run, with nobody lost (the Dungeon is deadly: this is the careful run)
//   quick   the fewest turns a boss floor was won in
// They live in the collection's record map beside Tower Defense's best waves (figcol.js `td`: synced, the higher number
// wins a merge), so `quick` is kept as QUICK_BASE − turns: fewer turns is the higher number.
export const DG_FAR = 'dg-far', DG_CLEAN = 'dg-clean', DG_QUICK = 'dg-quick', QUICK_BASE = 1000;
export function dgRecords(col) { const t = (col && col.td) || {}; return { far: t[DG_FAR] | 0, clean: t[DG_CLEAN] | 0, quick: t[DG_QUICK] > 0 ? Math.max(1, QUICK_BASE - t[DG_QUICK]) : 0 }; }
/**
 * A floor is cleared. floor: its number; clean: the run's floors in a row with nobody lost, this one counted (0 when
 * someone was lost on it); turns: the turn it was won on (counted for a boss floor only).
 * -> { col (the same object when nothing was beaten), news: ['far' | 'clean' | 'quick'] }
 */
export function noteFloor(col, { floor, clean = 0, turns = 0 }) {
	const was = dgRecords(col), td = { ...((col && col.td) || {}) }, news = [];
	if (floor > was.far) { td[DG_FAR] = floor; news.push('far'); }
	if (clean > was.clean) { td[DG_CLEAN] = clean; news.push('clean'); }
	if (isBossFloor(floor) && turns >= 1 && turns < QUICK_BASE && (!was.quick || turns < was.quick)) { td[DG_QUICK] = QUICK_BASE - turns; news.push('quick'); }
	return news.length ? { col: { ...col, td }, news } : { col, news };
}
/** A record, said: 'Deepest floor: 16'. */
export const recordSay = (k, r) => (k === 'far' ? 'Deepest floor: ' + r.far : k === 'clean' ? 'Most floors in a row with nobody lost: ' + r.clean : 'Fastest boss: ' + r.quick + ' turn' + (r.quick === 1 ? '' : 's'));
export const newRun = (floor = 1, now = Date.now()) => ({ seed: 'tw' + now.toString(36), floor: Math.max(1, floor | 0) });   // (`tw`: a run with twist floors, plan item D1; older runs' seeds begin `r`)
