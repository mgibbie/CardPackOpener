// species_swaps.js — the owner's SPECIES SWAPS: "where this Pokémon is placed, that one appears instead".
//
// Made on the owner's /fakemon/ page (mgibbie only), saved on the server (tuning-save, kind 'species': owner only)
// and read by everybody (tuning-get: public), so a swap reaches every player without a deploy and without touching
// the generated encounter tables or the trainer files. One entry is "<key>" -> "<species id>":
//   all:<species>                                 wherever <species> would appear in the wild or on a trainer
//   wild:<table>:<MAP>:<kind>:<phase|->:<slot>    one slot of one wild table (encounters.js pick(); table: base, dn,
//                                                 night, pg — the keys tools/gen_fakemon_placements.mjs lists)
//   trainer:<script label>:<slot>                 one member of one trainer's roster (trainers.js buildBattle)
// A placement's own swap wins over "all:". A swap to a species the game does not have is ignored (the game asks
// through known(), set once the species data has loaded), so a bad entry can never put a missing Pokémon in a battle.
const LS = 'species_swaps_v1', LS_AT = 'species_swaps_at', EVERY = 5 * 60 * 1000;
export const SWAPS = {};
let count = 0, known = null;
/** (battle.js, once the species data is in) which ids exist: swaps to anything else are ignored. */
export function setKnown(fn) { known = fn; }
const ok = (id) => typeof id === 'string' && id && (!known || known(id));

function fill(o) {
	for (const k of Object.keys(SWAPS)) delete SWAPS[k];
	if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && v) SWAPS[k] = v;
	count = Object.keys(SWAPS).length; cache.clear();
}
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
const cache = new Map();
try { const s = ls(); if (s) fill(JSON.parse(s.getItem(LS) || '{}')); } catch { /* none kept */ }

/** The species that appears for `id` everywhere (no swap: itself). */
export function everywhere(id) { if (!count) return id; const to = SWAPS['all:' + id]; return ok(to) ? to : id; }
/** The species for one placement: its own swap, else "all:", else itself. */
export function at(key, id) { if (!count) return id; const to = SWAPS[key]; return ok(to) ? to : everywhere(id); }
/** A wild table with the swaps laid over it (the same array when nothing in it is swapped). */
export function slotsFor(table, map, kind, phase, slots) {
	if (!count || !slots || !slots.length) return slots;
	const ck = table + ':' + map + ':' + kind + ':' + (phase || '-');
	let hit = cache.get(ck);
	if (!hit || hit.src !== slots) {
		let changed = false;
		const out = slots.map((s, i) => { const to = at('wild:' + ck + ':' + i, s.id); if (to === s.id) return s; changed = true; return { ...s, id: to }; });
		hit = { src: slots, out: changed ? out : slots }; cache.set(ck, hit);
	}
	return hit.out;
}
/** Use this table from now on, and keep it for the next visit. */
export function setLocal(o) {
	fill(o);
	try { const s = ls(); if (s) { s.setItem(LS, JSON.stringify(SWAPS)); s.setItem(LS_AT, String(Date.now())); } } catch { /* full or private */ }
}
/** Ask the server for the table (unless asked a few minutes ago; force: ask anyway). Never throws. */
export async function refresh(force) {
	if (typeof location === 'undefined' || typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return SWAPS;
	try {
		const s = ls(), last = +(s && s.getItem(LS_AT) || 0);
		if (!force && Date.now() - last < EVERY) return SWAPS;
		const r = await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"tuning-get"}' });
		if (!r.ok) return SWAPS;
		const j = await r.json();
		setLocal(j && j.species || {});
	} catch { /* offline: what was kept stands */ }
	return SWAPS;
}
export const ready = refresh(false);
globalThis.SpeciesSwap = { SWAPS, everywhere, at, slotsFor, setLocal, refresh, ready };
