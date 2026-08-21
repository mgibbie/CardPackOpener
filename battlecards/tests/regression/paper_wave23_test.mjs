// paper_wave23_test.mjs — Ramwin (Swing disguise + Morbid 4 discover), World Pillar Fragment
// (discover an Elemental -> summon it, keep the other two), Axebane Ferox (Charge & Deathtouch).
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['ramwin_sondheild', 'world_pillar_fragment', 'axebane_ferox'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(23), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Ramwin — Swing disguises a friendly; Morbid 4 queues a Discover
{ const st = game(); const ram = put(st, 0, 'ramwin_sondheild'); ram.sick = false; put(st, 0, '_v');
  E.attack(st, 0, ram.uid, { type: 'hero', player: 1 });
  ok('Ramwin Swing disguises a friendly creature', st.players[0].board.some(c => c.disguised), st.players[0].board.map(c => c.disguised)); }
{ const st = game(); put(st, 0, 'ramwin_sondheild');
  for (let i = 0; i < 4; i++) fireOngoing(st, 0, 'creature-died', { dead: byId._v });
  ok('Ramwin Morbid 4 queues a Discover on the 4th death', st.pickQueue.length > 0, st.pickQueue.length); }

// World Pillar Fragment — Discover an Elemental & Summon it; the other two go to hand
{ const st = game(); const b0 = st.players[0].board.length, h0 = st.players[0].hand.length;
  const wp = toHand(st, 0, 'world_pillar_fragment'); E.playCard(st, 0, wp.uid, null);
  const pq = st.pickQueue[0];
  ok('World Pillar queues an Elemental Discover (3 options)', pq && pq.ids && pq.ids.length === 3, pq && pq.ids);
  E.resolvePick(st, pq.ids[0]);
  ok('the picked Elemental is Summoned to the board', st.players[0].board.length === b0 + 1 && byId[st.players[0].board[b0].id] && (byId[st.players[0].board[b0].id].tribe || '').includes('Elemental'), st.players[0].board.map(c => c.id));
  ok('the other two Elementals go to hand', st.players[0].hand.filter(c => (byId[c.id]?.tribe || '').includes('Elemental')).length === 2, st.players[0].hand.map(c => c.id)); }

// Axebane Ferox — Charge & Deathtouch
{ ok('Axebane Ferox has Charge & Deathtouch', byId.axebane_ferox.keywords.includes('charge') && byId.axebane_ferox.keywords.includes('deathtouch')); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); if (st.pickQueue.length) E.resolvePick(st, st.pickQueue[0].ids[0]); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
