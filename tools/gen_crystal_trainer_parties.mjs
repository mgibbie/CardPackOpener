// gen_crystal_trainer_parties.mjs — every pokecrystal trainer party, keyed the way
// a transpiled `trainerbattle` names it (CLASS_ID: EXECUTIVEM_EXECUTIVEM_1,
// SCHOOLBOY_JACK2, RIVAL1_RIVAL1_2_TOTODILE ...).
//
// The port's Johto teams are ROSTERS keyed by the trainer's script label
// (trainers.json, from Magepunk66 crystal_parse_trainers.py). A `trainerbattle`
// inside a scripted scene — the Radio Tower's Rocket boss and fake Director, every
// rival fight, a phone rematch's LoadFight1..4 — has no label roster of its own, so
// startScriptedBattle fell to the generic class pool: the Radio Tower's Executive
// was "Trainer" with one Mankey Lv12 (2026-10-09, Instinct). This gives each id
// its decomp party (species, level, and moves for TRAINERTYPE_MOVES parties).
//
// Output: overworld/crystal_trainer_parties.json
//   { "<CLASS>_<ID>": { class, name, party: [{ s, l, moves? }] } }
//   node tools/gen_crystal_trainer_parties.mjs
import fs from 'fs';
import path from 'path';

const MP66 = (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const p = path.join(d, 'Magepunk66');
		if (fs.existsSync(path.join(p, 'Reference', 'pokecrystal', 'data'))) return p;
		if (path.dirname(d) === d) throw new Error('Magepunk66 not found above ' + path.resolve('.'));
	}
})();
const PC = path.join(MP66, 'Reference', 'pokecrystal');
const read = f => fs.readFileSync(path.join(PC, f), 'utf8').split(/\r?\n/);

// trainer classes in order, with each class's id constants (1-based)
const order = [], ids = {};
let group = null;
for (const l of read('constants/trainer_constants.asm')) {
	let m = /^\s*trainerclass\s+(\w+)/.exec(l);
	if (m) { group = m[1]; order.push(group); ids[group] = []; continue; }
	m = /^\s*const\s+(\w+)/.exec(l);
	if (m && group) ids[group].push(m[1]);
}
// display class names (class_names.asm has no entry for TRAINER_NONE)
const names = read('data/trainers/class_names.asm').map(l => /^\s*li\s+"(.*)"/.exec(l)).filter(Boolean).map(m => m[1]);
const CLEAN = { LEADER: 'Gym Leader', 'ELITE FOUR': 'Elite Four', CHAMPION: 'Champion', RIVAL: 'Rival',
	'<PKMN> TRAINER': 'Pkmn Trainer', '#MON PROF.': 'Pokemon Prof.', '#MANIAC': 'Pkmn Maniac', ROCKET: 'Team Rocket',
	COOLTRAINERM: 'Cooltrainer', COOLTRAINERF: 'Cooltrainer' };
const classes = {};
order.filter(g => g !== 'TRAINER_NONE').forEach((g, i) => {
	const raw = names[i];
	if (raw) classes[g] = CLEAN[raw] || raw.split(/\s+/).map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
});

// the port's ids: species/moves are the constant lowercased without underscores
const species = new Set(Object.keys(JSON.parse(fs.readFileSync('overworld/data/species_battle.json', 'utf8'))));
const moves = new Set(Object.keys(JSON.parse(fs.readFileSync('overworld/data/moves_battle.json', 'utf8'))));
const MOVE_ALIAS = { psychicm: 'psychic' };
const sp = c => c.toLowerCase().replace(/_/g, '');
const mv = c => { const id = c.toLowerCase().replace(/_/g, ''); return MOVE_ALIAS[id] || id; };

const out = {}, unknown = new Set();
let cur = null, kind = null;
for (const l of read('data/trainers/parties.asm')) {
	let m = /^\s*;\s*([A-Z0-9_]+)\s*\((\d+)\)\s*$/.exec(l);
	if (m) {
		const g = m[1], id = ids[g]?.[+m[2] - 1];
		cur = id ? { key: `${g}_${id}`, class: classes[g] || g, name: '', party: [] } : null;
		if (cur) out[cur.key] = cur;
		continue;
	}
	m = /^\s*db\s+"([^"@]*)@?",\s*TRAINERTYPE_(\w+)/.exec(l);
	if (m && cur) { cur.name = m[1]; kind = m[2]; continue; }
	m = /^\s*db\s+(\d+),\s*([A-Z][A-Z0-9_]*)(.*)$/.exec(l);
	if (m && cur) {
		const s = sp(m[2]);
		if (!species.has(s)) unknown.add('species ' + m[2]);
		const e = { s, l: +m[1] };
		// TRAINERTYPE_MOVES / ITEM_MOVES: the moves follow (after the item, if any)
		const rest = m[3].split(';')[0].split(',').map(x => x.trim()).filter(Boolean);
		if (/MOVES/.test(kind || '')) {
			const mvs = (/ITEM/.test(kind) ? rest.slice(1) : rest).filter(x => x !== 'NO_MOVE').map(mv);
			for (const x of mvs) if (!moves.has(x)) unknown.add('move ' + x);
			if (mvs.length) e.moves = mvs.filter(x => moves.has(x));
		}
		cur.party.push(e);
	}
}
for (const k of Object.keys(out)) if (!out[k].party.length) delete out[k];
fs.writeFileSync(path.join('overworld', 'crystal_trainer_parties.json'), JSON.stringify(out));
console.log(`crystal trainer parties: ${Object.keys(out).length}; unknown ids: ${unknown.size}`, [...unknown].slice(0, 20).join(', '));
