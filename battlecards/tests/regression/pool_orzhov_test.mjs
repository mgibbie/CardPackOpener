// pool_orzhov_test.mjs — Orzhov land pool (WB lifedrain + aristocrats + extort + removal).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const spirits = (st, pi) => st.players[pi].board.filter(c => c.name === 'Spirit').length;

const pool = raw.cards.filter(c => c.landSet === 'Orzhov');
// ---- rubric ----
ok('Orzhov pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl location/instant/enchantment/artifact', types.size >= 6 && ['location', 'instant', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WB', pool.every(c => (c.colors || []).slice().sort().join('') === 'BW'));

function game() {
  const st = E.createGame(byId, seededRng(47), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.exile = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['kaya_orzhov_usurper', 'orzhov_charm'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'orzhov_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Obzedat: drain 4 ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'obzedat_orzhov_ghost_council', null);
  ok('Obzedat deals 4 to the opponent and gains 4 life', st.players[1].life === foeLife0 - 4 && st.players[0].life === myLife0 + 4, [foeLife0, st.players[1].life, myLife0, st.players[0].life]);
  const ob = st.players[0].board.find(c => c.id === 'obzedat_orzhov_ghost_council');
  ok('Obzedat has Lifesteal + Divine Shield', has(ob, 'lifesteal') && (has(ob, 'divine_shield') || ob.shield)); }

// ---- Kaya: exile a creature ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'kaya_orzhov_usurper', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Kaya exiles a creature', st.players[1].exile.some(c => c.uid === foe.uid) && !st.players[1].board.some(c => c.uid === foe.uid)); }

// ---- Teysa: deaths become Spirits ----
{ const st = game(); put(st, 0, 'teysa_orzhov_scion'); const fodder = put(st, 0, '_v'); const s0 = spirits(st, 0);
  kill(st, fodder);
  ok('Teysa summons a 1/1 Lifesteal Spirit when a friendly dies', spirits(st, 0) === s0 + 1 && st.players[0].board.some(c => c.name === 'Spirit' && has(c, 'lifesteal')), [s0, spirits(st, 0)]); }

// ---- guildmage: drain 2 ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'orzhov_guildmage', null);
  ok('Guildmage drains 2 (opponent -2, you +2)', st.players[1].life === foeLife0 - 2 && st.players[0].life === myLife0 + 2, [foeLife0, st.players[1].life, myLife0, st.players[0].life]); }

// ---- pontiff: sweep 1 ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'orzhov_pontiff', null);
  ok('Pontiff deals 1 to all enemy creatures', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

// ---- racketeers location: tap to drain 2 ----
{ const st = game(); play(st, 0, 'orzhov_racketeers', null); const loc = st.players[0].board.find(c => c.id === 'orzhov_racketeers');
  const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Racketeers taps to drain 2', st.players[1].life === foeLife0 - 2 && st.players[0].life === myLife0 + 2, [foeLife0, st.players[1].life, myLife0, st.players[0].life]); }

// ---- charm modal: drain 2 (mode 1) ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'orzhov_charm', null, 1);
  ok('Charm (drain mode) deals 2 to the opponent and gains 2', st.players[1].life === foeLife0 - 2 && st.players[0].life === myLife0 + 2, [foeLife0, st.players[1].life]); }

// ---- charm modal: kill a small creature (mode 0) ----
{ const st = game(); const foe = put(st, 1, '_wall'); // 3/4, attack 3 <= 3
  play(st, 0, 'orzhov_charm', { type: 'creature', uid: foe.uid, player: 1 }, 0); E.sweepDeaths(st);
  ok('Charm (kill mode) destroys a creature with <=3 Attack', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- gift: drain 3 ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'orzhov_gift', null);
  ok('Gift drains 3', st.players[1].life === foeLife0 - 3 && st.players[0].life === myLife0 + 3, [foeLife0, st.players[1].life]); }

// ---- keyrune extort enchantment: drain on each spell ----
{ const st = game(); play(st, 0, 'orzhov_keyrune', null); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'orzhov_gift', null); // cast a spell (also drains 3 itself)
  ok('Keyrune extort drains 1 per spell (plus the spell)', st.players[1].life <= foeLife0 - 4 && st.players[0].life >= myLife0 + 4, [foeLife0, st.players[1].life, myLife0, st.players[0].life]); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'orzhov_cluestone', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'orzhov_cluestone').uid, null);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
