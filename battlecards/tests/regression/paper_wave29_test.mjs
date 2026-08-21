// paper_wave29_test.mjs — Feywild Otter (Prowess/Lifesteal + Grove's Bounty Adventure) and
// Liquid Dragon (an X-cost creature that enters as an X/X via stats-equal-x).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['feywild_otter', 'liquid_dragon'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(29), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Feywild Otter — keywords + Adventure "Grove's Bounty": target +2/+2 & Taunt
{ ok('Feywild Otter has Prowess & Lifesteal', byId.feywild_otter.keywords.includes('prowess') && byId.feywild_otter.keywords.includes('lifesteal')); }
{ const st = game(); const ally = put(st, 0, '_v'); const c = toHand(st, 0, 'feywild_otter');
  ok('Grove\'s Bounty Adventure is castable', E.canPlayAdventure(st, 0, c));
  E.playAdventure(st, 0, c.uid, { type: 'creature', uid: ally.uid, player: 0 }, null);
  ok('Grove\'s Bounty gives the target +2/+2 & Taunt', ally.attack === 4 && ally.maxHealth === 4 && ally.keywords.includes('taunt'), [ally.attack, ally.maxHealth, ally.keywords]);
  ok('Grove\'s Bounty returns the card to hand (creature half remains)', st.players[0].hand.some(x => x.id === 'feywild_otter' && x.adventureSpent), st.players[0].hand.map(x => x.id)); }

// Liquid Dragon — enters as an X/X (X = all remaining mana spent)
{ const st = game(); st.players[0].mana = { cur: 5, max: 5, bonus: 0 };
  const c = toHand(st, 0, 'liquid_dragon'); E.playCard(st, 0, c.uid, null);
  const ld = st.players[0].board.find(x => x.id === 'liquid_dragon');
  ok('Liquid Dragon enters as a 5/5 with 5 mana', ld && ld.attack === 5 && ld.maxHealth === 5, ld && [ld.attack, ld.maxHealth]);
  ok('Liquid Dragon spent all mana (X-cost)', st.players[0].mana.cur === 0, st.players[0].mana.cur); }
{ const st = game(); st.players[0].mana = { cur: 3, max: 3, bonus: 0 };
  const c = toHand(st, 0, 'liquid_dragon'); E.playCard(st, 0, c.uid, null);
  const ld = st.players[0].board.find(x => x.id === 'liquid_dragon');
  ok('Liquid Dragon enters as a 3/3 with 3 mana', ld && ld.attack === 3 && ld.maxHealth === 3, ld && [ld.attack, ld.maxHealth]); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; put(st, 0, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: st.players[0].board[0].uid, player: 0 }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
