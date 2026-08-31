// encounters.js — wild encounter rolls. Trigger chain mirrors the Lua game:
// finish a step on MB_TALL_GRASS -> rate roll (rate/100) -> weighted slot ->
// level in [min,max]. The battle scene takes it from there.
//
// DAY/NIGHT: the wild data (data/encounters.json) is served read-only from owdata, so
// it has a single flat table per habitat with no time-of-day split. Time-of-day variation
// therefore lives HERE in code: the slot weights are scaled per Clock phase by a
// nocturnal/diurnal classification, and after dark a fraction of LAND rolls are swapped for
// a night-dweller from NIGHT_POOL so even all-diurnal routes feel different at night.
import { getJSON } from './engine.js';
import * as Clock from './clock.js';
import { DAYNIGHT } from './encounters_daynight.js';
import { FREM_NIGHT } from './encounters_frem_night.js';

// species that skew NOCTURNAL (more common at night) — mostly cave/grass night dwellers
const NOCTURNAL = new Set([
	'rattata', 'raticate', 'zubat', 'golbat', 'oddish', 'gloom', 'gastly', 'haunter',
	'hoothoot', 'noctowl', 'murkrow', 'venonat', 'venomoth', 'spinarak', 'ariados',
	'ekans', 'meowth', 'clefairy', 'jigglypuff', 'drowzee', 'koffing', 'grimer',
	'houndour', 'sneasel', 'poochyena', 'mightyena', 'nincada', 'shuppet', 'duskull',
	'sableye', 'kirlia',
]);
// species that skew DIURNAL (more common by day/morning)
const DIURNAL = new Set([
	'pidgey', 'pidgeotto', 'pidgeot', 'spearow', 'fearow', 'doduo', 'ponyta', 'growlithe',
	'sentret', 'furret', 'hoppip', 'sunkern', 'wingull', 'taillow', 'zigzagoon',
	'sandshrew', 'mankey', 'bellsprout', 'starly', 'pikachu',
]);
// injected on LAND after dark (level taken from the base roll) so night walks differ even
// where the base table is all-diurnal — night creatures that suit grass/woods anywhere
const NIGHT_POOL = ['hoothoot', 'zubat', 'oddish', 'venonat', 'murkrow', 'spinarak', 'poochyena', 'gastly'];
const NIGHT_OVERLAY_CHANCE = 0.28;

// weight multiplier for a species at the given Clock phase ('day' | 'night' | 'morning')
function phaseFactor(id, phase) {
	if (phase === 'night') return NOCTURNAL.has(id) ? 3 : DIURNAL.has(id) ? 0.25 : 1;
	if (phase === 'morning') return DIURNAL.has(id) ? 1.6 : NOCTURNAL.has(id) ? 0.5 : 1;
	return DIURNAL.has(id) ? 1.5 : NOCTURNAL.has(id) ? 0.3 : 1; // day
}

export class Encounters {
	constructor() {
		this.data = null;
		this.species = null;
	}

	async init() {
		[this.data, this.species] = await Promise.all([
			getJSON('data/encounters.json'),
			getJSON('data/species_index.json'),
		]);
	}

	// roll for an encounter; returns { id, level } or null
	roll(mapId, world, tx, ty, surfing) {
		// Land encounters used to require MB_TALL_GRASS, which no cave tile has —
		// so 222 maps carried a land table that could never fire (Mt. Moon, Rock
		// Tunnel, Victory Road, Cerulean Cave...) and 25 species were uncatchable.
		// On a map with NO grass at all, the floor is the encounter tile, which is
		// what gen 3 does. Routes keep the grass-only rule, because they have grass.
		const kind = surfing && world.isSurfable(tx, ty) ? 'water'
			: world.isTallGrass(tx, ty) ? 'land'
			: (!surfing && !world.hasTallGrass()) ? 'land'
			: null;
		if (!kind) return null;
		const grp = this.data[mapId]?.[kind];
		if (!grp) return null;
		if (Math.random() * 100 > grp.rate) return null;
		return this.pick(mapId, kind);
	}

	// a table pick, time-of-day aware. `phase` defaults to the live Clock phase; pass it
	// explicitly (e.g. for tests) to force a time of day. Used for wild rolls AND the
	// double-battle partner pick.
	pick(mapId, kind = 'land', phase = Clock.phase()) {
		// AUTHENTIC per-map day/night table (Johto grass, from pokecrystal) takes precedence —
		// it's already time-specific, so pick from it raw (no reweighting, no overlay).
		const dn = DAYNIGHT[mapId]?.[kind]?.[phase];
		if (dn && dn.length) return this.weightedPick(dn, phase, true);
		// FireRed Kanto / Emerald Hoenn NIGHT list: a biome-matched fakemon table (Gen-3 has
		// no vanilla day/night). Night + land only — day/morning fall through to the base table.
		if (phase === 'night' && kind === 'land') {
			const fn = FREM_NIGHT[mapId]?.land?.night;
			if (fn && fn.length) return this.weightedPick(fn, phase, true);
		}
		// else the base owdata table + the code reweighting/overlay (day/morning on Gen-3, and
		// any map without a code night table — time-of-day is synthesized here)
		const grp = this.data[mapId]?.[kind];
		if (!grp || !grp.slots?.length) return null;
		const base = this.weightedPick(grp.slots, phase);
		if (!base) return null;
		// NIGHT overlay: after dark, some LAND encounters are night dwellers not on the base
		// table — keep the level from the base roll, swap the species.
		if (kind === 'land' && phase === 'night' && Math.random() < NIGHT_OVERLAY_CHANCE) {
			return { id: NIGHT_POOL[Math.floor(Math.random() * NIGHT_POOL.length)], level: base.level };
		}
		return base;
	}

	// FISHING: pick from the rod tier's band of the 10-slot fishing table (FRLG layout —
	// Old rod slots [0,1], Good [2,4], Super [5,9]). Returns { id, level } or null when the
	// map has no fishing table. The bite chance itself is handled by the caller (castRod).
	fish(mapId, tier) {
		const grp = this.data[mapId]?.fishing;
		if (!grp || !grp.slots?.length) return null;
		const [lo, hi] = ({ 1: [0, 1], 2: [2, 4], 3: [5, 9] })[tier] || [0, 1];
		const slots = grp.slots.slice(lo, hi + 1);
		if (!slots.length) return null;
		const total = slots.reduce((s, x) => s + x.w, 0);
		let r = Math.random() * total, slot = slots[0];
		for (const s of slots) { r -= s.w; if (r <= 0) { slot = s; break; } }
		return { id: slot.id, level: slot.min + Math.floor(Math.random() * (slot.max - slot.min + 1)) };
	}

	// weighted slot pick. `raw` uses the slots' own weights (an authentic time-specific
	// table); otherwise the per-phase nocturnal/diurnal multipliers are applied.
	weightedPick(slots, phase, raw = false) {
		let total = 0;
		const weighted = slots.map(s => { const w = raw ? s.w : s.w * phaseFactor(s.id, phase); total += w; return { s, w }; });
		let chosen;
		if (total <= 0) { chosen = slots[Math.floor(Math.random() * slots.length)]; } // safety: flat pick
		else {
			let r = Math.random() * total; chosen = weighted[0].s;
			for (const x of weighted) { r -= x.w; if (r <= 0) { chosen = x.s; break; } }
		}
		return { id: chosen.id, level: chosen.min + Math.floor(Math.random() * (chosen.max - chosen.min + 1)) };
	}
}
