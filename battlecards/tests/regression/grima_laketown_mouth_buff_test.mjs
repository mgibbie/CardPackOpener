// grima_laketown_mouth_buff_test.mjs — a further slight buff for three Middle-earth enemies that
// were still easy after #697 (2026-10-14). Stats and effects only; no mana cost lowered.
// Hero win rate before -> after (run-mode simulator):
//   Master of Lake-town 60 -> 51: Desolation Prowler, Troll of Khazad-dûm, Rhovanion Rampager +1 Health
//   Mouth of Sauron 60 -> 51: Parley (hero power) also deals 1 damage to an enemy creature; seven cards +1
//   Gríma Wormtongue 60 -> 56: Footman, Cirith Ungol Patrol, Dreaded Bat-Cloud, Nazgûl Battle-Mace +1 Attack.
//     Gríma barely responds to buffs: a freeze+2 or summoning hero power, more Health on her creatures
//     and damage on her discard cards all left her at 55-59%, so only the stat buffs that moved her ship.
import fs from 'fs';
import * as E from '../../engine.js';
import * as ME from '../../middleearth.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 4, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// [cost, attack, health-or-durability]
const STATS = {
	me_gm_footman: [4, 4, 4], me_gm_patrol: [5, 5, 5], me_gm_batcloud: [4, 4, 4], me_gm_wep: [3, 3, 3],
	me_mlt_prowler: [4, 4, 4], me_mlt_troll: [6, 6, 6], me_mlt_rampager: [5, 5, 5],
	me_mo_captain: [3, 4, 3], me_mo_master: [4, 4, 4], me_mo_wep: [3, 3, 3], me_mo_sig: [5, 5, 6],
	me_mo_hostage: [4, 3, 4], me_mo_archivist: [4, 4, 5], me_mo_nazgul: [4, 4, 4],
};
for (const [id, [cost, atk, hp]] of Object.entries(STATS)) {
	const c = byId[id]; const second = c?.type === 'weapon' ? c.durability : c?.health;
	ok(`${c?.name} is ${cost}-mana ${atk}/${hp}`, c && c.cost === cost && c.attack === atk && second === hp, c && [c.cost, c.attack, second]);
}

// Parley, fired
const classes = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url))).classes;
const seat = n => { const cls = ME.classOf(n); const def = classes.find(c => c.id === cls) || { id: cls }; return { ...def, id: cls, name: n, power: ME.powerOf(n) }; };
const st = E.createGame(byId, seededRng(9), ['_v', '_v', '_v', '_v', '_v', '_v'], 2, [seat('The Mouth of Sauron'), seat('Aragorn')]);
st.current = 0; st.priority = null; st.stack = [];
for (const p of st.players) p.mana = { cur: 10, max: 10, bonus: 0 };
const foe = E.instantiate(byId._v, 1); foe.zone = 'board'; st.players[1].board.push(foe);
st.players[1].hand = [E.instantiate(byId._v, 1), E.instantiate(byId._v, 1)];
const h0 = st.players[0].hand.length;
const hp = st.players[0].heroPowers.find(h => h.name === 'Parley');
E.useHeroPower(st, 0, hp.uid, { type: 'creature', uid: foe.uid, player: 1 }, null);
ok('Parley: the opponent discards, you draw, and it deals 1 to an enemy creature',
	st.players[1].hand.length === 1 && st.players[0].hand.length === h0 + 1 && E.hp(foe) === 3, [st.players[1].hand.length, st.players[0].hand.length - h0, E.hp(foe)]);
ok('Parley still costs 2', ME.powerOf('The Mouth of Sauron').cost === 2);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
