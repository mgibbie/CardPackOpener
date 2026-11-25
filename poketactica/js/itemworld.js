// itemworld.js — the ITEM WORLD (owner, 2026-11-24; Plans/POKETACTICA_ITEM_WORLD_PLAN.md): you go INTO a held item,
// floor after floor; clearing a dive raises the item's level (gear.js), and with it its slots, and brings out plush
// gemstones and Stitching Kits. Pure rules: the page (main.js, hub.js) plays the floors and keeps the run.
//
//   a floor    is numbered by the level the item reaches when it is cleared: an item of level 1 dives from floor 2.
//   a dive     runs from the item's level to the next EXIT floor (10, 20 ... 100): up to ten floors. The exit floor
//              is a boss floor. Clearing it BANKS the dive: the item's level becomes that floor, and what was found on
//              the way joins the collection. Giving up or losing first banks nothing; the item is never lost.
//   the foes   are the Dungeon's (its generator, its species by depth), at a level set by the floor and by what the
//              item costs in the shop: a costly item is a harder world.
//   finds      a floor may hold a plush gemstone (stronger the deeper); a boss floor always holds one, stronger still,
//              and a Stitching Kit. All from the dive's seed: the same dive finds the same things.
//   two ways   'tactics' (a battle a floor, as the Dungeon) or 'maze' (a Mystery Maze dungeon of the same floors).
import { genFloor, floorStars, isBossFloor } from './dungeon.js';
import { HELD } from './goods.js';
import { GEM_STATS, GEM_MAX_LEVEL, ITEM_MAX_LEVEL, gemStr, cleanGear, slotsAt } from './gear.js';
import { makeRng } from '../../overworld/rules/rng.js';

export const IW_RUN_KEY = 'magepunk_poketactica_itemworld_v1';
export const EXIT_EVERY = 10;
export const IW_STYLES = Object.freeze(['tactics', 'maze']);
/** The exit floor a dive from this level ends on (10, 20 ... 100); 0 when the item is at the top. */
export const exitFloor = (lv) => (lv >= ITEM_MAX_LEVEL ? 0 : Math.min(ITEM_MAX_LEVEL, (Math.floor(Math.max(1, lv) / EXIT_EVERY) + 1) * EXIT_EVERY));
export const canDive = (lv) => exitFloor(lv) > 0;
/** The floors of a dive from this level: [lv + 1 ... exit]. */
export const diveFloors = (lv) => { const out = []; for (let f = Math.max(1, lv) + 1; f <= exitFloor(lv); f++) out.push(f); return out; };
/** How strong a floor's foes are: by the floor, and by the item's price (8 to 150 stars). A boss is 5 over. */
export const itemFoeLevel = (floor, id, boss = false) => Math.min(999, Math.round(5 + floor * (1.2 + ((HELD[id] || {}).stars || 40) / 100)) + (boss ? 5 : 0));
/** A floor's stars: half the Dungeon's (the item is the prize). */
export const itemFloorStars = (floor) => Math.ceil(floorStars(floor) / 2);

/** No more foes on a floor than a team has figurines (the Dungeon goes to 8 from floor 30; measured with
 *  tools/poketactica/iw_auto.mjs, a dive of ten such floors in a row asked for a team 1.75x the foes' level). The boss stays. */
export const IW_MAX_FOES = 6;
const capFoes = (foes) => (foes.length <= IW_MAX_FOES ? foes : [...foes.filter((f) => f.boss), ...foes.filter((f) => !f.boss)].slice(0, IW_MAX_FOES));

/** A floor of an item's world as a battle map (the Dungeon's generator; the foes at this item's levels; no boss figurine). */
export function itemFloor(seed, floor, id, data) {
	const m = genFloor(seed, floor, data);
	if (!m || !HELD[id]) return null;
	const boss = isBossFloor(floor);
	return { ...m, id: 'item', item: id, name: `${HELD[id].name} · floor ${floor}${boss ? ' · Exit' : ''}`,
		foes: capFoes(m.foes).map((f) => ({ ...f, lv: itemFoeLevel(floor, id, !!f.boss) })),
		tip: boss ? `The exit floor: clear it and the ${HELD[id].name} reaches level ${floor}. What you found comes out with you.` : `Clear it to go deeper. Nothing is kept until the exit on floor ${exitFloor(floor - 1)}.`,
		reward: { stars: itemFloorStars(floor) } };
}

/** What a cleared floor holds: [{ k: 'gem', gem: 'atk:7' } | { k: 'kit' }]. */
export function findsOf(seed, floor) {
	const rng = makeRng(seed + ':iw-find' + floor), boss = isBossFloor(floor), out = [];
	const stat = () => GEM_STATS[Math.floor(rng() * GEM_STATS.length)];
	const level = (mult) => Math.max(1, Math.min(GEM_MAX_LEVEL, Math.round((1 + floor / 4 + rng() * floor / 6) * mult)));
	if (boss) { out.push({ k: 'gem', gem: gemStr(stat(), level(1.5)) }); out.push({ k: 'kit' }); if (floor >= 50) out.push({ k: 'gem', gem: gemStr(stat(), level(1)) }); }
	else if (rng() < 0.5) out.push({ k: 'gem', gem: gemStr(stat(), level(1)) });
	return out;
}

