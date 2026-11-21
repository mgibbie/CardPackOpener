// ow_figurine.js — Poketactica FIGURINES found in the overworld (owner, 2026-11-20; Plans/POKETACTICA_PLAN.md stage 5):
//   - catching a wild Pokémon: a 1 in 10 chance of its figurine too (as Pocket Enhanced cards)
//   - a gym leader, the first time: their ace's figurine (the highest-level Pokémon of their team)
//   - any trainer: a 1 in 20 chance of one of their team's figurines
//   - hand-placed FIGURINE BALLS on three routes of each region (FIGURINE_BALLS below; drawn and picked up by items.js)
// A figurine goes into the collection on this device (poketactica/
// js/figsave.js; Poketactica keeps it on the account when it next syncs), a line goes in the Journal, and a note is left
// for Poketactica to show. It touches nothing of the overworld's own. Never throws.
import { Journal } from './journal.js';
import { getJSON } from './engine.js';

/**
 * The hand-placed figurine balls (owner, 2026-11-20: "placed figurine balls"): three routes per region (early, middle,
 * late; HOENN2 is gleep's), each on a reachable dead-end nook where the solid ball cuts no path, on foot (no sea
 * routes), holding a species that lives on that route at the route's top wild level. Picked by the overworld's own
 * walkability: tools/poketactica/place_figballs.mjs. overworld/tests/ow_figurine_balls_test.mjs re-checks each one.
 * A ball is collected once (items.js: key fig_<map>_<x>_<y>).
 */
export const FIGURINE_BALLS = {
	MAP_ROUTE2:                [{ tx: 15, ty: 62, fig: 'caterpie', lv: 5 }],
	MAP_ROUTE14:               [{ tx: 13, ty: 35, fig: 'gloom', lv: 30 }],
	MAP_ROUTE25:               [{ tx: 30, ty: 2, fig: 'metapod', lv: 14 }],
	MAP_ROUTE_26:              [{ tx: 17, ty: 58, fig: 'arbok', lv: 32 }],
	MAP_ROUTE_35:              [{ tx: 7, ty: 11, fig: 'ditto', lv: 14 }],
	MAP_ROUTE_45:              [{ tx: 7, ty: 32, fig: 'skarmory', lv: 30 }],
	MAP_ROUTE101:              [{ tx: 2, ty: 8, fig: 'zigzagoon', lv: 3 }],
	MAP_ROUTE115:              [{ tx: 15, ty: 72, fig: 'jigglypuff', lv: 26 }],
	MAP_ROUTE123:              [{ tx: 20, ty: 6, fig: 'kecleon', lv: 28 }],
	MAP_SINNOH_ROUTE201:       [{ tx: 57, ty: 8, fig: 'kricketot', lv: 4 }],
	MAP_SINNOH_ROUTE212_SOUTH: [{ tx: 48, ty: 10, fig: 'croagunk', lv: 26 }],
	MAP_SINNOH_ROUTE229:       [{ tx: 61, ty: 3, fig: 'beautifly', lv: 50 }],
	MAP_JOHKANTO_ROUTE_2:      [{ tx: 9, ty: 25, fig: 'pikachu', lv: 7 }],
	MAP_JOHKANTO_ROUTE_13:     [{ tx: 21, ty: 13, fig: 'chansey', lv: 27 }],
	MAP_JOHKANTO_ROUTE_25:     [{ tx: 31, ty: 9, fig: 'butterfree', lv: 14 }],
};

// a figurine ball picked up outside a battle has no battle data at hand: its own copy, loaded once
let figData = null;
async function dataFor(data) {
	if (data && data.species && data.abilities) return data;
	if (!figData) figData = Promise.all([getJSON('data/species_battle.json'), getJSON('data/species_abilities.json')]).then(([species, abilities]) => ({ species, abilities }));
	return figData;
}

export const CATCH_FIG_CHANCE = 0.1, TRAINER_FIG_CHANCE = 0.05;
export const FIG_LEVEL_MIN = 1;

/** A seed for a figurine made in the overworld (which isn't seeded: a random one, recorded in the figurine's id). */
const seed = (rand) => 'ow-' + Math.floor(rand() * 36 ** 8).toString(36) + '-' + Date.now().toString(36);

/** Make and keep a figurine of `speciesId` at `level`. data = the battle engine's data (species, abilities). -> the figurine or null */
export async function grantFigurine(speciesId, level, data, why, rand = Math.random) {
	try {
		data = await dataFor(data);
		if (!data || !data.species || !data.species[speciesId]) return null;
		const [{ makeFigurine }, { makeRng }, SV] = await Promise.all([import('../poketactica/js/figurine.js'), import('./rules/rng.js'), import('../poketactica/js/figsave.js')]);
		const s = seed(rand);
		const fig = { ...makeFigurine(speciesId, Math.max(FIG_LEVEL_MIN, level | 0), makeRng(s), data, { id: speciesId.replace(/[^a-z0-9_-]/g, '') + '-' + s.replace(/[^a-z0-9-]/g, '').slice(-14) }), from: why };
		SV.addFound(fig);
		const name = data.species[speciesId].name || speciesId;
		try { Journal.add(`Found a Poketactica figurine: ${name} (Lv ${fig.level})`); } catch (e) { /* the journal is optional */ }
		return fig;
	} catch (e) { return null; }
}

/** A wild catch: 1 in 10, that Pokémon's figurine at its level. */
export function figCatch(mon, data, rand = Math.random) {
	if (!mon || !mon.speciesId || rand() >= CATCH_FIG_CHANCE) return null;
	return grantFigurine(mon.speciesId, mon.level, data, 'catch', rand);
}

/** A trainer beaten. firstGym: this win just earned a gym badge -> the ace's figurine; else 1 in 20, one of the team's. */
export function figTrainer(foeParty, data, firstGym, rand = Math.random) {
	const team = (foeParty || []).filter((m) => m && m.speciesId);
	if (!team.length) return null;
	if (firstGym) {
		const ace = team.reduce((a, m) => ((m.level || 0) > (a.level || 0) ? m : a), team[0]);
		return grantFigurine(ace.speciesId, ace.level, data, 'gym', rand);
	}
	if (rand() >= TRAINER_FIG_CHANCE) return null;
	const m = team[Math.floor(rand() * team.length)];
	return grantFigurine(m.speciesId, m.level, data, 'trainer', rand);
}
