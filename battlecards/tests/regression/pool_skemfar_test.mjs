// pool_skemfar_test.mjs — Skemfar land pool (BG / Kaldheim realm, 30 cards: Elf go-wide + graveyard/sacrifice + deathtouch + counters + ramp + drain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const elves = (st, pi) => st.players[pi].board.filter(c => c.name === 'Elf').length;

const pool = raw.cards.filter(c => c.landSet === 'Skemfar');
// ---- rubric ----
ok('Skemfar pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BG', pool.every(c => JSON.stringify(c.colors) === '["B","G"]'));
ok('all names contain Skemfar + uncollectible', pool.every(c => /skemfar/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(103), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['sarulf_realm_eater', 'skemfar_shadowmancer', 'struggle_for_skemfar'].includes(c.id);
  const frTgt = ['gladewalker_ritualist', 'venom_of_skemfar', 'skemfar_veil'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Harald: two Elves ----
{ const st = game(); const e0 = elves(st, 0);
  play(st, 0, 'harald_king_of_skemfar', null);
  ok('Harald summons two deathtouch Elves', elves(st, 0) === e0 + 2 && st.players[0].board.some(c => c.name === 'Elf' && has(c, 'deathtouch')), [e0, elves(st, 0)]); }

// ---- Lathril: two Elves + gain 2 ----
{ const st = game(); const e0 = elves(st, 0); const life0 = st.players[0].life;
  play(st, 0, 'lathril_skemfar_noble', null);
  ok('Lathril summons two Elves and gains 2', elves(st, 0) === e0 + 2 && st.players[0].life === life0 + 2, [e0, elves(st, 0)]); }

// ---- crown enchantment: go-wide ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'crown_of_skemfar', null); const a0 = v.attack;
  play(st, 0, '_v', null);
  ok('Crown gives +1/+0 when a creature enters', v.attack >= a0 + 1, [a0, v.attack]); }

// ---- monument location: tap for an Elf ----
{ const st = game(); play(st, 0, 'skemfar_monument', null); const loc = st.players[0].board.find(c => c.id === 'skemfar_monument'); const e0 = elves(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps for a deathtouch Elf', elves(st, 0) === e0 + 1, [e0, elves(st, 0)]); }

// ---- bounty artifact: tap ramp + draw ----
{ const st = game(); play(st, 0, 'bounty_of_skemfar', null); const bonus0 = st.players[0].mana.bonus; const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'bounty_of_skemfar').uid, null);
  ok('Bounty taps for +1 bonus mana and a card', st.players[0].mana.bonus === bonus0 + 1 && st.players[0].hand.length === h0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- struggle instant: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'struggle_for_skemfar', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Struggle deals 4 to a creature', foe.damage === 4, foe.damage); }

// ---- serpent tunnel: a 4/4 Snake ----
{ const st = game();
  play(st, 0, 'skemfar_serpent_tunnel', null);
  const snake = st.players[0].board.find(c => c.name === 'Snake');
  ok('Serpent Tunnel summons a 4/4 deathtouch Snake', snake && snake.attack === 4 && has(snake, 'deathtouch'), snake && snake.attack); }

// ---- NEW Poison-Tip Archer: aristocrat burn ----
{ const st = game(); const fodder = put(st, 0, '_v'); put(st, 0, 'skemfar_poison_tip_archer'); const life0 = st.players[1].life;
  kill(st, fodder);
  ok('Poison-Tip Archer deals 1 to each opp when a friendly dies', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- NEW Shaman of the Pack: reach ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'skemfar_shaman_of_the_pack', null);
  ok('Shaman of the Pack deals 3 to each opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
