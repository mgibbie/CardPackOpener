// sc_rung_a_nerf_test.mjs — Lorequest: Sword Coast, Rung A balance pass (2026-10-13).
// Nobody had played Sword Coast, so this pass came from an AI-vs-AI simulation: every
// hero vs every Rung A enemy (1,800 fights, fights 1 and 3), calibrated on Middle-earth,
// where the sim ranked the enemies the same way the testers' replays did. Seven of nine
// Rung A enemies held heroes to 10-20% (Grishnákh territory); Grumgully and Targ Nar sat
// at 45-46%. Per-card ablation showed cheap early bodies drove it (Taunting Kobold, Brash
// Taunter, Vampire Spawn, Reassembling Skeleton, ...), not the burn. Nerfs are mostly +1
// mana, on these seven enemies' OWN copies only — later rungs share card names and were
// not simulated. After: 34-46%. Pins the 64 changed costs and the hero-power costs.
import fs from 'fs';
import * as SC from '../../swordcoast.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const NERFED = ["Nalia de'Arnise", 'Kalain, Reclusive Painter', 'Gut, True Soul Zealot', 'Burakos, Party Leader',
	'Safana, Calimport Cutthroat', 'Kazuul, Tyrant of the Cliffs', 'Baeloth Barrityl, Entertainer'];
const COSTS = {"sc_e_gut_4":3,"sc_e_gut_7":6,"sc_e_gut_8":7,"sc_e_gut_9":4,"sc_e_gut_11":2,"sc_e_gut_12":4,"sc_e_gut_14":2,"sc_e_gut_15":3,
	"sc_e_baeloth_2":3,"sc_e_baeloth_5":6,"sc_e_baeloth_6":7,"sc_e_baeloth_7":4,"sc_e_baeloth_9":2,"sc_e_baeloth_10":4,"sc_e_baeloth_12":2,"sc_e_baeloth_13":3,"sc_e_baeloth_14":6,"sc_e_baeloth_15":8,
	"sc_e_burakos_2":3,"sc_e_burakos_4":2,"sc_e_burakos_5":5,"sc_e_burakos_6":4,"sc_e_burakos_8":4,"sc_e_burakos_9":3,"sc_e_burakos_11":2,"sc_e_burakos_13":5,
	"sc_e_safana_1":4,"sc_e_safana_2":5,"sc_e_safana_3":4,"sc_e_safana_5":4,"sc_e_safana_6":3,"sc_e_safana_8":2,"sc_e_safana_10":5,"sc_e_safana_13":3,"sc_e_safana_14":3,
	"sc_e_nalia_1":5,"sc_e_nalia_2":3,"sc_e_nalia_4":2,"sc_e_nalia_5":5,"sc_e_nalia_6":4,"sc_e_nalia_8":4,"sc_e_nalia_9":3,"sc_e_nalia_11":2,"sc_e_nalia_13":5,
	"sc_e_kalain_1":4,"sc_e_kalain_2":3,"sc_e_kalain_4":2,"sc_e_kalain_5":5,"sc_e_kalain_6":4,"sc_e_kalain_8":4,"sc_e_kalain_9":3,"sc_e_kalain_11":2,"sc_e_kalain_13":5,
	"sc_e_kazuul_1":6,"sc_e_kazuul_3":6,"sc_e_kazuul_4":7,"sc_e_kazuul_5":4,"sc_e_kazuul_7":2,"sc_e_kazuul_8":4,"sc_e_kazuul_10":2,"sc_e_kazuul_11":3,"sc_e_kazuul_12":6,"sc_e_kazuul_13":8,"sc_e_kazuul_14":3};
for (const [id, cost] of Object.entries(COSTS))
	ok(`${id} (${byId[id]?.name}) costs ${cost}`, byId[id] && byId[id].cost === cost, byId[id]?.cost);

// readable spot-checks
const card = (deck, name) => raw.cards.find(c => c.scDeck === deck && (c.name === name || c.name.endsWith("'s " + name) || c.name.endsWith("' " + name)));
ok('Taunting Kobold (Kazuul) costs 2', card('Kazuul, Tyrant of the Cliffs', 'Taunting Kobold')?.cost === 2);
ok('Lightning Bolt (Gut) costs 2', card('Gut, True Soul Zealot', 'Lightning Bolt')?.cost === 2);
ok('Nighthawk Scavenger (Nalia) costs 4', card("Nalia de'Arnise", 'Nighthawk Scavenger')?.cost === 4);
ok('Kalain, Reclusive Painter costs 4', card('Kalain, Reclusive Painter', 'Kalain, Reclusive Painter')?.cost === 4);
// the later rungs' copies are untouched (they were not simulated)
const laterBolts = raw.cards.filter(c => c.scDeck && !NERFED.includes(c.scDeck) && c.name.endsWith('Lightning Bolt'));
ok('later-rung Lightning Bolts still cost 1', laterBolts.every(c => c.cost === 1), laterBolts.map(c => `${c.id}:${c.cost}`));

const HP = { 'Gut, True Soul Zealot': 3, 'Baeloth Barrityl, Entertainer': 3, 'Safana, Calimport Cutthroat': 3,
	"Nalia de'Arnise": 4, 'Kalain, Reclusive Painter': 3, 'Burakos, Party Leader': 2 };
for (const [ch, cost] of Object.entries(HP)) ok(`${ch} hero power costs ${cost}`, SC.powerOf(ch).cost === cost, SC.powerOf(ch).cost);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