// ---------------------------------------------------------------- a dive in progress, on this device
const UID = /^[a-z0-9]{1,30}-[a-z0-9]{4,16}$/;
/** A dive read defensively: { v, uid, id, from, floor, seed, style, found } or null. */
export function cleanDive(r) {
	if (!r || typeof r !== 'object' || !UID.test(String(r.uid || '')) || !HELD[r.id] || !/^[a-z0-9]{1,40}$/.test(String(r.seed || ''))) return null;
	const from = Math.max(1, Math.min(ITEM_MAX_LEVEL - 1, r.from | 0)), exit = exitFloor(from), floor = Math.max(from + 1, Math.min(exit, r.floor | 0));
	if (!exit) return null;
	const found = (Array.isArray(r.found) ? r.found : []).filter((x) => x && (x.k === 'kit' || (x.k === 'gem' && typeof x.gem === 'string' && /^[a-z]{2,3}:\d{1,3}$/.test(x.gem)))).slice(0, 40).map((x) => (x.k === 'kit' ? { k: 'kit' } : { k: 'gem', gem: x.gem }));
	// (back: the figurine the item was taken off for this dive; it goes back on when the dive ends, figcol.js reholdItem)
	const back = typeof r.back === 'string' && /^[a-z0-9_-]{3,60}$/.test(r.back) ? r.back : null;
	return { v: 1, uid: r.uid, id: r.id, from, floor, seed: r.seed, style: IW_STYLES.includes(r.style) ? r.style : 'tactics', found, ...(back ? { back } : {}) };
}
export const newDive = (uid, id, lv, style = 'tactics', now = Date.now(), back = null) => (!canDive(lv) ? null : cleanDive({ uid, id, from: lv, floor: lv + 1, seed: 'iw' + now.toString(36), style, found: [], ...(back ? { back } : {}) }));
export function loadDive(LS = globalThis.localStorage) { try { return cleanDive(JSON.parse(LS.getItem(IW_RUN_KEY) || 'null')); } catch { return null; } }
export function saveDive(run, LS = globalThis.localStorage) { try { if (run) LS.setItem(IW_RUN_KEY, JSON.stringify(run)); else LS.removeItem(IW_RUN_KEY); } catch { /* (private mode: the dive lasts the visit) */ } }
/** The dive after its floor is cleared: what was found is carried; -> { run (null: that was the exit), done, finds }. */
export function afterFloor(run, floor = run.floor) {
	const finds = findsOf(run.seed, floor), found = [...run.found, ...finds], exit = exitFloor(run.from);
	return floor >= exit ? { run: null, done: { ...run, floor: exit, found }, finds } : { run: { ...run, floor: floor + 1, found }, done: null, finds };
}

/**
 * The exit is cleared: the item's level becomes the exit floor, and the finds join the collection.
 * ops: { levelTo(col, uid, lv), addGem(col, stat, lv, tail), addGood(col, id, tail) } (figcol.js's, handed in so this file
 * stays free of the collection); tail(): a fresh random string a call.
 * -> { col, report: { id, from, to, slotsFrom, slotsTo, gems: [...], kits } } (the item gone from the bag: only the finds bank)
 */
export function bankDive(col, done, ops, tail) { return bankTo(col, done, exitFloor(done.from), done.found, ops, tail); }
/**
 * OUT BY A PULL CORD (owner, 2026-11-24: a way out is an item; improvement plan item 12). The dive ends now and keeps
 * what is cleared: the item's level becomes the last floor cleared, the gemstones found so far come out; the Stitching
 * Kit stays at the exit. One Pull Cord is used (ops.takeGood). cleared: the last floor cleared (a battle dive: its
 * floor less one); found: what those floors held.
 * -> { col, report (as bankDive's, with cord: true) }, or null with no Pull Cord to use
 */
export function bankPart(col, dive, cleared, found, ops, tail) {
	const paid = ops.takeGood(col, 'pullcord');
	if (!paid) return null;
	const to = Math.max(dive.from, Math.min(exitFloor(dive.from) - 1, cleared | 0));
	const r = bankTo(paid, dive, to, (found || []).filter((f) => f.k === 'gem'), ops, tail);
	return { col: r.col, report: { ...r.report, cord: true, cleared: to - dive.from } };
}
/** How many floors of a battle dive are cleared (what a Pull Cord would keep). */
export const clearedFloors = (dive) => Math.max(0, (dive ? dive.floor - 1 - dive.from : 0));
function bankTo(col, done, to, found, ops, tail) {
	const here = (col.items || {})[done.uid] === done.id;
	const before = here ? cleanGear((col.gear || {})[done.uid]) : null, from = before ? before.lv : here ? 1 : done.from;
	let c = here && to > from ? ops.levelTo(col, done.uid, to) : col;
	const gems = [];
	let kits = 0;
	for (const f of found) {
		if (f.k === 'kit') { const n = ops.addGood(c, 'stitchingkit', tail()); if (n !== c) { c = n; kits++; } }
		else { const [s, lv] = f.gem.split(':'), n = ops.addGem(c, s, +lv, tail()); if (n !== c) { c = n; gems.push(f.gem); } }
	}
	// (an item taken off a figurine for the dive goes back on, with its new level)
	let held = false;
	if (done.back && ops.rehold) { const n = ops.rehold(c, done.back, done.uid, tail()); held = n !== c; c = n; }
	return { col: c, report: { id: done.id, banked: here, ...(held ? { back: done.back } : {}), from, to: here ? Math.max(from, to) : from, slotsFrom: slotsAt(from), slotsTo: slotsAt(here ? Math.max(from, to) : from), gems, kits } };
}
