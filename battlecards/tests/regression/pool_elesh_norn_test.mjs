// pool_elesh_norn_test.mjs — Elesh Norn boss pool (W Phyrexian: anthem yours + WEAKEN theirs + go-wide + walls).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._foe = { id: '_foe', name: 'F', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
byId._phy = { id: '_phy', name: 'P', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Phyrexian' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Elesh Norn');
// ---- rubric ----
ok('Elesh Norn pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/location/quest/instant', types.size >= 6 && ['enchantment', 'location', 'quest', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.taps).length >= 3, pool.filter(c => c.ongoing || c.aura || c.taps).map(c => c.id));
ok('the boss (sig) is a Phyrexian creature commander', byId.elesh_norn_sig.type === 'creature');

function game() {
  const st = E.createGame(byId, seededRng(15), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_foe', '_foe', '_foe', '_foe', '_foe', '_foe']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_phy'); const foe = put(st, 1, '_foe'); let threw = null;
  const tgt = (c.id === 'elesh_norn_edict') ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'elesh_norn_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- decree: weaken all enemy creatures -2/-2 ----
{ const st = game(); const foe = put(st, 1, '_foe');
  play(st, 0, 'elesh_norn_decree', null);
  ok('Decree gives enemy creatures -2/-2 (3/4 -> 1/2)', foe.attack === 1 && E.hp(foe) === 2, [foe.attack, E.hp(foe)]); }

// ---- weaken kills a damaged creature ----
{ const st = game(); const foe = put(st, 1, '_foe'); foe.damage = 3; // 3/4 with 3 damage (1 hp)
  play(st, 0, 'elesh_norn_decree', null); E.sweepDeaths(st);
  ok('Weaken kills a damaged creature (3 dmg on a 3/4 -> -2/-2 = dead)', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.map(c => c.id)); }

// ---- the boss: buff yours +2/+2 AND weaken theirs -2/-2 ----
{ const st = game(); const ally = put(st, 0, '_phy'); const foe = put(st, 1, '_foe');
  play(st, 0, 'elesh_norn_sig', null);
  ok('Elesh Norn boss buffs your creatures +2/+2', ally.attack === 4 && E.hp(ally) === 4, [ally.attack, E.hp(ally)]);
  ok('Elesh Norn boss weakens enemy creatures -2/-2', foe.attack === 1 && E.hp(foe) === 2, [foe.attack, E.hp(foe)]); }

// ---- choirmaster: Phyrexian anthem ----
{ const st = game(); play(st, 0, 'elesh_norn_choirmaster', null); const p = put(st, 0, '_phy'); E.recomputeAuras(st);
  ok('Choirmaster gives Phyrexians +1/+1', p.attack === 3 && E.hp(p) === 3, [p.attack, E.hp(p)]); }

// ---- inquisitor: Phyrexian lord ----
{ const st = game(); put(st, 0, 'elesh_norn_inquisitor'); const p = put(st, 0, '_phy'); E.recomputeAuras(st);
  ok('Inquisitor buffs other Phyrexians +1/+0', p.attack === 3, p.attack); }

// ---- wellspring location: tap for a Phyrexian ----
{ const st = game(); play(st, 0, 'elesh_norn_wellspring', null);
  const loc = st.players[0].board.find(c => c.id === 'elesh_norn_wellspring');
  E.tapLand(st, 0, loc.uid, 0);
  ok('Wellspring taps for a Phyrexian with Divine Shield', st.players[0].board.some(c => c.name === 'Phyrexian' && c.shield), st.players[0].board.map(c => c.name)); }

// ---- command Choose One (mode 1 = weaken) ----
{ const st = game(); const foe = put(st, 1, '_foe');
  play(st, 0, 'elesh_norn_command', null, 1);
  ok('Command (weaken mode) gives enemy creatures -2/-2', foe.attack === 1 && E.hp(foe) === 2, [foe.attack, E.hp(foe)]); }

// ---- uniformity quest: summon 5 -> double swing ----
{ const st = game(); const ally = put(st, 0, '_phy'); const foe = put(st, 1, '_foe');
  play(st, 0, 'elesh_norn_uniformity', null);
  ok('Uniformity installs as a quest', st.players[0].quests.length === 1);
  for (let i = 0; i < 5; i++) play(st, 0, '_phy', null);
  ok('Uniformity reward buffs yours (+2/+2 & DS)', ally.attack === 4 && ally.shield === true, [ally.attack, ally.shield]);
  ok('Uniformity reward weakens theirs (-2/-2)', foe.attack === 1 && E.hp(foe) === 2, [foe.attack, E.hp(foe)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
