// pool_gruul_test.mjs — Gruul land pool (RG big beaters + haste/riot + fight/smash + trample).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._small = { id: '_small', name: 'S', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Gruul');
// ---- rubric ----
ok('Gruul pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/quest/artifact/enchantment', types.size >= 6 && ['instant', 'quest', 'artifact', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GR', pool.every(c => (c.colors || []).slice().sort().join('') === 'GR'));

function game() {
  const st = E.createGame(byId, seededRng(44), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const tgt = (c.id === 'ruric_thar_gruul_champion') ? { type: 'creature', uid: foe.uid, player: 1 }
    : (c.id === 'gruul_ragebeast') ? { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid }
    : (c.id === 'gruul_guildmage' || c.id === 'gruul_charm') ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'gruul_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Borborygmos: land-hurling AoE ----
{ const st = game(); const foe = put(st, 1, '_wall'); const life0 = st.players[1].life;
  play(st, 0, 'borborygmos_gruul_king', null);
  ok('Borborygmos deals 3 to enemy creatures and 3 to the opponent', foe.damage === 3 && st.players[1].life === life0 - 3, [foe.damage, life0, st.players[1].life]); }

// ---- Ruric Thar: fights on entry ----
{ const st = game(); const foe = put(st, 1, '_wall'); // 3/4; Ruric is 6/6
  play(st, 0, 'ruric_thar_gruul_champion', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  const rt = st.players[0].board.find(c => c.id === 'ruric_thar_gruul_champion');
  ok('Ruric Thar fights an enemy on entry (kills the 3/4, takes 3)', !st.players[1].board.some(c => c.uid === foe.uid) && rt.damage === 3, [st.players[1].board.length, rt && rt.damage]); }

// ---- ragebeast: a friendly fights an enemy ----
{ const st = game(); const fr = put(st, 0, '_wall'); const foe = put(st, 1, '_wall');
  play(st, 0, 'gruul_ragebeast', { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid });
  ok('Ragebeast makes a friendly fight an enemy (both take damage)', fr.damage === 3 && foe.damage === 3, [fr.damage, foe.damage]); }

// ---- nodorog overkill ----
{ const st = game(); const nd = put(st, 0, 'gruul_nodorog'); const chump = put(st, 1, '_small'); const life0 = st.players[1].life;
  E.attack(st, 0, nd.uid, { type: 'creature', uid: chump.uid, player: 1 }); E.sweepDeaths(st);
  // 6 into a 1/1: 5 tramples over + 3 overkill = 8 to the opponent
  ok('Nodorog Trample+Overkill: 6 into a 1/1 deals 8 to the opponent', st.players[1].life === life0 - 8, [life0, st.players[1].life]); }

// ---- beastmaster: +1/+1 anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'gruul_beastmaster', null);
  ok('Beastmaster gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- guildmage: +2/+2 and Rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'gruul_guildmage', { type: 'creature', uid: v.uid, player: 0 });
  ok('Guildmage gives +2/+2 and Rush', v.attack === a0 + 2 && has(v, 'rush'), [a0, v.attack, v.keywords]); }

// ---- charm modal: burn a creature (mode 1) ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'gruul_charm', { type: 'creature', uid: foe.uid, player: 1 }, 1);
  ok('Charm (burn mode) deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- charm modal: team +1/+0 and Rush (mode 2) ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'gruul_charm', null, 2);
  ok('Charm (rush mode) gives +1/+0 and Rush', v.attack === a0 + 1 && has(v, 'rush'), [a0, v.attack]); }

// ---- war chant quest: summon 5 -> overrun ----
{ const st = game(); play(st, 0, 'gruul_war_chant', null);
  ok('War Chant installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  const pre = put(st, 0, '_v'); const pa0 = pre.attack;
  for (let i = 0; i < 5; i++) play(st, 0, '_small', null);
  ok('War Chant reward: +2/+2 and Trample', pre.attack >= pa0 + 2 && has(pre, 'trample'), [pa0, pre.attack, has(pre, 'trample')]); }

// ---- keyrune: a 3/3 Trample Beast ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'gruul_keyrune', null);
  ok('Keyrune summons a 3/3 Beast with Trample', st.players[0].board.some(c => c.name === 'Beast' && c.attack === 3 && has(c, 'trample')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- signet artifact: tap for mana ----
{ const st = game(); play(st, 0, 'gruul_signet', null); const b0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'gruul_signet').uid, null);
  ok('Signet taps for 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- cluestone enchantment: riot grants Rush to played creatures ----
{ const st = game(); play(st, 0, 'gruul_cluestone', null);
  const { c } = play(st, 0, '_v', null);
  ok('Cluestone gives a freshly played creature Rush', has(c, 'rush'), c.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
