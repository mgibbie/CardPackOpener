// crystal_parties.js — pokecrystal's trainer parties by the id a transpiled
// `trainerbattle` names (tools/gen_crystal_trainer_parties.mjs).
//
// Johto's ordinary trainers fight from rosters keyed by their script label, but a
// battle INSIDE a scene — the Radio Tower's Rocket boss and fake Director, the
// rival fights, a phone rematch's LoadFight1..4 — has no label roster, and fell to
// the generic class pool (the Executive was "Trainer" with a Lv12 Mankey).
let PARTIES = {};
export async function loadCrystalParties(getJSON) {
	PARTIES = (await getJSON('crystal_trainer_parties.json').catch(() => null)) || {};
}
// 'EXECUTIVEM_EXECUTIVEM_1' -> { class, name, party: [{ s, l, moves? }] }, or null
export const crystalParty = id => (id && PARTIES[id]) || null;
