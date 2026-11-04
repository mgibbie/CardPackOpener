// weapon_swift_test.mjs — a Swift (first-strike) weapon strikes first.
//
// 2026-10-02 (a player): "my hero has Swift on their weapon — why do I take
// damage when I attack a minion? It did not have Swift." A 3/2 Swift weapon into
// a 3/2 creature killed it AND took 3 back: heroAttack let every defender strike
// back unconditionally. It now follows the creature rule (core.js attack()):
//   1. Swift weapon kills a non-Swift defender -> no damage back
//   2. Swift weapon, defender survives -> it strikes back as usual
//   3. both Swift -> simultaneous: the hero takes the hit
//   4. no Swift -> the hero takes the hit (unchanged)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._swiftblade = { id: '_swiftblade', name: 'Swift Blade', type: 'weapon', cost: 2, attack: 3, durability: 2, keywords: ['first_strike'], rarity: 'common' };
byId._blade = { id: '_blade', name: 'Blade', type: 'weapon', cost: 2, attack: 3, durability: 2, keywords: [], rarity: 'common' };
byId._grunt = { id: '_grunt', name: 'Grunt', type: 'creature', cost: 2, attack: 3, health: 2, rarity: 'common' };
byId._tough = { id: '_tough', name: 'Tough', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common' };
byId._duelist = { id: '_duelist', name: 'Duelist', type: 'creature', cost: 2, attack: 3, health: 2, keywords: ['first_strike'], rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fight(weaponId, defId) {
	const st = E.createGame(byId, seededRng(7), null, 2, [{ id: 'warrior', name: 'A', power: null }, { id: 'warrior', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.life = 30; p.armor = 0; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	const w = E.instantiate(byId[weaponId], 0); w.zone = 'weapon'; st.players[0].weapon = w;
	const d = E.instantiate(byId[defId], 1); d.zone = 'board'; d.sick = false; st.players[1].board.push(d); E.recomputeAuras(st);
	E.heroAttack(st, 0, { type: 'creature', uid: d.uid, player: 1 });
	return { life: st.players[0].life, dead: !st.players[1].board.includes(d) || d.damage >= d.maxHealth };
}

{ const r = fight('_swiftblade', '_grunt');
  ok('1. a 3/2 Swift weapon kills a 3/2 creature and takes no damage back', r.dead && r.life === 30, JSON.stringify(r)); }
{ const r = fight('_swiftblade', '_tough');
  ok('2. a Swift weapon that does NOT kill still takes the counter-attack', !r.dead && r.life === 27, JSON.stringify(r)); }
{ const r = fight('_swiftblade', '_duelist');
  ok('3. against a Swift defender both strike at once: the hero takes 3', r.dead && r.life === 27, JSON.stringify(r)); }
{ const r = fight('_blade', '_grunt');
  ok('4. a weapon without Swift takes the counter-attack (unchanged)', r.dead && r.life === 27, JSON.stringify(r)); }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
