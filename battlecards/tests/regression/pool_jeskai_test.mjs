// pool_jeskai_test.mjs — Jeskai land pool (RUW / Tarkir wedge, 30 cards: Monk tokens + prowess + burn + tempo).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const monks = (st, pi) => st.players[pi].board.filter(c => c.name === 'Monk').length;

const pool = raw.cards.filter(c => c.landSet === 'Jeskai');
// ---- rubric ----
ok('Jeskai pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RUW (order R,U,W)', pool.every(c => JSON.stringify(c.colors) === '["R","U","W"]'));
ok('all uncollectible + landSet Jeskai', pool.every(c => c.collectible === false && c.landSet === 'Jeskai'));

function game() {
  const st = E.createGame(byId, seededRng(86), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['jeskai_firemage', 'jeskai_stormcaller', 'jeskai_wizard', 'jeskai_efreet', 'jeskai_lightning', 'shu_yun_jeskai_khan', 'jeskai_sage_eye_avengers'].includes(c.id);
  const frTgt = c.id === 'jeskai_runemark';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Monastery Mentor: Monk on cast ----
{ const st = game(); play(st, 0, 'jeskai_monastery_mentor', null); const m0 = monks(st, 0);
  cast(st, 0, '_cantrip');
  ok('Monastery Mentor summons a Monk when you cast a spell', monks(st, 0) === m0 + 1, [m0, monks(st, 0)]); }

// ---- Ascendancy enchantment: prowess anthem ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'jeskai_ascendancy', null); const a0 = v.attack;
  cast(st, 0, '_cantrip');
  ok('Ascendancy gives your creatures +1/+1 on cast', v.attack === a0 + 1, [a0, v.attack]); }

// ---- Shu Yun: prowess anthem +1/+0 ----
{ const st = game(); const foe = put(st, 1, '_wall'); const v = put(st, 0, '_v');
  play(st, 0, 'shu_yun_jeskai_khan', { type: 'creature', uid: foe.uid, player: 1 });
  const a0 = v.attack; cast(st, 0, '_cantrip');
  ok('Shu Yun pumps your creatures +1/+0 on cast', v.attack === a0 + 1, [a0, v.attack]); }

// ---- NEW: Monastery Swiftspear prowess (self +1/+0) ----
{ const st = game(); const sw = put(st, 0, 'jeskai_monastery_swiftspear'); const a0 = sw.attack;
  ok('Swiftspear has Charge', has(sw, 'charge'));
  cast(st, 0, '_cantrip');
  ok('Swiftspear gets +1/+0 when you cast a spell', sw.attack === a0 + 1, [a0, sw.attack]); }

// ---- NEW: Soulfire Grand Master lifegain on cast ----
{ const st = game(); put(st, 0, 'jeskai_soulfire_grand_master'); const life0 = st.players[0].life;
  cast(st, 0, '_cantrip');
  ok('Soulfire gains 1 life when you cast a spell', st.players[0].life === life0 + 1, [life0, st.players[0].life]); }

// ---- NEW: Ponyback Brigade tokens ----
{ const st = game(); const m0 = monks(st, 0);
  play(st, 0, 'jeskai_ponyback_brigade', null);
  ok('Ponyback Brigade summons two Elusive Monks', monks(st, 0) === m0 + 2 && st.players[0].board.some(c => c.name === 'Monk' && has(c, 'elusive')), [m0, monks(st, 0)]); }

// ---- NEW: Abbot draw + Charge ----
{ const st = game(); const h0 = st.players[0].hand.length;
  const { c } = play(st, 0, 'jeskai_abbot_of_keral_keep', null);
  ok('Abbot draws a card and has Charge', st.players[0].hand.length === h0 + 1 && has(c, 'charge'), [h0, st.players[0].hand.length]); }

// ---- monument artifact: tap for a Monk ----
{ const st = game(); play(st, 0, 'jeskai_monument', null); const m0 = monks(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'jeskai_monument').uid, null);
  ok('Monument taps for a 2/2 Monk', monks(st, 0) === m0 + 1, [m0, monks(st, 0)]); }

// ---- banner location: tap for mana + scry ----
{ const st = game(); play(st, 0, 'jeskai_banner', null); const loc = st.players[0].board.find(c => c.id === 'jeskai_banner'); const bonus0 = st.players[0].mana.bonus;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Banner taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- lightning instant: burn + scry ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'jeskai_lightning', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Lightning deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- charm sorcery: reach ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'jeskai_charm', null);
  ok('Charm deals 4 to each opponent', st.players[1].life === life0 - 4, [life0, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
