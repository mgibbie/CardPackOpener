// vendor_showdown.mjs — trims Pokémon Showdown's public data (MIT licence, github.com/smogon/pokemon-showdown) to what
// Poketactica's shape generator reads, for OUR moves and abilities only, and writes it next to this script:
//   showdown_moves.min.json      id -> { target, flags[], priority, cat, bp, + the effect keys the shapes key off }
//   showdown_abilities.min.json  id -> shortDesc
// Run it when Showdown's data should be refreshed (it is not part of the build):
//   node tools/poketactica/vendor_showdown.mjs <dir with moves.json + text_abilities.ts + text_moves.ts>
// (moves.json: https://play.pokemonshowdown.com/data/moves.json; text_*.ts: data/text/ in the Showdown repo.) The .ts
// files are READ AS TEXT (regex), never executed.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const src = process.argv[2];
if (!src) { console.error('usage: node vendor_showdown.mjs <dir>'); process.exit(2); }

const ours = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/moves_battle.json'), 'utf8'));
const sd = JSON.parse(fs.readFileSync(path.join(src, 'moves.json'), 'utf8'));
// our old / custom spellings of Showdown ids
export const ALIAS = { vicegrip: 'visegrip', hijumpkick: 'highjumpkick', faintattack: 'feintattack', smellingsalt: 'smellingsalts' };

const textOf = (file) => {
	const t = fs.readFileSync(path.join(src, file), 'utf8'), out = {};
	for (const m of t.matchAll(/^\t([a-z0-9]+): \{([\s\S]*?)^\t\},?$/gm)) {
		const sd2 = m[2].match(/^\t\tshortDesc: "((?:[^"\\]|\\.)*)"/m) || m[2].match(/^\t\tdesc: "((?:[^"\\]|\\.)*)"/m);
		if (sd2) out[m[1]] = sd2[1].replace(/\\"/g, '"');
	}
	return out;
};
const moveText = textOf('text_moves.ts');

const KEEP = ['selfSwitch', 'forceSwitch', 'recoil', 'drain', 'heal', 'multihit', 'ohko', 'selfdestruct', 'sideCondition', 'weather',
	'terrain', 'pseudoWeather', 'status', 'volatileStatus', 'boosts', 'critRatio', 'willCrit', 'hasCrashDamage', 'damage', 'stallingMove', 'slotCondition', 'callsMove'];
const moves = {};
for (const id of Object.keys(ours).sort()) {
	const x = sd[ALIAS[id] || id];
	if (!x) continue;
	const o = { target: x.target, flags: Object.keys(x.flags || {}).filter((f) => !/^(protect|mirror|metronome|snatch|bypasssub|allyanim|fail|noassist|nosleeptalk|nosketch|noparentalbond|mustpressure|cantusetwice)/.test(f)).sort(), priority: x.priority, cat: x.category, bp: x.basePower };
	for (const k of KEEP) if (x[k] !== undefined) o[k] = typeof x[k] === 'object' && !Array.isArray(x[k]) ? (k === 'boosts' ? x[k] : true) : x[k];
	if (x.secondary || x.secondaries) o.secondary = true;
	if (x.self && x.self.boosts) o.selfBoosts = x.self.boosts;
	if (x.flags && x.flags.charge) o.charge = true;
	if (x.flags && x.flags.recharge) o.recharge = true;
	const d = moveText[ALIAS[id] || id];
	if (d) o.desc = d;
	moves[id] = o;
}
const abilityText = textOf('text_abilities.ts');
const speciesAb = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_abilities.json'), 'utf8'));
const abIds = [...new Set(Object.values(speciesAb).flat().filter((a) => typeof a === 'string'))].sort();
const abilities = {};
for (const a of abIds) if (abilityText[a]) abilities[a] = abilityText[a];

fs.writeFileSync(path.join(here, 'showdown_moves.min.json'), JSON.stringify(moves));
fs.writeFileSync(path.join(here, 'showdown_abilities.min.json'), JSON.stringify(abilities));
console.log(`moves ${Object.keys(moves).length}/${Object.keys(ours).length}, abilities ${Object.keys(abilities).length}/${abIds.length}`);
