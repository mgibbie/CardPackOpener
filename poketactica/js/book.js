// book.js — the FIGURINE BOOK (owner, 2026-11-22): every Pokémon in the National Dex (1-1025) by generation, which ones the
// player owns (and how many, the best level, a shiny), which they have met in a cleared story map, and WHERE TO FIND each:
//   - the overworld: where it lives in the wild (encounters.json; region, map, how, levels): a catch there gives its
//     figurine 1 time in 10 (overworld/ow_figurine.js)
//   - a figurine ball on a route (FIGURINE_BALLS)
//   - the story: a map's foe (throw it, weakened, onto your base to catch it) or a map's first-clear reward
//   - Training Grounds' wild Pokémon, the Dungeon's floors (by its base stat band; legendaries only as bosses from floor 30)
//   - the starters (and the Shop), and evolving the Pokémon it evolves from
// Pure: the page hands in the data (the overworld's encounters and regions are fetched when the book first opens).
// HOENN2 is gleep's region: never listed.
import { MAPS } from './campaign.js';
import { STARTERS } from './figcol.js';
import { SHOP_FIG_STARS, goodName } from './goods.js';
import { WILD_SPECIES } from './demo.js';
import { evolutionsOf } from './evolve.js';
import { FIGURINE_BALLS } from './figballs.js';
import { isLegend, BOSS_EVERY } from './dungeon.js';
import { DUNGEONS as MM_DUNGEONS, kindsOf } from './mm/dungeons.js';

export const DEX_MAX = 1025;
export const GENS = Object.freeze([[1, 151], [152, 251], [252, 386], [387, 493], [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025]]);
export const genOf = (num) => GENS.findIndex(([a, b]) => num >= a && num <= b) + 1;
const HIDDEN_REGIONS = new Set(['HOENN2']);   // (gleep's region)
const REGION_NAME = { KANTO: 'Kanto', JOHTO: 'Johto', HOENN: 'Hoenn', SINNOH: 'Sinnoh', JOHKANTO: 'JohKanto', OTHER: '' };
const HOW = { land: 'grass', water: 'surfing', fishing: 'fishing', rock_smash: 'Rock Smash' };
export const WHERE_SHOWN = 4;   // (overworld places listed per Pokémon; the rest are counted)

/** The book's entries: one per National Dex number (its plainest species id: the shortest), in order. -> [{ id, num }] */
const dexCache = new WeakMap();
export function dexList(data) {
	if (dexCache.has(data.species)) return dexCache.get(data.species);
	const byNum = new Map();
	for (const [id, sp] of Object.entries(data.species)) {
		if (!(sp.num >= 1 && sp.num <= DEX_MAX)) continue;
		const prev = byNum.get(sp.num);
		if (!prev || id.length < prev.id.length || (id.length === prev.id.length && id < prev.id)) byNum.set(sp.num, { id, num: sp.num });
	}
	const out = [...byNum.values()].sort((a, b) => a.num - b.num);
	dexCache.set(data.species, out);
	return out;
}

/** What the player has: by Dex number (a form counts for its number), and the species met in cleared story maps.
 *  -> { owned: Map num -> { n, best, shiny }, other: [species ids owned with no Dex number], met: Set num, count } */
export function bookState(col, data) {
	const owned = new Map(), other = new Set(), met = new Set();
	for (const f of Object.values((col && col.figs) || {})) {
		const sp = data.species[f.species];
		if (!sp) continue;
		if (!(sp.num >= 1 && sp.num <= DEX_MAX)) { other.add(f.species); continue; }
		const o = owned.get(sp.num) || { n: 0, best: 0, shiny: false };
		o.n++; o.best = Math.max(o.best, f.level | 0); o.shiny = o.shiny || !!f.shiny;
		owned.set(sp.num, o);
	}
	const cleared = new Set((col && col.cleared) || []);
	for (const m of MAPS) if (cleared.has(m.id)) for (const f of m.foes || []) { const sp = data.species[f.sp]; if (sp && sp.num >= 1) met.add(sp.num); }
	// (plan item R3) ... and the ones that have joined in a Mystery Maze (the recruit log outlives the figurine)
	for (const id of Object.keys((col && col.mm && col.mm.log) || {})) { const sp = data.species[id]; if (sp && sp.num >= 1) met.add(sp.num); }
	return { owned, other: [...other].sort(), met, count: owned.size };
}

/** Where each species lives in the overworld's wild. enc = encounters.json, regions = map_regions.json.
 *  -> Map speciesId -> [{ region, map, how, min, max }] (HOENN2 left out; one line per map and way) */
