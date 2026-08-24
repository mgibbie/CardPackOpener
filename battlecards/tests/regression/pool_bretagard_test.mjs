// pool_bretagard_test.mjs — Bretagard land pool (GW / Kaldheim realm, 30 cards: Human go-wide + counters/anthems + lifegain + ramp).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const humans = (st, pi) => st.players[pi].board.filter(c => c.name === 'Human').length;

const pool = raw.cards.filter(c => c.landSet === 'Bretagard');
// ---- rubric ----
ok('Bretagard pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GW', pool.every(c => JSON.stringify(c.colors) === '["G","W"]'));
ok('all names contain Bretagard + uncollectible', pool.every(c => /bretagard/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(97), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); let threw = null;
  const frTgt = ['boreal_outrider', 'bretagard_champion', 'bretagard_wanderer', 'bretagard_guardian_gladewalker'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Maja: two Humans + anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = humans(st, 0);
  play(st, 0, 'maja_bretagard_protector', null);
  ok('Maja summons two Humans and gives +1/+1', humans(st, 0) === h0 + 2 && v.attack === a0 + 1, [h0, humans(st, 0), a0, v.attack]); }

// ---- lawspeaker: team +2/+2 ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'bretagard_lawspeaker', null);
  ok('Lawspeaker gives your creatures +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- bear spirit enchantment: lifegain -> counters ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'bretagard_bear_spirit', null); const a0 = v.attack;
  play(st, 0, 'bretagard_healer', null); // gain 3 -> bolster
  ok('Bear Spirit bolsters when you gain life', v.attack === a0 + 1, [a0, v.attack]); }

// ---- charm artifact: +1/+1 counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'bretagard_charm', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'bretagard_charm').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm taps to put a +1/+1 counter', v.attack === a0 + 1, [a0, v.attack]); }

// ---- monument location: tap for a Human ----
{ const st = game(); play(st, 0, 'bretagard_monument', null); const loc = st.players[0].board.find(c => c.id === 'bretagard_monument'); const h0 = humans(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps for a 2/2 Human', humans(st, 0) === h0 + 1, [h0, humans(st, 0)]); }

// ---- rally instant: team +2/+2 ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'rally_the_bretagard', null);
  ok('Rally gives your creatures +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- druid: ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'bretagard_druid', null);
  ok('Druid gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- NEW Sigrid: shielded first-striker ----
{ const st = game(); const { c } = play(st, 0, 'bretagard_sigrid_god_favored', null);
  ok('Sigrid has Divine Shield + First Strike', has(c, 'divine_shield') && has(c, 'first_strike') && c.shield === true, c.keywords); }

// ---- NEW Guardian Gladewalker: counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'bretagard_guardian_gladewalker', { type: 'creature', uid: v.uid, player: 0 });
  ok('Guardian Gladewalker gives +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- NEW Reidane: taunt wall ----
{ const st = game(); const { c } = play(st, 0, 'bretagard_reidane', null);
  ok('Reidane is a Taunt + Divine Shield wall', has(c, 'taunt') && has(c, 'divine_shield'), c.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
