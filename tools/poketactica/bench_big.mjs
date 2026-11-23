// bench_big.mjs — how long the engine (computer seats + wild foes) takes on the biggest made map: 32 x 32, 4 computer
// seats with 6 figurines each, 24 wild foes. Prints ms per round and the slowest single phase.
//   node tools/poketactica/bench_big.mjs [--rounds=8]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Ed from '../../poketactica/js/editor.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { matchSetup } from '../../poketactica/js/arenas.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../../overworld/rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const ROUNDS = +((process.argv.find((a) => a.startsWith('--rounds=')) || '').split('=')[1] || 8);

let m = Ed.newMap('Bench', 32, 32);
m = Ed.apply(Ed.apply(m, 'seat', 0, 0).map, 'seat', 31, 31).map;
for (let i = 0; i < 24; i++) m = Ed.apply(m, 'foe', 6 + (i % 6) * 4, 8 + Math.floor(i / 6) * 5, { foe: { sp: ['machamp', 'gengar', 'dragonite', 'tyranitar'][i % 4], lv: 50, ai: 'aggro' } }).map;
const picks = [['pikachu', 'charmander', 'squirtle', 'bulbasaur', 'machop', 'geodude'], ['abra', 'gastly', 'eevee', 'growlithe', 'pikachu', 'machop'], ['geodude', 'abra', 'squirtle', 'eevee', 'charmander', 'gastly'], ['bulbasaur', 'growlithe', 'machop', 'pikachu', 'abra', 'eevee']];
const config = { arena: 'custom', map: m, lv: 50, seats: [{ name: 'me', team: picks[0].map((sp, i) => makeFigurine(sp, 50, makeRng('me' + i), data, { id: sp + '-me' + i, shinyRate: 0 })) }, ...['CPU B', 'CPU C', 'CPU D'].map((name, i) => ({ name, cpu: true, picks: picks[i + 1], level: 50 }))] };
const t0 = performance.now();
const S = B.newBattle('bench', matchSetup(config, 'bench', data, makeFigurine, makeRng), data);
console.log(`setup ${(performance.now() - t0).toFixed(0)} ms; units ${S.units.length}`);
// seat a (a person) passes; the engine then plays the 3 computer seats and the wild phase inside that one call
let total = 0;
for (let r = 0; r < ROUNDS && !S.over; r++) {
	const r0 = performance.now();
	B.act(S, { t: 'end', by: 'a' }, data);
	const ms = performance.now() - r0; total += ms;
	console.log(`round ${S.turn}: ${ms.toFixed(0)} ms, on map ${S.units.filter((u) => u.hp > 0 && u.x != null).length}`);
}
console.log(`total ${total.toFixed(0)} ms`);