export function wildIndex(enc, regions) {
	const regionOf = new Map(), nameOf = new Map();
	for (const [r, list] of Object.entries(regions || {})) if (Array.isArray(list)) for (const m of list) { regionOf.set(m.id, r); nameOf.set(m.id, m.name); }
	const out = new Map();
	const label = (region, mapId) => { const raw = nameOf.get(mapId) || mapId, r = region ? region.toLowerCase() : null; return prettyMap(r && raw.toLowerCase().startsWith(r) && raw.length > r.length ? raw.slice(r.length).replace(/^_/, '') : raw); };   // ('SinnohRoute216' under Sinnoh: 'Route 216')
	for (const [mapId, tables] of Object.entries(enc || {})) {
		const region = regionOf.get(mapId) || null;
		if (HIDDEN_REGIONS.has(region)) continue;
		for (const [how, t] of Object.entries(tables || {})) {
			const seen = new Map();
			for (const s of (t && t.slots) || []) {
				const k = s.id, o = seen.get(k);
				if (o) { o.min = Math.min(o.min, s.min); o.max = Math.max(o.max, s.max); } else seen.set(k, { region, map: label(region, mapId), how: HOW[how] || how, min: s.min, max: s.max });
			}
			for (const [k, v] of seen) { if (!out.has(k)) out.set(k, []); out.get(k).push(v); }
		}
	}
	for (const list of out.values()) list.sort((a, b) => a.min - b.min || a.max - b.max);   // (the earliest places first)
	return out;
}
/** "CeladonCity_Condominiums_1F" / "MAP_ROUTE_26" -> "Celadon City Condominiums 1F" / "Route 26" */
export function prettyMap(s) {
	return String(s).replace(/^MAP_/, '').replace(/^(SINNOH|JOHKANTO)_/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2')
		.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(B ?)?(\d+) ?F\b/gi, (_, b, n) => (b ? 'B' : '') + n + 'F').replace(/\s+/g, ' ').trim();
}

/** Which Dungeon floors a species can be a foe on: the floor band its base stat total falls in (dungeon.js pickSpecies),
 *  or a boss from floor 30 for a legendary. -> { from, to (Infinity: every floor after), boss } | null */
export function dungeonFloors(sp, num) {
	if (!sp || !sp.baseStats || !(sp.learnset || []).length) return null;
	const bst = Object.values(sp.baseStats).reduce((a, b) => a + b, 0);
	if (isLegend(num)) return { from: Math.max(30, Math.ceil((bst - 450) / 6)), to: Infinity, boss: true };
	// a floor's band: [min(420, 180 + 4f), min(800, 330 + 6f)]
	const from = Math.max(1, Math.ceil((bst - 330) / 6));
	const to = bst >= 420 ? Infinity : Math.floor((bst - 180) / 4);
	return to >= from ? { from, to, boss: false } : null;
}

/**
 * THE BOOK FILLS IN (Plans/POKETACTICA_MODES_PLAN.md item R3): the Mystery Maze dungeons a species lives in (it can be
 * recruited there) and the ones it is the boss of. -> [{ id, name, boss }]
 */
export function mazePlaces(id) {
	const out = [];
	for (const d of MM_DUNGEONS) {
		if (d.endless) continue;
		if (kindsOf(d).includes(id)) out.push({ id: d.id, name: d.name, boss: false });
		else if ((d.floors || []).some((f) => f.boss && f.boss.species === id)) out.push({ id: d.id, name: d.name, boss: true });
	}
	return out;
}
/**
 * Every way to get this species, best first. wild = wildIndex(...) or null (not loaded yet). -> [{ k, text, seen? }]
 * col (plan item R3): the collection, so a way the player has SEEN for themselves is ticked (`seen`): a Story map it is
 * on that they have cleared, the dungeon it first joined them in.
 */
