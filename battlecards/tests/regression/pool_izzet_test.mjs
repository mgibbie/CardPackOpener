// pool_izzet_test.mjs — Izzet land pool (UR spells-matter/prowess + burn + card draw + Niv draw->ping).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Izzet');
// ---- rubric ----
ok('Izzet pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/secret/enchantment/artifact', types.size >= 6 && ['instant', 'secret', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UR', pool.every(c => (c.colors || []).slice().sort().join('') === 'RU'));

function game() {
  const st = E.createGame(byId, seededRng(48), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const spell = (st, pi) => play(st, pi, 'izzet_keyrune', null); // a spell to fuel prowess
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const foeTgt = ['ral_izzet_viceroy', 'izzet_guildmage', 'izzet_electroblast', 'izzet_charm'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'izzet_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Niv-Mizzet: draw -> ping ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'niv_mizzet_supreme_izzet_firemind', null); // battlecry draws 1 -> ping 1
  ok('Niv-Mizzet pings the opponent when you draw (battlecry draw)', st.players[1].life === life0 - 1, [life0, st.players[1].life]);
  E.execEffects(st, 0, [{ type: 'draw', value: 1 }], null, null);
  ok('Niv-Mizzet pings again on the next draw', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

// ---- Ral: burn + draw ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'ral_izzet_viceroy', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Ral deals 3 to a creature and draws', foe.damage === 3 && st.players[0].hand.length === h0 + 1, [foe.damage, h0, st.players[0].hand.length]); }

// ---- Melek: prowess +2/+0 ----
{ const st = game(); const m = put(st, 0, 'melek_izzet_paragon'); const a0 = m.attack;
  spell(st, 0);
  ok('Melek gains +2/+0 when you cast a spell', m.attack === a0 + 2, [a0, m.attack]); }

// ---- chronarch: prowess +1/+1 ----
{ const st = game(); const ch = put(st, 0, 'izzet_chronarch'); const a0 = ch.attack;
  spell(st, 0);
  ok('Chronarch gains +1/+1 when you cast a spell', ch.attack === a0 + 1, [a0, ch.attack]); }

// ---- chemister: prowess +1/+1 ----
{ const st = game(); const cm = put(st, 0, 'izzet_chemister'); const a0 = cm.attack;
  spell(st, 0);
  ok('Chemister gains +1/+1 when you cast a spell', cm.attack === a0 + 1, [a0, cm.attack]); }

// ---- staticaster: sweep 1 ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'izzet_staticaster', null);
  ok('Staticaster deals 1 to all enemy creatures', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

// ---- charm modal: burn + draw (mode 0) ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'izzet_charm', { type: 'creature', uid: foe.uid, player: 1 }, 0);
  ok('Charm (bolt mode) deals 2 to a creature and draws', foe.damage === 2 && st.players[0].hand.length === h0 + 1, [foe.damage, h0, st.players[0].hand.length]); }

// ---- charm modal: face burn (mode 1) ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'izzet_charm', null, 1);
  ok('Charm (face mode) deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- electroblast: 3 damage ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'izzet_electroblast', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Electroblast deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- command secret: counter + burn ----
{ const st = game(); play(st, 0, 'izzet_command', null);
  ok('Command installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const myLife0 = st.players[0].life; const foeLife0 = st.players[1].life;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Command counters the enemy spell (no damage)', st.players[0].life === myLife0, [myLife0, st.players[0].life]);
  ok('Command deals 2 to the opponent', st.players[1].life === foeLife0 - 2, [foeLife0, st.players[1].life]); }

// ---- keyrune: a 3/2 Elusive Elemental ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'izzet_keyrune', null);
  ok('Keyrune summons a 3/2 Elusive Elemental', st.players[0].board.some(c => c.name === 'Elemental' && c.attack === 3 && has(c, 'elusive')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- locket enchantment: draw after two spells ----
{ const st = game(); play(st, 0, 'izzet_locket', null);
  const boardCount = () => st.players[0].board.length;
  spell(st, 0); const afterOne = st.players[0].hand.length;
  const h1 = st.players[0].hand.length; spell(st, 0);
  ok('Locket draws a card after your 2nd spell', st.players[0].hand.length === h1 + 1, [h1, st.players[0].hand.length]); }

// ---- signet artifact: tap for mana ----
{ const st = game(); play(st, 0, 'izzet_signet', null); const b0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'izzet_signet').uid, null);
  ok('Signet taps for 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'izzet_cluestone', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'izzet_cluestone').uid, null);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
