// lorequest_multiverse_balance_test.mjs — Lorequest + Multiverse balance pass (2026-10-14).
// First run of the run-mode simulator on the two win-parity modes (#699).
// MULTIVERSE (no real play yet, so the simulator is the only evidence). Hero win rate before -> after:
//   Rogues' Gallery: Shocker 12->28, Mysterio 12->~22, Doctor Octopus 13->35, Sandman 16->30,
//     Electro 20->29, Rhino 24->28, Lizard 24->35, Venom 28->29
//   Mastermind: Kang 25->31;  Cosmic: Galactus 8->20 (Thanos 27, unchanged)
//   Two BUGS fixed: Shocker's and Storm's hero powers said "freeze an enemy creature" / "freeze it"
//   but froze EVERY enemy creature (target 'enemy-creatures'); now one, as the text says.
// LOREQUEST: the simulator disagreed with the testers' replays here — it had the bosses at 9-30%
//   while real players beat them 12-3, and it ranked several planeswalkers opposite to real play
//   (Jace 29% sim / 84% real; Ajani and Sorin ~40% sim / 0-10 and 0-11 real). Only where BOTH agree:
//   Elspeth (13% sim, 1-8 real) and Vivian (23% sim, 6-13 real) are nerfed; bosses are not.
// Every change is +1 mana on the character's OWN base cards (never the shared class buckets) or a
// hero-power change. Pins the 80 changed costs and fires both bug fixes.
import fs from 'fs';
import * as E from '../../engine.js';
import * as MV from '../../multiverse.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 4, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const COSTS = {
	"mv_e_shocker_6": 2, "mv_e_shocker_8": 4, "mv_e_shocker_9": 4, "mv_e_mysterio_1": 6, "mv_e_mysterio_5": 6,
	"mv_e_mysterio_8": 4, "mv_e_mysterio_9": 4, "mv_e_mysterio_2": 4, "mv_e_ock_1": 6, "mv_e_ock_6": 4,
	"mv_e_ock_8": 4, "mv_e_ock_5": 6, "mv_e_ock_9": 4, "mv_e_sandman_1": 6, "mv_e_sandman_8": 4,
	"mv_e_sandman_9": 4, "mv_e_sandman_5": 5, "mv_e_sandman_10": 4, "mv_e_electro_1": 6, "mv_e_electro_6": 2,
	"mv_e_electro_5": 4, "mv_e_electro_8": 4, "mv_e_electro_9": 4, "mv_e_rhino_1": 6, "mv_e_rhino_5": 5,
	"mv_e_rhino_9": 4, "mv_e_rhino_8": 4, "mv_e_lizard_1": 6, "mv_e_lizard_6": 3, "mv_e_lizard_5": 6,
	"mv_e_lizard_9": 4, "mv_e_lizard_10": 4, "mv_e_venom_6": 4, "mv_e_venom_5": 5, "mv_e_venom_8": 4,
	"mv_e_kang_1": 7, "mv_e_kang_9": 6, "mv_e_kang_8": 6, "mv_e_kang_5": 6, "mv_e_galactus_1": 10,
	"mv_e_galactus_5": 7, "mv_e_galactus_9": 7, "mv_e_galactus_8": 6, "mv_e_galactus_10": 4, "mv_e_galactus_2": 6,
	"mv_e_ock_2": 4, "mv_e_ock_3": 4, "mv_e_ock_4": 5, "mv_e_ock_7": 4, "mv_e_ock_10": 4,
	"mv_e_sandman_2": 5, "mv_e_sandman_3": 4, "mv_e_sandman_4": 6, "mv_e_sandman_6": 3, "mv_e_sandman_7": 5,
	"mv_e_kang_2": 5, "mv_e_kang_3": 4, "mv_e_kang_4": 6, "mv_e_kang_6": 4, "mv_e_kang_7": 5,
	"mv_e_kang_10": 4, "mv_e_galactus_3": 7, "mv_e_galactus_4": 7, "mv_e_galactus_6": 4, "mv_e_galactus_7": 6,
	"mv_e_shocker_5": 5, "mv_e_shocker_10": 4, "mv_e_mysterio_6": 3, "mv_e_mysterio_10": 4, "mv_e_lizard_2": 4,
	"mv_e_lizard_8": 4, "elspeth_devotee": 3, "elspeth_smite": 2, "elspeth_command": 5, "elspeth_solidarity": 4,
	"elspeth_ascent": 6, "elspeth_vanguard": 5, "vivian_stampede": 5, "vivian_beastcaller": 5, "vivian_talent": 4,
};
for (const [id, cost] of Object.entries(COSTS)) ok(`${id} (${byId[id]?.name}) costs ${cost}`, byId[id] && byId[id].cost === cost, byId[id]?.cost);
ok('no Lorequest boss card changed', !Object.keys(COSTS).some(id => MV && byId[id]?.loreDeck && !['Elspeth', 'Vivian'].includes(byId[id].loreDeck)));

const POWER = { Shocker: 3, Storm: 2, Sandman: 3, Mysterio: 3, 'Kang the Conqueror': 3, Galactus: 5, Thanos: 2 };
for (const [ch, cost] of Object.entries(POWER)) ok(`${ch} hero power costs ${cost}`, MV.powerOf(ch).cost === cost, MV.powerOf(ch).cost);

// the freeze bug, fired: one creature frozen, not all of them
const classes = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url))).classes;
const seat = n => { const cls = MV.classOf(n); const def = classes.find(c => c.id === cls) || { id: cls }; return { ...def, id: cls, name: n, power: MV.powerOf(n) }; };
for (const ch of ['Shocker', 'Storm']) {
	const st = E.createGame(byId, seededRng(2), ['_v', '_v', '_v', '_v', '_v', '_v'], 2, [seat(ch), seat('Thor')]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) p.mana = { cur: 10, max: 10, bonus: 0 };
	const foes = [0, 1, 2].map(() => { const c = E.instantiate(byId._v, 1); c.zone = 'board'; st.players[1].board.push(c); return c; });
	const hp = st.players[0].heroPowers.find(h => h.name === MV.powerOf(ch).name);
	E.useHeroPower(st, 0, hp.uid, { type: 'creature', uid: foes[0].uid, player: 1 }, null);
	const frozen = foes.filter(c => c.frozen).length;
	ok(`${ch}: the power freezes ONE enemy creature (the one targeted), as its text says`, frozen === 1 && foes[0].frozen, frozen);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
