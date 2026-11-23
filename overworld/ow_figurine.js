// ow_figurine.js — Poketactica FIGURINES found in the overworld (owner, 2026-11-20; Plans/POKETACTICA_PLAN.md stage 5):
//   - catching a wild Pokémon: a 1 in 10 chance of its figurine too (as Pocket Enhanced cards)
//   - a gym leader, the first time: their ace's figurine (the highest-level Pokémon of their team)
//   - any trainer: a 1 in 20 chance of one of their team's figurines
//   - hand-placed FIGURINE BALLS on three routes of each region (FIGURINE_BALLS, in poketactica/js/figballs.js; drawn and picked up by items.js)
// A figurine goes into the collection on this device (poketactica/
// js/figsave.js; Poketactica keeps it on the account when it next syncs), a line goes in the Journal, and a note is left
// for Poketactica to show. It touches nothing of the overworld's own. Never throws.
import { Journal } from './journal.js';
import { getJSON } from './engine.js';

// The hand-placed figurine balls: poketactica/js/figballs.js (the Figurine book lists them too).
export { FIGURINE_BALLS } from '../poketactica/js/figballs.js';

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
