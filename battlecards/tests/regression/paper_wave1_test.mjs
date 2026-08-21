// paper_wave1_test.mjs — first hand-import wave of neutral paper creatures.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._beast = { id: '_beast', name: 'B', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._murloc = { id: '_murloc', name: 'M', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Murloc' };
byId._bcry = { id: '_bcry', name: 'BC', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', keywords: ['battlecry'] };
byId._art = { id: '_art', name: 'Art', type: 'artifact', cost: 1, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['tenacious_pup', 'lushwater_mercenary', 'blazing_skyfin', 'geode_tortoise', 'deepholm_geode',
  'boo_beloved_hero', 'balthor_the_defiled', 'gutmourn_pactbound_servant', 'ishkanah_broodmother', 'earthshaker_dreadmaw', 'godsire'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.type === 'creature' && c.collectible !== false && !c.colors);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0;
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, targetUid = null) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, targetUid); return c; };

// Tenacious Pup: gain life scaled by Beasts you control
{ const st = game(); put(st, 0, '_beast'); put(st, 0, '_beast'); st.players[0].life = 20;
  play(st, 0, 'tenacious_pup'); ok('Tenacious Pup gains life per Beast', st.players[0].life - 20 >= 2, st.players[0].life - 20); }

// Lushwater Mercenary: +1/+1 only if you control another Murloc
{ const st = game(); const m = play(st, 0, 'lushwater_mercenary'); ok('Lushwater Mercenary stays 3/2 with no other Murloc', m.attack === 3 && m.maxHealth === 2, `${m.attack}/${m.maxHealth}`); }
{ const st = game(); put(st, 0, '_murloc'); const m = play(st, 0, 'lushwater_mercenary'); ok('Lushwater Mercenary becomes 4/3 with another Murloc', m.attack === 4 && m.maxHealth === 3, `${m.attack}/${m.maxHealth}`); }

// Blazing Skyfin: +1/+1 after you play a Battlecry creature
{ const st = game(); const fin = put(st, 0, 'blazing_skyfin'); const a0 = fin.attack;
  fireOngoing(st, 0, 'creature-played', { minion: E.instantiate(byId._bcry, 0) });
  ok('Blazing Skyfin grows after a Battlecry creature', fin.attack === a0 + 1, fin.attack); }

// Geode Tortoise: deathrattle returns an artifact from graveyard
{ const st = game(); st.players[0].graveyard = [E.instantiate(byId._art, 0)];
  const t = put(st, 0, 'geode_tortoise'); runDeathrattle(st, 0, t);
  ok('Geode Tortoise deathrattle returns an artifact', st.players[0].hand.some(c => c.id === '_art'), st.players[0].hand.map(c => c.id)); }

// Deepholm Geode: end of turn deals 2 to the enemy hero + enemy creatures
{ const st = game(); put(st, 0, 'deepholm_geode'); const foe = put(st, 1, '_beast'); st.players[1].life = 30;
  fireOngoing(st, 0, 'turn-end', {});
  ok('Deepholm Geode hits the enemy hero for 2', st.players[1].life === 28, st.players[1].life);
  ok('Deepholm Geode hits enemy creatures', E.isDead(foe) || foe.damage >= 2, foe.damage); }

// Boo: exile removes a creature without a graveyard body
{ const st = game(); const foe = put(st, 1, '_beast'); play(st, 0, 'boo_beloved_hero', { type: 'creature', uid: foe.uid });
  ok('Boo exiles the target creature', !st.players[1].board.some(c => c.uid === foe.uid));
  ok('exiled creature does NOT go to the graveyard', !st.players[1].graveyard.some(c => c.id === '_beast')); }

// Balthor: aura gives other Undead +1/+1
{ const st = game(); const ghoul = E.instantiate({ id: '_undead', name: 'U', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Undead' }, 0);
  byId._undead = { id: '_undead', name: 'U', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Undead' };
  ghoul.zone = 'board'; ghoul.sick = false; st.players[0].board.push(ghoul); put(st, 0, 'balthor_the_defiled'); E.recomputeAuras(st);
  ok('Balthor buffs your other Undead +1/+1', ghoul.attack === 2 && ghoul.maxHealth === 2, `${ghoul.attack}/${ghoul.maxHealth}`); }

// Ishkanah: aura gives other Beasts +2/+2
{ const st = game(); const b = put(st, 0, '_beast'); put(st, 0, 'ishkanah_broodmother'); E.recomputeAuras(st);
  ok('Ishkanah buffs your other Beasts +2/+2', b.attack === 3 && b.maxHealth === 3, `${b.attack}/${b.maxHealth}`); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_beast', '_beast', '_beast'];
  const foe = put(st, 1, '_beast');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
