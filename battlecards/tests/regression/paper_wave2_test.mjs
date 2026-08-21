// paper_wave2_test.mjs — second hand-import wave of neutral paper cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._beast = { id: '_beast', name: 'B', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._murloc = { id: '_murloc', name: 'M', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Murloc' };
byId._faerie = { id: '_faerie', name: 'F', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Faerie' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['nemesis_of_reason', 'elvis_the_chronomancer', 'pouch_of_coins', 'emerald_proto_whelp', 'lynxfury_rager',
  'mistgrove_parliamentarian', 'third_little_pig', 'lushwater_scion', 'hakbal_of_the_surging_soul', 'nocturnal_gadgeteer'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0;
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, t = null) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, t); return c; };

// Nemesis of Reason: Swing -> enemy Mills 10
{ const st = game(); const n = put(st, 0, 'nemesis_of_reason'); st.players[1].deck = Array(12).fill('_beast');
  E.attack(st, 0, n.uid, { type: 'hero', player: 1 });
  ok('Nemesis of Reason Swing mills the enemy deck by 10', st.players[1].deck.length === 2, st.players[1].deck.length); }

// Pouch of Coins: add two coins to hand
{ const st = game(); const before = st.players[0].hand.length; play(st, 0, 'pouch_of_coins');
  ok('Pouch of Coins adds two coins to hand', st.players[0].hand.length - before === 2, st.players[0].hand.length - before); }

// Emerald Proto-Whelp: battlecry destroys a Faerie; end of turn +1 Attack
{ const st = game(); const fae = put(st, 1, '_faerie'); const bear = put(st, 1, '_beast');
  const w = play(st, 0, 'emerald_proto_whelp', { type: 'creature', uid: fae.uid });
  ok('Emerald Proto-Whelp destroys the target Faerie', E.isDead(fae) || !st.players[1].board.some(c => c.uid === fae.uid));
  const a0 = w.attack; fireOngoing(st, 0, 'turn-end', {});
  ok('Emerald Proto-Whelp gains +1 Attack at end of turn', w.attack === a0 + 1, w.attack); }

// Lynxfury Rager: Frenzy (survives damage) -> +2/+2 once
{ const st = game(); const lynx = put(st, 0, 'lynxfury_rager'); const a0 = lynx.attack, h0 = lynx.maxHealth;
  damageCreature(st, lynx, 1, null);
  ok('Lynxfury Rager Frenzy grows +2/+2 after surviving damage', lynx.attack === a0 + 2 && lynx.maxHealth === h0 + 2, `${lynx.attack}/${lynx.maxHealth}`); }

// Mistgrove Parliamentarian: Inspire buffs a friendly creature
{ const st = game(); put(st, 0, '_beast'); put(st, 0, 'mistgrove_parliamentarian');
  const sum = () => st.players[0].board.reduce((n, c) => n + c.attack + c.maxHealth, 0);
  const before = sum(); fireOngoing(st, 0, 'hero-power-used', {});
  // buff-random-friendly picks either creature — assert a +1/+1 landed on the board, not on a specific one
  ok('Mistgrove Parliamentarian Inspire buffs a friendly creature', sum() === before + 2, sum() - before); }

// Third Little Pig: summoning a Beast gives it +1/+1
{ const st = game(); put(st, 0, 'third_little_pig'); const b = play(st, 0, '_beast');
  ok('Third Little Pig buffs a summoned Beast +1/+1', b.attack === 2 && b.maxHealth === 2, `${b.attack}/${b.maxHealth}`); }

// Lushwater Scion: summoning a Murloc gives it +1/+1
{ const st = game(); put(st, 0, 'lushwater_scion'); const m = play(st, 0, '_murloc');
  ok('Lushwater Scion buffs a summoned Murloc +1/+1', m.attack === 2 && m.maxHealth === 2, `${m.attack}/${m.maxHealth}`); }

// Nocturnal Gadgeteer: Swing -> Dredge
{ const st = game(); const g = put(st, 0, 'nocturnal_gadgeteer'); st.players[0].deck = ['_beast', '_murloc', '_faerie', '_beast'];
  E.attack(st, 0, g.uid, { type: 'hero', player: 1 });
  ok('Nocturnal Gadgeteer Swing queues a Dredge', (st.dredgeQueue || []).length > 0 || st.pickQueue.length > 0); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_beast', '_beast', '_beast'];
  const foe = put(st, 1, '_faerie');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
