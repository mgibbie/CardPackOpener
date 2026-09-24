// encounterrate_test.mjs — wild encounters fire at the source game's rate.
//
// Playtest report: "wild encounters roll rate/100 per grass step — on Rt111 that's
// 10% vs vanilla's ~5.6%, so ~1.8x the encounter rate." Gen 3 rolls
// Random() % 2880 < rate * 16 (rate/180); Crystal rolls Random() < N percent
// (rate/100). The port used rate/100 for everything.
//
//   node overworld/tests/encounterrate_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Encounters, encounterChance } from '../encounters.js';
import { CRYSTAL_RATE_MAPS } from '../encounter_games.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---------- the per-game formulas ----------
A(near(encounterChance('MAP_ROUTE111', 10), 10 * 16 / 2880), 'Route 111 (Emerald, rate 10) = 160/2880 = 5.6%, not 10%', encounterChance('MAP_ROUTE111', 10));
A(near(encounterChance('MAP_ROUTE1', 21), 21 * 16 / 2880), 'Route 1 (FRLG, rate 21) uses the gen-3 scale');
A(near(encounterChance('MAP_ROCK_TUNNEL_1F', 7), 7 / 180), "Rock Tunnel 1F is FRLG's (the id also exists in Crystal)");
A(near(encounterChance('MAP_ROUTE_29', 10), 0.10), 'Route 29 (Crystal, 10 percent) stays 10%');
A(near(encounterChance('MAP_JOHKANTO_ROUTE_1', 25), 0.25), 'JohKanto maps are Crystal-scale');
A(near(encounterChance('MAP_ANYWHERE', 25, true), 0.25), 'port-authored rates (postgame tables) are plain percents');
A(encounterChance('MAP_ROUTE111', 0) === 0 && encounterChance('MAP_ROUTE111', undefined) === 0, 'no rate, no encounters');
A(encounterChance('MAP_ROUTE111', 999) === 1, 'the chance is capped at 1 (gen 3 caps at 2880)');

// ---------- the classification agrees with the data ----------
const enc = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/encounters.json'), 'utf8'));
const stale = [...CRYSTAL_RATE_MAPS].filter(id => !enc[id]);
A(CRYSTAL_RATE_MAPS.size >= 100 && !stale.length, `every Crystal-rate map is a real encounter map (${CRYSTAL_RATE_MAPS.size}; rerun tools/gen_encounter_games.mjs if not)`, stale.slice(0, 5).join(' '));
A(!CRYSTAL_RATE_MAPS.has('MAP_ROUTE111') && !CRYSTAL_RATE_MAPS.has('MAP_PALLET_TOWN') && !CRYSTAL_RATE_MAPS.has('MAP_HOENN2_ROUTE111'),
	'Hoenn, FRLG Kanto and Hoenn2 maps are gen-3 scale');

// ---------- the live roll: ~5.6% a grass step on Route 111 ----------
const e = new Encounters();
e.data = { MAP_ROUTE111: { land: { rate: 10, slots: [{ species: 'SPECIES_SANDSHREW', min: 20, max: 22, chance: 100 }] } } };
e.species = {};
e.pick = () => ({ id: 'sandshrew', level: 20 });   // slot choice isn't under test
const grass = { isTallGrass: () => true, isSurfable: () => false, hasTallGrass: () => true };
let hits = 0; const N = 200000;
for (let i = 0; i < N; i++) if (e.roll('MAP_ROUTE111', grass, 1, 1, false)) hits++;
const rate = hits / N;
A(Math.abs(rate - 1 / 18) < 0.003, `Route 111 grass fires ~5.6% of steps (measured ${(rate * 100).toFixed(2)}%)`);

// ---------- Rock Smash uses the same scale ----------
const mainSrc = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
A(/encounterChance\(world\.current\.map\.id, grp\.rate\)/.test(mainSrc), 'Rock Smash rolls through encounterChance too');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
