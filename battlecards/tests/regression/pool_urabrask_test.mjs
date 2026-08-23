// pool_urabrask_test.mjs — Urabrask boss pool (R haste-aggro Phyrexian praetor: Charge everywhere + burn + overkill).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._plain = { id: '_plain', name: 'P', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._small = { id: '_small', name: 'S', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.loreDeck === 'Urabrask');
// ---- rubric ----
ok('Urabrask pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl location/enchantment/instant/weapon', types.size >= 6 && ['location', 'enchantment', 'instant', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords incl charge (haste)', kws.size >= 6 && kws.has('charge'), [...kws]);
ok('stays mono-Red', pool.every(c => (c.colors || []).join('') === 'R'));
ok('the boss (sig) is a Phyrexian creature that grants Charge to your creatures', byId.urabrask_sig.type === 'creature' && byId.urabrask_sig.aura && (byId.urabrask_sig.aura.keywords || []).includes('charge'));

function game() {
  const st = E.createGame(byId, seededRng(29), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_plain', '_plain', '_plain', '_plain', '_plain', '_plain']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const phyrex = (st, pi) => st.players[pi].board.filter(c => c.name === 'Phyrexian');

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_plain'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['urabrask_zealot', 'urabrask_firebrand', 'urabrask_demolition', 'urabrask_command'].includes(c.id);
  const frTgt = c.id === 'urabrask_anointer';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'urabrask_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- sig: your creatures get Charge (a sick ally can attack) ----
{ const st = game(); const ally = put(st, 0, '_plain', true); // summoning-sick
  ok('without Urabrask a sick creature cannot attack', !E.canAttackWith(st, 0, ally));
  put(st, 0, 'urabrask_sig'); E.recomputeAuras(st);
  ok('Urabrask grants Charge — the sick creature can now attack', E.canAttackWith(st, 0, ally) && has(ally, 'charge'), [has(ally, 'charge'), E.canAttackWith(st, 0, ally)]); }

// ---- sig battlecry: two 3/1 hasty Phyrexians ----
{ const st = game(); const t0 = phyrex(st, 0).length;
  play(st, 0, 'urabrask_sig', null);
  const toks = phyrex(st, 0);
  ok('Urabrask boss summons two 3/1 Phyrexians with Charge', toks.length === t0 + 2 && toks.every(c => c.attack === 3 && has(c, 'charge')), toks.map(c => c.attack + '/' + E.hp(c))); }

// ---- aggression enchantment: played creatures gain Charge ----
{ const st = game(); play(st, 0, 'urabrask_aggression', null);
  const { c } = play(st, 0, '_plain', null);
  ok('Aggression gives a freshly played creature Charge', has(c, 'charge'), c.keywords); }

// ---- rebel leader: +1/+0 anthem ----
{ const st = game(); put(st, 0, 'urabrask_rebel_leader'); const v = put(st, 0, '_plain'); E.recomputeAuras(st);
  ok('Rebel Leader gives your other creatures +1/+0', v.attack === 3 && E.hp(v) === 2, [v.attack, E.hp(v)]); }

// ---- forge location: tap for a 2/1 hasty Phyrexian ----
{ const st = game(); play(st, 0, 'urabrask_forge', null);
  const loc = st.players[0].board.find(c => c.id === 'urabrask_forge'); const t0 = phyrex(st, 0).length;
  E.tapLand(st, 0, loc.uid, 0);
  const toks = phyrex(st, 0);
  ok('Forge taps for a 2/1 Phyrexian with Charge', toks.length === t0 + 1 && toks.some(c => c.attack === 2 && E.hp(c) === 1 && has(c, 'charge')), toks.map(c => c.attack + '/' + E.hp(c))); }

// ---- molten charge weapon: sweeps enemy creatures when you swing ----
{ const st = game(); const e1 = put(st, 1, '_plain'); const e2 = put(st, 1, '_wall');
  play(st, 0, 'urabrask_molten_charge', null);
  ok('Molten Charge equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Molten Charge deals 1 to all enemy creatures after the hero attacks', e1.damage === 1 && e2.damage === 1, [e1.damage, e2.damage]); }

// ---- tormentor overkill + trample: excess damage burns the opponent ----
{ const st = game(); const torm = put(st, 0, 'urabrask_tormentor'); const chump = put(st, 1, '_small'); const life0 = st.players[1].life;
  E.attack(st, 0, torm.uid, { type: 'creature', uid: chump.uid, player: 1 }); E.sweepDeaths(st);
  // 5 Attack into a 1/1: 4 tramples over, plus Overkill fires 2 more -> 6 to the opponent
  ok('Tormentor Trample+Overkill: killing a 1/1 with 5 Attack deals 6 to the opponent', st.players[1].life === life0 - 6, [life0, st.players[1].life]); }

// ---- command modal: summon two hasty Phyrexians (mode 2) ----
{ const st = game(); const t0 = phyrex(st, 0).length;
  play(st, 0, 'urabrask_command', null, 2);
  ok('Command (summon mode) makes two 2/2 Phyrexians with Charge', phyrex(st, 0).length === t0 + 2 && phyrex(st, 0).every(c => has(c, 'charge')), phyrex(st, 0).length); }

// ---- command modal: team +2/+0 and Charge (mode 1) ----
{ const st = game(); const v = put(st, 0, '_plain', true); const a0 = v.attack;
  play(st, 0, 'urabrask_command', null, 1);
  ok('Command (anthem mode) gives +2/+0 and Charge', v.attack === a0 + 2 && has(v, 'charge') && E.canAttackWith(st, 0, v), [a0, v.attack, has(v, 'charge')]); }

// ---- anointer: buff a friendly + Charge ----
{ const st = game(); const v = put(st, 0, '_plain', true); const a0 = v.attack;
  play(st, 0, 'urabrask_anointer', { type: 'creature', uid: v.uid, player: 0 });
  ok('Anointer gives a friendly creature +2/+0 and Charge', v.attack === a0 + 2 && has(v, 'charge'), [a0, v.attack, has(v, 'charge')]); }

// ---- demolition instant: 4 damage kills a blocker ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'urabrask_demolition', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Demolition deals 4 to a creature (kills the 3/4 wall)', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
