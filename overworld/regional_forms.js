// regional_forms.js — regional forms play like themselves: their own movepools,
// and regional evolutions reached by holding a regional CHARM.
//
// MOVEPOOLS. The 58 regional forms shipped with their base species' moves
// (Alolan Vulpix learned Ember, not Powder Snow). regional_forms_data.js holds
// each form's Showdown learnset (tools/gen_regional_forms.mjs); applyRegionalForms
// writes it over the battle data at load time, so nothing in overworld/data has to
// be redeployed and every caller of the battle engine sees the same moves.
//
// EVOLUTIONS. Canon gates these by region ("evolve while in Alola"), and this map
// has no Alola, Galar or Hisui. The owner-approved stand-in is a HELD item: the
// ALOLA / GALAR / HISUI CHARM (bag.js, held.evoRegion). A Pikachu holding the
// ALOLA CHARM that meets a Thunder Stone becomes Alolan Raichu; without it, Raichu.
// The charm is held, never consumed. A regional form's own line (Alolan Vulpix ->
// Alolan Ninetales) evolves inside its region with no charm, as in canon.
import { SOURCE, MOVE_SUBS } from './regional_forms_data.js';
import { pickEvolution } from './evo_pick.js';

// Branch tags: `region` marks the branch a matching charm selects. Every list here
// REPLACES the species' evos in species_extra.json (regional_forms_test pins each
// one against Showdown's pokedex.ts, via the SHOWDOWN_EVOS snapshot).
// Stand-ins for canon methods this engine has no hook for:
//   crits  Galarian Farfetch'd: land 3 critical hits in one battle (canon exactly;
//          battle.js counts them on the mon as battleCrits)
//   damage Galarian Yamask: 49+ HP lost and not fainted (canon also walks it under
//          the Dusty Bowl arch, which does not exist here)
//   move   level up knowing the move: Mime Jr. (Mimic, canon), Hisuian Qwilfish
//          (Barb Barrage — Scarlet/Violet's method; Legends' "use it 20 times in
//          Strong Style" has no Strong Style to count)
export const REGIONAL_EVOS = {
	pikachu: [
		{ type: 'item', param: 'thunderstone', target: 'raichu' },
		{ type: 'item', param: 'thunderstone', target: 'raichu_alola', region: 'alola' },
	],
	exeggcute: [
		{ type: 'item', param: 'leafstone', target: 'exeggutor' },
		{ type: 'item', param: 'leafstone', target: 'exeggutor_alola', region: 'alola' },
	],
	cubone: [
		{ type: 'level', param: 28, target: 'marowak' },
		// Alola's is also night-only in canon; with the charm, a daytime Cubone waits
		{ type: 'level', param: 28, target: 'marowak_alola', time: 'night', region: 'alola' },
	],
	koffing: [
		{ type: 'level', param: 35, target: 'weezing' },
		{ type: 'level', param: 35, target: 'weezing_galar', region: 'galar' },
	],
	mimejr: [
		{ type: 'move', param: 'mimic', target: 'mrmime' },
		{ type: 'move', param: 'mimic', target: 'mrmime_galar', region: 'galar' },
	],
	quilava: [
		{ type: 'level', param: 36, target: 'typhlosion' },
		{ type: 'level', param: 36, target: 'typhlosion_hisui', region: 'hisui' },
	],
	dewott: [
		{ type: 'level', param: 36, target: 'samurott' },
		{ type: 'level', param: 36, target: 'samurott_hisui', region: 'hisui' },
	],
	dartrix: [
		{ type: 'level', param: 34, target: 'decidueye' },
		{ type: 'level', param: 36, target: 'decidueye_hisui', region: 'hisui' },
	],
	petilil: [
		{ type: 'item', param: 'sunstone', target: 'lilligant' },
		{ type: 'item', param: 'sunstone', target: 'lilligant_hisui', region: 'hisui' },
	],
	rufflet: [
		{ type: 'level', param: 54, target: 'braviary' },
		{ type: 'level', param: 54, target: 'braviary_hisui', region: 'hisui' },
	],
	goomy: [
		{ type: 'level', param: 40, target: 'sliggoo' },
		{ type: 'level', param: 40, target: 'sliggoo_hisui', region: 'hisui' },
	],
	bergmite: [
		{ type: 'level', param: 37, target: 'avalugg' },
		{ type: 'level', param: 37, target: 'avalugg_hisui', region: 'hisui' },
	],
	// regional lines that had no way to evolve at all
	farfetchd_galar: [{ type: 'crits', param: 3, target: 'sirfetchd' }],
	yamask_galar: [{ type: 'damage', param: 49, target: 'runerigus' }],
	qwilfish_hisui: [{ type: 'move', param: 'barbbarrage', target: 'overqwil' }],
};

