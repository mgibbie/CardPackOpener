// ff_sim_pass_test.mjs — Lorequest: Final Fantasy, simulation balance pass (2026-10-13).
// The AI-vs-AI simulation (every hero vs every enemy; later rungs with the hero deck grown
// by the run's own rewards) after #685 still showed outliers: Henchmen Queen Brahne 19%,
// Black Waltz / Reno and Rude / Garland 27-28%, Professor Hojo 33%; Lieutenants Golbez,
// Zenos, Gabranth 35-36%; Archvillains Jenova 19%, Ardyn 20%, Kefka 24%, Emet-Selch 30%.
// Per-card ablation: the black package's cheap bodies (Qutrub Forayer, Tonberry, Morbid
// Opportunist, Undercity Dire Rat, Demon Wall, Hecteyes, Malboro) and a few hero powers
// (Brahne's and Emet-Selch's Spiritsummon, Hojo's 2/2, Jenova's Reborn 2/2, Kefka's
// sweep). +1 mana on those, in these twelve decks' own copies only; Brahne's and Jenova's
// powers +2. After: Henchmen 44-56%, Lieutenants 46-54%, Archvillains 38-52%.
// Pins the 57 changed costs and the hero-power costs.
import fs from 'fs';
import * as FF from '../../finalfantasy.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const COSTS = {"ff_e_reno_13":3,"ff_e_blackwaltz_13":3,"ff_e_garland_13":3,"ff_e_gabranth_11":3,"ff_e_golbez_13":3,"ff_e_kefka_14":3,
	"ff_e_emetselch_5":3,"ff_e_jenova_3":3,"ff_e_reno_2":4,"ff_e_blackwaltz_2":4,"ff_e_garland_2":4,"ff_e_golbez_2":4,"ff_e_zenos_9":4,
	"ff_e_kefka_3":4,"ff_e_ardyn_8":4,"ff_e_reno_7":4,"ff_e_blackwaltz_7":4,"ff_e_garland_7":4,"ff_e_gabranth_5":4,"ff_e_golbez_7":4,
	"ff_e_zenos_14":4,"ff_e_kefka_8":4,"ff_e_ardyn_13":4,"ff_e_reno_11":4,"ff_e_blackwaltz_11":4,"ff_e_garland_11":4,"ff_e_gabranth_9":4,
	"ff_e_golbez_11":4,"ff_e_kefka_12":4,"ff_e_emetselch_3":4,"ff_e_reno_3":6,"ff_e_blackwaltz_3":6,"ff_e_garland_3":6,"ff_e_golbez_3":6,
	"ff_e_zenos_10":6,"ff_e_kefka_4":6,"ff_e_ardyn_9":6,"ff_e_jenova_2":6,"ff_e_reno_12":2,"ff_e_blackwaltz_12":2,"ff_e_garland_12":2,
	"ff_e_gabranth_10":2,"ff_e_golbez_12":2,"ff_e_kefka_13":2,"ff_e_emetselch_4":2,"ff_e_reno_5":5,"ff_e_blackwaltz_5":5,"ff_e_garland_5":5,
	"ff_e_gabranth_3":5,"ff_e_golbez_5":5,"ff_e_zenos_12":5,"ff_e_kefka_6":5,"ff_e_ardyn_11":5,"ff_e_hojo_1":5,"ff_e_brahne_9":2,
	"ff_e_brahne_4":6,"ff_e_ardyn_1":7};
for (const [id, cost] of Object.entries(COSTS))
	ok(`${id} (${byId[id]?.name}) costs ${cost}`, byId[id] && byId[id].cost === cost, byId[id]?.cost);

const HP = { 'Queen Brahne': 4, 'Professor Hojo': 3, 'Kefka, Dancing Mad': 3, 'Emet-Selch, Unsundered': 3,
	'Jenova, Ancient Calamity': 4, 'Ardyn, the Usurper': 3, 'Golbez, Crystal Collector': 3,
	// in-band enemies keep theirs
	'Rufus Shinra': 2, 'Seifer Almasy': 2, 'Ultimecia, Time Sorceress': 2 };
for (const [ch, cost] of Object.entries(HP)) ok(`${ch} hero power costs ${cost}`, FF.powerOf(ch).cost === cost, FF.powerOf(ch).cost);

// an in-band deck's copy of a nerfed card is untouched (Rufus Shinra's Undercity Dire Rat)
const rat = raw.cards.find(c => c.ffDeck === 'Rufus Shinra' && c.name.endsWith('Undercity Dire Rat'));
ok("Rufus Shinra's Undercity Dire Rat still costs 1", rat && rat.cost === 1, rat?.cost);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
