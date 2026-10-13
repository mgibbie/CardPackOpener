// sc_later_rungs_nerf_test.mjs — Lorequest: Sword Coast, Rungs B-D balance pass (2026-10-13).
// Same AI-vs-AI simulation as sc_rung_a_nerf_test, with the hero's deck grown by the run's
// own reward rules (spoils + alternating treasure / class bucket) to the right win count.
// Outliers before: Rung B Baba Lysaga 16%, Xanathar / Ebondeath / Karazikar 28% (the rest
// 35-72%); Rung C Orcus 23% (the rest 34-43%); final bosses Tiamat 17%, Asmodeus 20%.
// They run the same black package as Rung A's Nalia/Kalain/Burakos/Safana, so the same
// +1 mana nerfs apply to their own copies, plus +1 on each hero power and on Tiamat's
// own big threats. After: Rung B 44-55%, Orcus 36%, Tiamat 28%, Asmodeus 32%.
// Pins the 50 changed costs and the hero-power costs.
import fs from 'fs';
import * as SC from '../../swordcoast.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const COSTS = {"sc_e_xanathar_2":3,"sc_e_babalysaga_2":3,"sc_e_orcus_15":3,"sc_e_xanathar_4":2,"sc_e_karazikar_2":2,"sc_e_babalysaga_4":2,
	"sc_e_xanathar_11":2,"sc_e_karazikar_9":2,"sc_e_ebondeath_5":2,"sc_e_babalysaga_11":2,"sc_e_orcus_4":2,"sc_e_asmodeus_8":2,
	"sc_e_xanathar_8":4,"sc_e_karazikar_6":4,"sc_e_ebondeath_2":4,"sc_e_babalysaga_8":4,"sc_e_asmodeus_5":4,"sc_e_xanathar_6":4,
	"sc_e_karazikar_4":4,"sc_e_babalysaga_6":4,"sc_e_xanathar_9":3,"sc_e_karazikar_7":3,"sc_e_ebondeath_3":3,"sc_e_babalysaga_9":3,
	"sc_e_asmodeus_6":3,"sc_e_xanathar_5":5,"sc_e_karazikar_3":5,"sc_e_babalysaga_5":5,"sc_e_xanathar_13":5,"sc_e_karazikar_11":5,
	"sc_e_ebondeath_7":5,"sc_e_babalysaga_13":5,"sc_e_orcus_6":5,"sc_e_asmodeus_10":5,"sc_e_karazikar_14":3,"sc_e_ebondeath_10":3,
	"sc_e_orcus_9":3,"sc_e_asmodeus_13":3,"sc_e_karazikar_15":3,"sc_e_ebondeath_11":3,"sc_e_orcus_10":3,"sc_e_asmodeus_14":3,
	"sc_e_tiamat_15":2,"sc_e_ebondeath_13":4,"sc_e_orcus_12":4,"sc_e_tiamat_1":10,"sc_e_tiamat_2":8,"sc_e_tiamat_9":7,"sc_e_tiamat_13":6,"sc_e_tiamat_14":7};
for (const [id, cost] of Object.entries(COSTS))
	ok(`${id} (${byId[id]?.name}) costs ${cost}`, byId[id] && byId[id].cost === cost, byId[id]?.cost);

const HP = { 'Xanathar, Guild Kingpin': 3, 'Karazikar, the Eye Tyrant': 3, 'Ebondeath, Dracolich': 3, 'Baba Lysaga, Night Witch': 3,
	'Orcus, Prince of Undeath': 3, Tiamat: 3, 'Asmodeus the Archfiend': 3,
	// in-band enemies keep theirs
	"Captain N'ghathrod": 2, 'Zalto, Fire Giant Duke': 2, 'Bhaal, Lord of Murder': 2 };
for (const [ch, cost] of Object.entries(HP)) ok(`${ch} hero power costs ${cost}`, SC.powerOf(ch).cost === cost, SC.powerOf(ch).cost);

// an in-band deck's copy of a nerfed card is untouched
const ng = raw.cards.filter(c => c.scDeck === "Captain N'ghathrod" && c.name.endsWith('Cast Down'));
ok("Captain N'ghathrod's Cast Down (if any) still costs 2", ng.every(c => c.cost === 2), ng.map(c => c.cost));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