export function whereToFind(id, data, wild, col = null) {
	const cleared = new Set((col && col.cleared) || []), joined = ((col && col.mm && col.mm.log) || {})[id] || null;
	const sp = data.species[id], out = [];
	if (!sp) return out;
	if (!canBeFigurine(sp)) return [{ k: 'none', text: 'Not in Poketactica yet: no figurine of it can be made' }];
	const add = (k, text, seen = false) => out.push({ k, text, ...(seen ? { seen: true } : {}) });
	if (STARTERS.includes(id)) add('starter', `A starter: pick it when you begin, or buy it in the Shop (${SHOP_FIG_STARS} ★)`);
	for (const m of MAPS) {
		const n = m.chapter + '-' + (MAPS.filter((x) => x.chapter === m.chapter).indexOf(m) + 1);
		if (m.reward && m.reward.fig && m.reward.fig.sp === id) add('reward', `Story ${n} ${m.name}: its first clear gives one (Lv ${m.reward.fig.lv})`, cleared.has(m.id));
	}
	const foeMaps = MAPS.filter((m) => (m.foes || []).some((f) => f.sp === id));
	if (foeMaps.length) {
		const names = foeMaps.slice(0, 3).map((m) => m.chapter + '-' + (MAPS.filter((x) => x.chapter === m.chapter).indexOf(m) + 1) + ' ' + m.name).join(', ');
		add('story', `Story ${names}${foeMaps.length > 3 ? ' and ' + (foeMaps.length - 3) + ' more' : ''}: throw it, weakened, onto your base to catch it`, foeMaps.some((m) => cleared.has(m.id)));
	}
	// (plan item R3) Mystery Maze: where it lives (it may join the leader that knocks it out) and where it is the boss
	{
		const places = mazePlaces(id), wildIn = places.filter((p) => !p.boss), bossIn = places.filter((p) => p.boss);
		if (wildIn.length) add('maze', `Mystery Maze: it lives in ${wildIn.slice(0, 3).map((p) => p.name).join(', ')}${wildIn.length > 3 ? ' and ' + (wildIn.length - 3) + ' more' : ''}. Knock it out with your leader and it may join you${joined && wildIn.some((p) => p.id === joined) ? ' (it first joined you in ' + wildIn.find((p) => p.id === joined).name + ')' : ''}`, !!joined && wildIn.some((p) => p.id === joined));
		if (bossIn.length) add('mazeboss', `Mystery Maze: the boss of ${bossIn.map((p) => p.name).join(', ')}. Knocked out from beside it by your leader, it joins 1 time in 4`, !!joined && bossIn.some((p) => p.id === joined));
	}
	if (WILD_SPECIES.includes(id)) add('training', 'Training Grounds: one of the wild Pokémon there (throw it onto your base to catch it)');
	for (const [mapId, balls] of Object.entries(FIGURINE_BALLS)) for (const b of balls) if (b.fig === id) add('ball', `A figurine ball on ${prettyMap(mapId)} (overworld, Lv ${b.lv})`);
	const places = wild ? wild.get(id) || [] : [];
	if (places.length) {
		const shown = places.slice(0, WHERE_SHOWN).map((p) => `${p.region && REGION_NAME[p.region] ? REGION_NAME[p.region] + ' · ' : ''}${p.map} (${p.how}, Lv ${p.min === p.max ? p.min : p.min + '-' + p.max})`).join('; ');
		add('wild', `Wild in the overworld: ${shown}${places.length > WHERE_SHOWN ? ` and ${places.length - WHERE_SHOWN} more places` : ''}. 1 catch in 10 also gives its figurine`);
	}
	const from = evolvesFrom(id, data);
	for (const e of from) add('evolve', `Evolve ${(data.species[e.from] || {}).name || e.from}${e.how === 'item' ? ' with a ' + prettyItem(e.item) : ' at Lv ' + e.level}`);
	const dg = dungeonFloors(sp, sp.num);
	if (dg) add('dungeon', dg.boss ? `The Dungeon: a boss from floor ${dg.from} on (every ${BOSS_EVERY}th floor); beat it for its figurine` : `The Dungeon: a foe on floors ${dg.from}${dg.to === Infinity ? ' and deeper' : '-' + dg.to} (throw it onto your base to catch it)`);
	if (!out.length) add('trade', 'Not on any Poketactica map yet: trade a friend for one');
	return out;
}
/** Can a figurine of it be made (figurine.js needs its stats and its moves)? */
export const canBeFigurine = (sp) => !!(sp && sp.baseStats && (sp.learnset || []).length);
const prettyItem = (id) => goodName(id);   // (the Shop's own names: 'Water Paint')

/** The species that evolve into this one, and how. -> [{ from, how, level?, item? }] */
const prevoCache = new WeakMap();
export function evolvesFrom(id, data) {
	let rev = prevoCache.get(data.species);
	if (!rev) {
		rev = new Map();
		for (const from of Object.keys(data.extra || {})) {
			if (!data.species[from]) continue;
			for (const e of evolutionsOf(from, data)) { if (!rev.has(e.target)) rev.set(e.target, []); rev.get(e.target).push({ from, ...e }); }
		}
		prevoCache.set(data.species, rev);
	}
	return rev.get(id) || [];
}
