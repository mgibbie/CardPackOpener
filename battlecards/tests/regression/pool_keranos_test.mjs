// pool_keranos_test.mjs — Keranos land pool (UR devotion: storm burn + card advantage).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Keranos');
// ---- rubric ----
ok('Keranos pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/secret', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'secret'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UR', pool.every(c => (c.colors || []).slice().sort().join('') === 'RU'));

function game() {
  const st = E.createGame(byId, seededRng(65), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const frTgt = c.id === 'power_of_keranos';
  const foeCreat = ['stormcaller_of_keranos', 'bolt_of_keranos'].includes(c.id);
  const foeHero = ['keranos_god_of_storms', 'legend_of_keranos'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeCreat ? { type: 'creature', uid: foe.uid, player: 1 } : foeHero ? { type: 'hero', player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry burn + turn-start storm ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'keranos_god_of_storms', { type: 'hero', player: 1 });
  ok('Keranos battlecry deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]);
  const l1 = st.players[1].life; const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Keranos turn-start deals 2 to the opponent and draws', st.players[1].life === l1 - 2 && st.players[0].hand.length === h0 + 1, [l1, st.players[1].life, h0, st.players[0].hand.length]); }

// ---- legend: burn any target ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'legend_of_keranos', { type: 'hero', player: 1 });
  ok('Legend deals 3 to any target (the opponent)', st.players[1].life === life0 - 3, [life0, st.players[1].life]);
  const lg = st.players[0].board.find(c => c.id === 'legend_of_keranos');
  ok('Legend is an Elusive Windfury flyer', has(lg, 'elusive') && has(lg, 'windfury')); }

// ---- bolt: burn + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'bolt_of_keranos', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Bolt deals 3 to a creature and draws', foe.damage === 3 && st.players[0].hand.length === h0 + 1, [foe.damage, h0, st.players[0].hand.length]); }

// ---- wrath: sweep ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'wrath_of_keranos', null);
  ok('Wrath deals 3 to all enemy creatures', a.damage === 3 && b.damage === 3, [a.damage, b.damage]); }

// ---- divination: draw 2 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'divination_of_keranos', null);
  ok('Divination draws 2 cards', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- dictate enchantment: spell -> burn ----
{ const st = game(); play(st, 0, 'dictate_of_keranos', null); const life0 = st.players[1].life;
  play(st, 0, 'hymn_of_keranos', null); // a spell that also deals 3
  ok('Dictate deals 1 extra per spell (hymn 3 + dictate 1 = 4)', st.players[1].life === life0 - 4, [life0, st.players[1].life]); }

// ---- edict artifact: tap to burn a creature ----
{ const st = game(); const foe = put(st, 1, '_wall'); play(st, 0, 'edict_of_keranos', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'edict_of_keranos').uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Edict taps to deal 2 to a creature', foe.damage === 2, foe.damage); }

// ---- knowledge secret: counter + draw ----
{ const st = game(); play(st, 0, 'knowledge_of_keranos', null);
  ok('Knowledge installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const life0 = st.players[0].life; const h0 = st.players[0].hand.length;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Knowledge counters the enemy spell and draws', st.players[0].life === life0 && st.players[0].hand.length === h0 + 1, [life0, st.players[0].life, h0, st.players[0].hand.length]); }

// ---- power: +2/+2 and Windfury ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'power_of_keranos', { type: 'creature', uid: v.uid, player: 0 });
  ok('Power gives +2/+2 and Windfury', v.attack === a0 + 2 && has(v, 'windfury'), [a0, v.attack, v.keywords]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
