// pool_tekuthal_test.mjs — Tekuthal boss pool (U Phyrexian proliferate / +1/+1 counters; the sig proliferates twice).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 6, attack: 6, health: 8, rarity: 'common', tribe: 'Beast' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Tekuthal');
// ---- rubric ----
ok('Tekuthal pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/instant/artifact/secret/enchantment', types.size >= 6 && ['weapon', 'instant', 'artifact', 'secret', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Blue', pool.every(c => (c.colors || []).join('') === 'U'));
ok('the boss (sig) doubles proliferate', byId.tekuthal_sig.type === 'creature' && byId.tekuthal_sig.static && byId.tekuthal_sig.static.type === 'proliferate-doubler');

function game() {
  const st = E.createGame(byId, seededRng(38), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const seed = (st, c) => { E.execEffects(st, c.controller, [{ type: 'grow', target: 'self', attack: 1, health: 1 }], null, c); }; // give a creature a +1/+1 counter
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_big'); let threw = null;
  const foeTgt = ['tekuthal_mimicry', 'tekuthal_scorn', 'tekuthal_precision'].includes(c.id);
  const frTgt = c.id === 'tekuthal_metamorph';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- proliferate-doubler: with Tekuthal, proliferate is doubled ----
{ const st = game(); const v = put(st, 0, '_v'); seed(st, v); const a0 = v.attack; // 3/3 with a counter
  E.execEffects(st, 0, [{ type: 'proliferate' }], null, null);
  ok('without Tekuthal, proliferate adds +1/+1', v.attack === a0 + 1, [a0, v.attack]);
  const st2 = game(); const v2 = put(st2, 0, '_v'); seed(st2, v2); put(st2, 0, 'tekuthal_sig'); const b0 = v2.attack;
  E.execEffects(st2, 0, [{ type: 'proliferate' }], null, null);
  ok('with Tekuthal, proliferate is DOUBLED (+2/+2)', v2.attack === b0 + 2, [b0, v2.attack]); }

// ---- sig: battlecry seeds counters, turn-start proliferates (doubled) ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'tekuthal_sig', null); // battlecry: +1/+1 counter on each creature
  ok('Sig battlecry puts a +1/+1 counter on your creatures', v.attack === a0 + 1, [a0, v.attack]);
  const a1 = v.attack;
  E.fireOngoing(st, 0, 'turn-start'); // sig proliferates, doubled -> +2/+2
  ok('Sig turn-start proliferate is doubled (+2/+2)', v.attack === a1 + 2, [a1, v.attack]); }

// ---- proliferator: proliferate when you cast ----
{ const st = game(); const v = put(st, 0, '_v'); seed(st, v); put(st, 0, 'tekuthal_proliferator'); const a0 = v.attack;
  cast(st, 0, '_bolt');
  ok('Proliferator proliferates when you cast a spell', v.attack === a0 + 1, [a0, v.attack]); }

// ---- metamorph: two +1/+1 counters ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'tekuthal_metamorph', { type: 'creature', uid: v.uid, player: 0 });
  ok('Metamorph puts two +1/+1 counters on a creature', v.attack === a0 + 2 && v.counters >= 2, [a0, v.attack, v.counters]); }

// ---- cobalt golem: self counter each turn ----
{ const st = game(); const g = put(st, 0, 'tekuthal_cobalt_golem'); const a0 = g.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Cobalt Golem grows +1/+1 at turn start', g.attack === a0 + 1, [a0, g.attack]); }

// ---- seastrider: counter when it attacks ----
{ const st = game(); const ss = put(st, 0, 'tekuthal_seastrider'); const a0 = ss.attack;
  E.attack(st, 0, ss.uid, { type: 'hero', player: 1 });
  ok('Seastrider grows +1/+1 when it attacks', ss.attack === a0 + 1, [a0, ss.attack]); }

// ---- infiltrator: draw ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'tekuthal_infiltrator', null);
  ok('Infiltrator draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- mimicry: bounce an enemy ----
{ const st = game(); const foe = put(st, 1, '_v'); const eh0 = st.players[1].hand.length;
  play(st, 0, 'tekuthal_mimicry', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Mimicry bounces an enemy creature to hand', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length === eh0 + 1, [st.players[1].board.length, st.players[1].hand.length]); }

// ---- seachrome weapon: proliferate on hero attack ----
{ const st = game(); const v = put(st, 0, '_v'); seed(st, v); play(st, 0, 'tekuthal_seachrome_mirror_armor', null); const a0 = v.attack;
  ok('Seachrome equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Seachrome proliferates after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

// ---- scorn instant: bounce + draw ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'tekuthal_scorn', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Scorn bounces an enemy and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

// ---- skullbomb artifact: tap to deal 2 ----
{ const st = game(); const foe = put(st, 1, '_v'); play(st, 0, 'tekuthal_skullbomb', null);
  const art = st.players[0].artifacts.find(a => a.id === 'tekuthal_skullbomb');
  E.tapArtifact(st, 0, art.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Skullbomb taps to deal 2 to a creature', foe.damage === 2, foe.damage); }

// ---- trickery secret: counter + proliferate ----
{ const st = game(); const v = put(st, 0, '_v'); seed(st, v); play(st, 0, 'tekuthal_trickery', null);
  ok('Trickery installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const myLife0 = st.players[0].life; const a0 = v.attack;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Trickery counters the enemy spell (no damage)', st.players[0].life === myLife0, [myLife0, st.players[0].life]);
  ok('Trickery proliferates (your counter-bearer grows)', v.attack === a0 + 1, [a0, v.attack]); }

// ---- precision: removal + proliferate ----
{ const st = game(); const foe = put(st, 1, '_v'); const mine = put(st, 0, '_v'); seed(st, mine); const a0 = mine.attack;
  play(st, 0, 'tekuthal_precision', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Precision deals 5 to a creature (kills it) and proliferates', !st.players[1].board.some(c => c.uid === foe.uid) && mine.attack === a0 + 1, [st.players[1].board.length, a0, mine.attack]); }

// ---- reflection enchantment + compleation ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'tekuthal_reflection', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Reflection puts a +1/+1 counter on your creatures each turn', v.attack === a0 + 1, [a0, v.attack]);
  const a1 = v.attack;
  play(st, 0, 'tekuthal_compleation', null);
  ok('Compleation gives +2/+2 then proliferates (+3 total)', v.attack === a1 + 3, [a1, v.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
