// pool_zhulodok_test.mjs — Zhulodok boss pool (colorless Eldrazi spellslinger: cast-matters + cascade + Scions).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
byId._cast5 = { id: '_cast5', name: 'F', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 5, target: 'enemy-heroes' }] };
byId._bolt3 = { id: '_bolt3', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
byId._spell = { id: '_spell', name: 'S', type: 'sorcery', cost: 4, rarity: 'common', description: 'x', effects: [{ type: 'draw', value: 1 }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const scions = (st, pi) => st.players[pi].board.filter(c => c.name === 'Eldrazi Scion').length;

const pool = raw.cards.filter(c => c.loreDeck === 'Zhulodok');
// ---- rubric ----
ok('Zhulodok pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/enchantment/instant/secret', types.size >= 6 && ['artifact', 'enchantment', 'instant', 'secret'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays colorless', pool.every(c => Array.isArray(c.colors) && c.colors.length === 0));
ok('the boss (sig) triggers on casting spells', byId.zhulodok_sig.type === 'creature' && byId.zhulodok_sig.ongoing && byId.zhulodok_sig.ongoing.on === 'spell-played');

function game(deck = ['_cast5', '_cast5', '_cast5', '_cast5', '_cast5', '_cast5']) {
  const st = E.createGame(byId, seededRng(34), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = [...deck]; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.exile = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const foeTgt = ['zhulodok_disenchanter', 'zhulodok_void_rend'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, (c.id === 'zhulodok_charm' || c.id === 'zhulodok_command') ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- sig: casting a spell makes an Eldrazi Scion ----
{ const st = game(); put(st, 0, 'zhulodok_sig'); const s0 = scions(st, 0);
  cast(st, 0, '_cantrip');
  ok('Sig: casting a spell summons an Eldrazi Scion', scions(st, 0) === s0 + 1, [s0, scions(st, 0)]); }

// ---- sig: spells cost 1 less ----
{ const st = game(); const base = E.effectiveCost(st, 0, E.instantiate(byId._spell, 0));
  put(st, 0, 'zhulodok_sig');
  const cut = E.effectiveCost(st, 0, E.instantiate(byId._spell, 0));
  ok('Sig reduces your spell costs by 1', cut === base - 1, [base, cut]); }

// ---- sig battlecry: cascade casts a spell from the deck ----
{ const st = game(['_cast5', '_cast5']); const life0 = st.players[1].life;
  play(st, 0, 'zhulodok_sig', null);
  ok('Sig battlecry cascades a spell from the deck (opponent takes 5)', st.players[1].life === life0 - 5, [life0, st.players[1].life]); }

// ---- mimic: prowess ----
{ const st = game(); const m = put(st, 0, 'zhulodok_mimic'); const a0 = m.attack;
  cast(st, 0, '_cantrip');
  ok('Mimic gains +1/+1 when you cast a spell', m.attack === a0 + 1 && E.hp(m) === 2, [a0, m.attack, E.hp(m)]); }

// ---- futurist: draw after every two spells ----
{ const st = game(['_v', '_v']); put(st, 0, 'zhulodok_futurist'); const h0 = st.players[0].hand.length;
  cast(st, 0, '_cantrip'); const mid = st.players[0].hand.length;
  cast(st, 0, '_cantrip');
  ok('Futurist draws after the 2nd spell (not the 1st)', mid === h0 && st.players[0].hand.length === h0 + 1, [h0, mid, st.players[0].hand.length]); }

// ---- monument enchantment: cast -> Scion ----
{ const st = game(); play(st, 0, 'zhulodok_monument', null); const s0 = scions(st, 0);
  cast(st, 0, '_cantrip');
  ok('Monument summons a Scion when you cast a spell', scions(st, 0) === s0 + 1, [s0, scions(st, 0)]); }

// ---- planar portal artifact: tap to cascade ----
{ const st = game(['_cast5', '_cast5']); const port = E.instantiate(byId.zhulodok_planar_portal, 0); port.zone = 'artifact'; port.tapped = false; st.players[0].artifacts.push(port);
  const life0 = st.players[1].life;
  E.tapArtifact(st, 0, port.uid, null);
  ok('Planar Portal taps to cast a spell from your deck (opponent takes 5)', st.players[1].life === life0 - 5, [life0, st.players[1].life]); }

// ---- devastator battlecry: cascade ----
{ const st = game(['_cast5']); const life0 = st.players[1].life;
  play(st, 0, 'zhulodok_devastator', null);
  ok('Devastator battlecry cascades a spell (opponent takes 5)', st.players[1].life === life0 - 5, [life0, st.players[1].life]); }

// ---- cataclysm: wrath + cascade ----
{ const st = game(['_cast5']); const a = put(st, 1, '_v'); const b = put(st, 1, '_v'); const life0 = st.players[1].life;
  play(st, 0, 'zhulodok_cataclysm', null); E.sweepDeaths(st);
  ok('Cataclysm deals 4 to all enemy creatures (kills the 3/3s)', !st.players[1].board.some(c => c.uid === a.uid || c.uid === b.uid), st.players[1].board.length);
  ok('Cataclysm then cascades a spell (opponent takes 5)', st.players[1].life === life0 - 5, [life0, st.players[1].life]); }

// ---- charm modal: two Scions (mode 2) ----
{ const st = game(); const s0 = scions(st, 0);
  play(st, 0, 'zhulodok_charm', null, 2);
  ok('Charm (Scion mode) summons two Eldrazi Scions', scions(st, 0) === s0 + 2, [s0, scions(st, 0)]); }

// ---- command modal: 5/5 body (mode 2) ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'zhulodok_command', null, 2);
  ok('Command (body mode) makes a 5/5 Eldrazi with Trample', st.players[0].board.some(c => c.name === 'Eldrazi' && c.attack === 5 && (c.keywords || []).includes('trample')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name + c.attack)); }

// ---- void rend: destroy ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'zhulodok_void_rend', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Void Rend destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- voidmaze secret: counter enemy spell + cascade ----
{ const st = game(['_cast5', '_cast5']); play(st, 0, 'zhulodok_voidmaze', null);
  ok('Voidmaze installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const myLife0 = st.players[0].life; const foeLife0 = st.players[1].life;
  castAs(st, 1, '_bolt3', { type: 'hero', player: 0 }); // opponent bolts me for 3
  ok('Voidmaze counters the enemy spell (I take no damage)', st.players[0].life === myLife0, [myLife0, st.players[0].life]);
  ok('Voidmaze then casts a spell from my deck (opponent takes 5)', st.players[1].life === foeLife0 - 5, [foeLife0, st.players[1].life]); }

// ---- disenchanter: silence ----
{ const st = game(); const foe = put(st, 1, 'zhulodok_devastator');
  play(st, 0, 'zhulodok_disenchanter', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Disenchanter silences a creature', (foe.keywords || []).length === 0, foe.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