// the move this engine runs for a Showdown move id, or null (dropped)
export function mapMove(mid, moves) {
	if (moves?.[mid]) return mid;
	const sub = MOVE_SUBS[mid];
	return sub && moves?.[sub] ? sub : null;
}

// a form's level-up learnset as this engine runs it: [[level, move]]
export function regionalLearnset(id, moves) {
	const src = SOURCE[id];
	if (!src) return null;
	const out = [], seen = new Set();
	for (const [lv, mid] of src.level) {
		const m = mapMove(mid, moves);
		if (!m || seen.has(lv + ':' + m)) continue;
		seen.add(lv + ':' + m);
		out.push([lv, m]);
	}
	return out;
}
const mapList = (list, moves) => [...new Set(list.map(m => mapMove(m, moves)).filter(Boolean))];
export const regionalMachineMoves = (id, moves) => SOURCE[id] ? mapList(SOURCE[id].tm, moves) : null;

// Write the forms' movepools and the regional evolutions over freshly loaded
// battle data ({ species, moves, extra, tmLearn, eggMoves }). Idempotent.
export function applyRegionalForms(data) {
	if (!data?.species || data._regionalForms) return data;
	data.extra = data.extra || {};
	const tmByMove = data.tmLearn || null;
	for (const id of Object.keys(SOURCE)) {
		const sp = data.species[id];
		if (!sp) continue;
		const level = regionalLearnset(id, data.moves);
		const tm = regionalMachineMoves(id, data.moves);
		sp.learnset = level;
		const ext = data.extra[id] || (data.extra[id] = {});
		// canLearn reads `learn` first: exactly this form's level-up + machine/tutor moves
		ext.learn = [...new Set([...level.map(x => x[1]), ...tm])].sort();
		if (tmByMove) {
			const mine = new Set(tm);
			for (const [mid, learners] of Object.entries(tmByMove)) {
				if (mid === '__species' || !Array.isArray(learners)) continue;
				const has = learners.includes(id);
				if (mine.has(mid) && !has) learners.push(id);
				else if (!mine.has(mid) && has) learners.splice(learners.indexOf(id), 1);
			}
			// a form Showdown knows: no fakemon type fallback for it
			if (Array.isArray(tmByMove.__species) && !tmByMove.__species.includes(id)) tmByMove.__species.push(id);
		}
		if (data.eggMoves && SOURCE[id].egg.length) data.eggMoves[id] = mapList(SOURCE[id].egg, data.moves);
	}
	for (const [id, evos] of Object.entries(REGIONAL_EVOS)) {
		if (!data.species[id]) continue;
		(data.extra[id] || (data.extra[id] = {})).evos = evos.map(e => ({ ...e }));
	}
	data._regionalForms = true;
	return data;
}

// The region a held item puts its holder "in" for evolution (bag.js items carry
// it as held.evoRegion), or null.
export function charmRegion(mon, ITEMS) {
	return (mon?.heldItem && ITEMS?.[mon.heldItem]?.held?.evoRegion) || null;
}

// Choose the evolution among `evos` whose condition `eligible(e)` holds. A
// region-tagged branch is taken only by a holder of that region's charm, and a
// charm holder whose species HAS a branch for that region takes only that branch
// (in Hisui a Quilava becomes Hisuian Typhlosion or nothing). Species with no
// branch for the charm's region evolve normally. A tie left after that (Tyrogue,
// Wurmple, ...) is broken canonically by evo_pick.js pickEvolution.
export function pickEvo(mon, evos, data, eligible, region, ctx) {
	const live = (evos || []).filter(e => data?.species?.[e.target]);
	const regional = !!region && live.some(e => e.region === region);
	return pickEvolution(mon, live.filter(e => (regional ? e.region === region : !e.region) && eligible(e)), ctx);
}
