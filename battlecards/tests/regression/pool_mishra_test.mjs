// pool_mishra_test.mjs — Mishra boss pool (colorless artifact war machines: artifact-matters -> Constructs/burn/anthem + aggro).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._small = { id: '_small', name: 'S', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 6, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const cons = (st, pi) => st.players[pi].board.filter(c => c.name === 'Construct').length;

const pool = raw.cards.filter(c => c.loreDeck === 'Mishra');
// ---- rubric ----
ok('Mishra pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location/instant/enchantment', types.size >= 6 && ['artifact', 'location', 'instant', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays colorless', pool.every(c => Array.isArray(c.colors) && c.colors.length === 0));
ok('the boss (sig) rewards playing artifacts', byId.mishra_sig.type === 'creature' && byId.mishra_sig.ongoing && byId.mishra_sig.ongoing.on === 'artifact-played');
ok('>=3 artifact-type cards', pool.filter(c => c.type === 'artifact').length >= 3);

function game() {
  const st = E.createGame(byId, seededRng(37), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const playArt = (st, pi) => play(st, pi, 'mishra_bauble', null); // a 0-cost artifact to trigger artifact-played

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_big'); let threw = null;
  const foeTgt = ['mishra_helix', 'mishra_domination', 'mishra_command'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'mishra_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- sig: battlecry Construct + artifact-played Construct ----
{ const st = game(); const c0 = cons(st, 0);
  play(st, 0, 'mishra_sig', null);
  ok('Mishra battlecry summons a 4/4 Construct with Rush', st.players[0].board.some(c => c.name === 'Construct' && c.attack === 4 && (c.keywords || []).includes('rush')), st.players[0].board.map(c => c.name + c.attack));
  const c1 = cons(st, 0);
  playArt(st, 0);
  ok('Mishra: playing an artifact summons a 2/2 Construct', cons(st, 0) === c1 + 1, [c1, cons(st, 0)]); }

// ---- self replicator: grows on each artifact ----
{ const st = game(); const r = put(st, 0, 'mishra_self_replicator'); const a0 = r.attack;
  playArt(st, 0);
  ok('Self-Replicator gains +1/+1 when you play an artifact', r.attack === a0 + 1, [a0, r.attack]); }

// ---- foundry: burns on each artifact ----
{ const st = game(); put(st, 0, 'mishra_foundry'); const life0 = st.players[1].life;
  playArt(st, 0);
  ok('Foundry deals 1 to the opponent when you play an artifact', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- onslaught enchantment: anthem on each artifact ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'mishra_onslaught', null); const a0 = v.attack;
  playArt(st, 0);
  ok('Onslaught gives your creatures +1/+0 when you play an artifact', v.attack === a0 + 1, [a0, v.attack]); }

// ---- bauble artifact: tap to draw ----
{ const st = game(); const { c } = play(st, 0, 'mishra_bauble', null); const h0 = st.players[0].hand.length;
  ok('Bauble is an artifact in play', st.players[0].artifacts.some(a => a.id === 'mishra_bauble'));
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'mishra_bauble').uid, null);
  ok('Bauble taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- workshop artifact: tap for a Construct ----
{ const st = game(); play(st, 0, 'mishra_workshop', null); const c0 = cons(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'mishra_workshop').uid, null);
  ok('Workshop taps for a 1/1 Construct', cons(st, 0) === c0 + 1, [c0, cons(st, 0)]); }

// ---- factory location: tap for a Construct ----
{ const st = game(); play(st, 0, 'mishra_factory', null); const loc = st.players[0].board.find(c => c.id === 'mishra_factory'); const c0 = cons(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Factory taps for a 2/2 Construct', cons(st, 0) === c0 + 1 && st.players[0].board.some(c => c.name === 'Construct' && c.attack === 2), [c0, cons(st, 0)]); }

// ---- assembler: two Constructs ----
{ const st = game(); const c0 = cons(st, 0);
  play(st, 0, 'mishra_assembler', null);
  ok('Assembler summons two 2/2 Constructs', cons(st, 0) === c0 + 2, [c0, cons(st, 0)]); }

// ---- groundbreaker overkill ----
{ const st = game(); const gb = put(st, 0, 'mishra_groundbreaker'); const chump = put(st, 1, '_small'); const life0 = st.players[1].life;
  E.attack(st, 0, gb.uid, { type: 'creature', uid: chump.uid, player: 1 }); E.sweepDeaths(st);
  ok('Groundbreaker Overkill: 4 into a 1/1 deals 2 to the opponent', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

// ---- juggernaut: Charge lets it attack at once ----
{ const st = game(); const jug = put(st, 0, 'mishra_juggernaut', true); // summoning sick, but Charge
  ok('Juggernaut has Charge and can attack immediately', E.canAttackWith(st, 0, jug)); }

// ---- helix: 4 damage removal ----
{ const st = game(); const foe = put(st, 1, '_big');
  play(st, 0, 'mishra_helix', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Helix deals 4 to a creature', foe.damage === 4, foe.damage); }

// ---- domination: mind-control ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'mishra_domination', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Domination steals an enemy creature (<=4 Attack)', st.players[0].board.some(c => c.uid === foe.uid) && !st.players[1].board.some(c => c.uid === foe.uid)); }

// ---- command modal: two 3/3 Constructs (mode 1) ----
{ const st = game(); const c0 = cons(st, 0);
  play(st, 0, 'mishra_command', null, 1);
  ok('Command (assemble mode) summons two 3/3 Constructs', cons(st, 0) === c0 + 2 && st.players[0].board.some(c => c.name === 'Construct' && c.attack === 3), [c0, cons(st, 0)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
