// The owner's Shellos line (2026-10-28; jokers/pokejokers_designs.js "LINE F9"; PORTING.md "The owner's Shellos line"):
//   Shellos 422 (Basic, Water, Common $5)     Its SEA, West or East, is rolled once when the card is created (the run's seeded RNG),
//                                             kept on the card (save / resume, evolution). Tide Pool: West, the LEFTMOST scored card
//                                             gives +40 Chips; East, the RIGHTMOST. Evolves after 5 rounds, keeping its sea.
//   Gastrodon 423 (Stage 1, Water, Safari $8) Tide: its sea's end card retriggers once and gives +40 Chips each time it scores (+80
//                                             with the retrigger). Storm Drain: each Energy card used (on any joker) banks X0.1 Mult,
//                                             X0.2 for Water Energy.
//   Two Seas: a West AND an East Shellos / Gastrodon held (any mix, undebuffed) -> every one works on BOTH end cards (a 1-card hand's
//   card is both ends: once). Art: each sea its own 3.9.1 card (Gen 4 sheet: Shellos East {4,1} / West {6,1}, Gastrodon East {8,1}
//   / West {10,1}, Shiny twins). Energy: chips +30%, Storm Drain's gain +20% of base; the retrigger fixed; carried through evolution.
// Every ability is FIRED through real hands with exact numbers.
//   node micatro/tests/mods/pokermon_shellos_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, play, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_card, copy_card } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import * as ANIM from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
const plain = (j) => lines(j).replace(/\{[^}]*\}/g, '');
const LINE = ['shellos', 'gastrodon'];
const SPRITES = ANIM.SEA_SPRITES || {};
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
function undebuff(j) { j.ability.debuff_sources = {}; j.set_debuff(); return j; }
/** A joker with this sea (the roll overridden, as a test fixture). */
function sea(k, form, edition) { const j = add('j_poke_' + k, edition); ex(j).form = form; return j; }
/** Play exactly these cards (in hand order: the first is the leftmost); -> the hand total. */
const play2 = (keys) => { clearHand(); return play(hand(keys)).total; };
// A Flush of Hearts, leftmost the 2, rightmost the 3: Flush 35 Chips x 4; the cards 2 + 5 + 9 + 10 + 3 = 29.
const FLUSH = ['H_2', 'H_5', 'H_9', 'H_K', 'H_3'];
const FLUSH_CHIPS = 35 + 29;
/** Use a consumable by key (it sits in the consumable slots first), on the highlighted joker if one is given. */
function use(k, target) {
  const c = add(k);
  G.jokers.highlighted.length = 0;
  if (target) G.jokers.highlighted.push(target);
  const r = act({ type: 'use', id: c.sort_id, targets: [] });
  flush();
  G.jokers.highlighted.length = 0;
  return r;
}
/** Win the round in progress with a High Card 2 (landing in ROUND_EVAL), then cash out, next round, select the blind. */
function endRound() { clearHand(); G.GAME.chips = G.GAME.blind.chips; play(hand(['S_2']), { keepChips: true }); flush(); }
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** What the card is drawn as (POKE_UI.face over its view; null = its own center cell). */
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
/** The cell a card is drawn from: [atlas, pos]. */
const drawn = (j, shiny) => { const f = face(j, shiny); return f ? [f.atlas, f.pos] : [j.config.center.atlas, j.config.center.pos]; };

// ------------------------------------------------------------------- pin, static data, order, pool, family, precedence
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 34 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 34+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of LINE) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /shellos|gastrodon/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Shellos / Gastrodon (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('SHELLOS0');
  const [s, g] = LINE.map((n) => P_CENTERS['j_poke_' + n]);
  ok(s && s.rarity === 1 && s.cost === 5 && s.stage === 'Basic' && s.ptype === 'Water' && s.gen === 4 && s.config.extra.chips === 40 && s.config.extra.rounds === 5,
    'Shellos: Common $5, Basic, Water, Gen 4, +40 Chips, 5 rounds', s && [s.rarity, s.cost, s.stage, s.ptype, s.config.extra]);
  ok(g && g.rarity === 'poke_safari' && g.cost === 8 && g.stage === 'One' && g.ptype === 'Water' && g.config.extra.chips === 40 && g.config.extra.retriggers === 1
    && g.config.extra.Xmult_mod === 0.1 && g.config.extra.drain_Xmult === 1 && !('rounds' in g.config.extra),
    'Gastrodon: Safari $8, Stage 1, Water, +40 Chips, 1 retrigger, X0.1 per Energy (bank X1), no evolution', g && [g.rarity, g.cost, g.stage, g.ptype, g.config.extra]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_shellos');
  ok(i > 0 && keys[i + 1] === 'j_poke_gastrodon' && keys[i + 2] === 'j_poke_ambipom' && /^j_poke_(floatzel|cherrim)$/.test(keys[i - 1]),
    'Pokédex order: Floatzel (419) or Cherrim (421), Shellos, Gastrodon, Ambipom (424)', keys.slice(i - 1, i + 3));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  ok(fam('shellos') === 'shellos,gastrodon' && fam('gastrodon') === fam('shellos'), 'one family: Shellos, Gastrodon', fam('shellos'));
  ok(s && s.atlas === 'poke_AtlasJokersBasicGen04391' && s.pos.x === 4 && s.pos.y === 1 && g.atlas === s.atlas && g.pos.x === 8 && g.pos.y === 1,
    'art: upstream 3.9.1\'s first cells (Gen 4 {4,1} / {8,1}: the East Sea, each center\'s own card)', s && [s.atlas, s.pos, g.pos]);
  ok(s && pool_filter(s, 'Joker') === undefined && s.in_pool(s) !== false, 'Shellos can be rolled in the shop (Common)');
  ok(['chips', 'Xmult_mod'].every((f) => f in energy_values) && !['retriggers', 'drain_Xmult', 'rounds'].some((f) => f in energy_values),
    'Energy fields: chips / Xmult_mod (the retrigger, the bank and the timer are not)');
});

// ------------------------------------------------------------------- the sea: rolled once, seeded, kept, resumed
await sec('sea roll', () => {
  for (const n of LINE) {
    const roll = (seed) => { start(seed); return ex(add('j_poke_' + n)).form; };
    const seen = {};
    for (let i = 0; i < 24; i++) { const x = roll('SEA' + n + i); seen[x] = (seen[x] || 0) + 1; ok(roll('SEA' + n + i) === x, `${n} SEA${i}: the same seed rolls the same sea (${x})`); }
    ok(Object.keys(seen).sort().join() === 'east,west', n + ': both seas occur over 24 seeds', seen);
  }
  start('SEAC');
  const c = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_shellos');
  ok(['west', 'east'].includes(ex(c).form), 'create_card (a shop / pack card) rolls it', ex(c).form);
  for (const f of ['west', 'east']) {
    ex(c).form = f;
    ok(ex(copy_card(c)).form === f, `a copy (Invisible Joker / Ankh: copy_card) keeps the ${f} sea`);
  }
  start('SEAK');
  const s = add('j_poke_shellos'); const was = ex(s).form;
  for (let r = 0; r < 3; r++) { endRound(); advance(); }
  ok(ex(s).form === was && key(s) === 'j_poke_shellos', 'kept through rounds (never re-rolled)', [was, ex(s).form]);
  ok(new RegExp((was === 'west' ? 'West' : 'East') + ' Sea: rolled once').test(plain(s)), 'the tooltip names it', plain(s));
});
await sec('resume', () => {
  const both = {};
  for (let i = 0; i < 12 && Object.keys(both).length < 2; i++) {
    const s = new Session();
    s.start({ seed: 'SHRES' + i, customDeck: { name: 'Sea Slug', mods: ['pokermon'], jokers: [{ key: 'j_poke_shellos' }] } });
    s.act({ type: 'select_blind' }); flush();
    const j = G.jokers.cards.find((c) => key(c) === 'j_poke_shellos');
    const want = ex(j).form;
    const art = JSON.stringify(drawn(j));
    s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
    const j2 = G.jokers.cards.find((c) => key(c) === 'j_poke_shellos');
    ok(!r.stoppedAt && j2 && ex(j2).form === want && JSON.stringify(drawn(j2)) === art, `resume (SHRES${i}): the ${want} Shellos comes back ${want}, same art`, [want, j2 && ex(j2).form]);
    both[want] = true;
  }
  ok(both.west && both.east, 'resumed runs of both seas', both);
});

// ------------------------------------------------------------------- art: each sea its own cell (+ Shiny)
await sec('art', () => {
  start('SHART');
  const WANT = { j_poke_shellos: { east: 4, west: 6 }, j_poke_gastrodon: { east: 8, west: 10 } };
  for (const [k, cells] of Object.entries(WANT)) {
    for (const [f, x] of Object.entries(cells)) {
      const j = sea(k.slice(7), f);
      for (const sh of [false, true]) {
        const [atlas, pos] = drawn(j, sh);
        const atl = 'poke_AtlasJokersBasicGen04' + (sh ? 'Shiny' : '') + '391';
        ok(atlas === atl && pos.x === x && pos.y === 1, `${k} ${f}${sh ? ' (Shiny)' : ''}: drawn from ${atl} {${x},1}`, [atlas, pos]);
      }
      ok(f === 'east' ? face(j) === null : !!face(j), `${k} ${f}: ${f === 'east' ? 'its own card' : 'the West card'}`);
    }
  }
});

// ------------------------------------------------------------------- Tide Pool (Shellos): West leftmost, East rightmost
await sec('tide pool', () => {
  start('SHTP1');
  sea('shellos', 'west');
  let t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 40 && near(t.mult, 4), 'West: the leftmost scored card (the 2) +40 Chips (64 + 40)', t);
  start('SHTP2');
  sea('shellos', 'east');
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 40, 'East: the rightmost scored card (the 3) +40 Chips', t);
  // which card: a Pair inside unscored cards — the ends are of the SCORING hand
  start('SHTP3');
  const s = sea('shellos', 'west');
  clearHand();
  const cards = hand(['S_2', 'H_K', 'D_K', 'C_7']);
  const r = play(cards);
  ok(r.total.chips === 10 + 20 + 40, 'a Pair of Kings among unscored cards: the leftmost SCORED card (a King) +40 (10 + 20 + 40)', r.total);
  ex(s).form = 'east';
  t = play2(['H_A']);
  ok(t.chips === 5 + 11 + 40, 'a 1-card hand: the card is the end (East): +40 once', t);
  ex(s).form = 'west';
  t = play2(['H_A']);
  ok(t.chips === 5 + 11 + 40, '... and for West too', t);
  // a debuffed end card scores nothing; the end never moves inward
  clearHand();
  const c3 = hand(FLUSH);
  debuff(c3[0]);
  t = play(c3).total;
  ok(t.chips === FLUSH_CHIPS - 2, 'West with a debuffed leftmost card: no +40 (the end does not shift to the 5)', t);
  // Blueprint copies it
  start('SHTP4');
  sea('shellos', 'west');
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers;
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 80, 'a Blueprint copying a West Shellos: +40 twice on the leftmost', t);
});

// ------------------------------------------------------------------- evolution at 5 rounds, keeping the sea and its art
await sec('evolve', () => {
  for (const f of ['west', 'east']) {
    start('SHEVO' + f);
    const s = sea('shellos', f);
    for (let r = 1; r <= 4; r++) { endRound(); ok(key(s) === 'j_poke_shellos' && ex(s).rounds === 5 - r, `${f}: round ${r}, still Shellos (${5 - r} left)`, [key(s), ex(s).rounds]); advance(); }
    endRound();
    ok(key(s) === 'j_poke_gastrodon' && ex(s).form === f, `${f}: Shellos becomes Gastrodon after 5 rounds, ${f === 'west' ? 'West' : 'East'} Sea kept`, [key(s), ex(s).form]);
    const [atlas, pos] = drawn(s);
    ok(atlas === 'poke_AtlasJokersBasicGen04391' && pos.x === (f === 'west' ? 10 : 8) && pos.y === 1, `${f}: drawn as ${f} Gastrodon (Gen 4 {${f === 'west' ? 10 : 8},1})`, [atlas, pos]);
    ok(new RegExp((f === 'west' ? 'West' : 'East') + ' Sea, kept from Shellos').test(plain(s)), 'its tooltip names the sea', plain(s));
    advance();
    const t = play2(FLUSH);
    const endCard = f === 'west' ? 2 : 3;
    ok(t.chips === FLUSH_CHIPS + endCard + 80, `${f} Gastrodon, the next round: its end card retriggers (+${endCard}) with +40 each time (+80)`, t);
  }
});

// ------------------------------------------------------------------- Gastrodon: Tide
await sec('tide', () => {
  start('SHGT1');
  sea('gastrodon', 'west');
  let t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 2 + 80 && near(t.mult, 4), 'West Gastrodon: the 2 retriggers (+2) and gives +40 both times (64 + 2 + 80 = 146)', t);
  start('SHGT2');
  sea('gastrodon', 'east');
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 3 + 80, 'East Gastrodon: the 3 retriggers (+3) with +40 each (64 + 3 + 80)', t);
  t = play2(['S_A']);
  ok(t.chips === 5 + 22 + 80, 'a 1-card hand: one retrigger, +40 each time (5 + 11 x 2 + 80)', t);
  // a Blueprint copying Gastrodon: a second retrigger and +40 on each trigger
  start('SHGT3');
  sea('gastrodon', 'west');
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers;
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 2 * 2 + 3 * 80, 'with a Blueprint: the 2 scores 3 times, +80 Chips from each of the 3 triggers (64 + 4 + 240)', t);
});

// ------------------------------------------------------------------- Gastrodon: Storm Drain
await sec('storm drain', () => {
  start('SHSD1');
  const g = sea('gastrodon', 'west');
  const ch = add('j_poke_charmander');
  let r = use('c_poke_fire_energy');
  ok(ch.ability.extra.energy_count === 1 && !(ex(g).energy_count > 0) && near(ex(g).drain_Xmult, 1.1), 'a Fire Energy used on Charmander: Gastrodon X1.1 (any joker\'s Energy)', [ex(g).drain_Xmult, ch.ability.extra.energy_count]);
  ok(r.events.some((e) => e.type === 'status' && e.message === 'Storm Drain!'), 'a "Storm Drain!" pop-up');
  use('c_poke_fire_energy');
  ok(near(ex(g).drain_Xmult, 1.2), 'a second: X1.2', ex(g).drain_Xmult);
  // a Water Energy: X0.2 (here it energizes Gastrodon itself first, so the gain is already its energized one: 2 x 0.12)
  use('c_poke_water_energy', g);
  ok(ex(g).energy_count === 1 && near(ex(g).Xmult_mod, 0.12) && near(ex(g).drain_Xmult, 1.44), 'a Water Energy on Gastrodon: energized first (gain 0.12), then +2 x 0.12 (X1.44)', [ex(g).drain_Xmult, ex(g).Xmult_mod]);
  let t = play2(['S_A']);
  ok(near(t.mult, 1.44), 'it scores X1.44', t);
  // a Water Energy used on ANOTHER Water joker counts X0.2 at the base rate
  start('SHSD2');
  const sq = add('j_poke_squirtle');
  const g2 = sea('gastrodon', 'east');
  use('c_poke_water_energy');
  ok(sq.ability.extra.energy_count === 1 && !(ex(g2).energy_count > 0) && near(ex(g2).drain_Xmult, 1.2), 'Water Energy on Squirtle (leftmost Water): Gastrodon X1.2', [ex(g2).drain_Xmult, sq.ability.extra.energy_count]);
  // Bird Energy is an Energy card; Double Rainbow (a Spectral) and a Tarot are not
  use('c_poke_bird_energy', sq);
  ok(near(ex(g2).drain_Xmult, 1.3), 'Bird Energy (the Energy set): +X0.1', ex(g2).drain_Xmult);
  use('c_hermit');
  ok(near(ex(g2).drain_Xmult, 1.3), 'a Tarot: nothing', ex(g2).drain_Xmult);
  const dr = use('c_poke_double_rainbow_energy', g2);
  ok(near(ex(g2).drain_Xmult, 1.3), 'Double Rainbow Energy (a Spectral, not an Energy card): nothing', [ex(g2).drain_Xmult, dr && dr.events && dr.events.length]);
  // Blueprint copies the X, never the growth
  start('SHSD3');
  const g3 = sea('gastrodon', 'west');
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers;
  add('j_poke_charmander');
  use('c_poke_fire_energy');
  ok(near(ex(g3).drain_Xmult, 1.1), 'a Blueprint beside it: one Energy, one gain (X1.1)', ex(g3).drain_Xmult);
  t = play2(['S_A']);
  ok(near(t.mult, 1.1 * 1.1), '... and it copies the X (1.1 x 1.1)', t);
  ok(/X1\.1 \{C:inactive\} Mult/.test(lines(g3)) && /X0\.1 /.test(lines(g3)) && /X0\.2 /.test(lines(g3)), 'tooltip: gains X0.1, X0.2 for Water, (Currently X1.1)', lines(g3));
});

// ------------------------------------------------------------------- Two Seas
await sec('two seas', () => {
  start('SHTS1');
  const w = sea('shellos', 'west'), e = sea('shellos', 'east');
  let t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 4 * 40, 'a West + an East Shellos: each gives BOTH ends +40 (4 x 40 = +160)', t);
  ok(/leftmost and rightmost/.test(plain(w)) && /Two Seas: active/.test(plain(e)), 'tooltips: both ends, Two Seas active', [plain(w), plain(e)]);
  t = play2(['S_A']);
  ok(t.chips === 5 + 11 + 2 * 40, 'a 1-card hand: the card is both ends, once per Shellos (+80, not +160)', t);
  debuff(e);
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 40, 'the East one debuffed: no Two Seas, only the West leftmost +40', t);
  ok(/needs an East Sea/.test(plain(w)), 'tooltip: Two Seas needs an East Sea', plain(w));
  undebuff(e);
  // two of the same sea are not Two Seas
  start('SHTS2');
  sea('shellos', 'west'); sea('shellos', 'west');
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 80, 'two West Shellos: no Two Seas (+40 x 2 on the leftmost only)', t);
  // any mix: an East Shellos and a West Gastrodon
  start('SHTS3');
  sea('shellos', 'east'); sea('gastrodon', 'west');
  t = play2(FLUSH);
  // Gastrodon: both ends retrigger (+2 +3) and get +40 per trigger (4 x 40); Shellos: both ends +40 per trigger (4 x 40)
  ok(t.chips === FLUSH_CHIPS + 2 + 3 + 8 * 40, 'East Shellos + West Gastrodon: both ends retrigger, +40 from each per trigger (64 + 5 + 320)', t);
  t = play2(['S_A']);
  ok(t.chips === 5 + 22 + 4 * 40, 'a 1-card hand: ONE retrigger (not two), +40 from each per trigger (5 + 22 + 160)', t);
  // a Blueprint copy is not a sea
  start('SHTS4');
  sea('shellos', 'west');
  const bp4 = add('j_blueprint');
  G.jokers.remove_card(bp4); G.jokers.cards.unshift(bp4); bp4.area = G.jokers;
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 80, 'a Blueprint copying a West Shellos is not an East Sea (+40 x 2, leftmost only)', t);
  // the shop card says what it would be once bought
  start('SHTS5');
  sea('shellos', 'west');
  const sh = create_card('Joker', G.shop_jokers || G.jokers, null, null, null, null, 'j_poke_gastrodon');
  ex(sh).form = 'east';
  ok(/Two Seas: active/.test(plain(sh)), 'a not-yet-owned East Gastrodon beside a West Shellos reads Two Seas: active', plain(sh));
});

// ------------------------------------------------------------------- Energy: standard shares, retrigger fixed, carried through evolution
await sec('energy', () => {
  start('SHEN1');
  const s = sea('shellos', 'west');
  const got = [];
  for (let n = 0; n < 3; n++) { increment_energy(s, 'Water'); got.push(ex(s).chips); }
  ok(got.every((v, n) => near(v, 40 + 12 * (n + 1))), 'Shellos + Water Energy: +40 -> +52 / +64 / +76 Chips', got);
  let t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 76, 'energized: the leftmost +76', t);
  start('SHEN2');
  const g = sea('gastrodon', 'east');
  use('c_poke_water_energy', g); // energized, then +0.24
  increment_energy(g, 'Water'); increment_energy(g, 'Water');
  ok(ex(g).energy_count === 3 && near(ex(g).chips, 76) && near(ex(g).Xmult_mod, 0.16) && ex(g).retriggers === 1 && near(ex(g).drain_Xmult, 1.24),
    'Gastrodon, 3 Water Energy: +76 Chips, gain X0.16 (X0.32 Water), retrigger still 1; the bank X1.24 not raised (not retroactive)', ex(g));
  ok(/X0\.16 /.test(lines(g)) && /X0\.32 /.test(lines(g)) && /\+76/.test(lines(g)), 'its tooltip: +76, X0.16, X0.32', lines(g));
  add('j_poke_charmander');
  use('c_poke_fire_energy');
  ok(near(ex(g).drain_Xmult, 1.4), 'a Fire Energy now banks X0.16 (X1.4)', ex(g).drain_Xmult);
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 3 + 2 * 76 && near(t.mult, 4 * 1.4), 'energized Tide: the 3 retriggers with +76 each, X1.4', t);
  // carried through evolution
  start('SHEN3');
  const e = sea('shellos', 'west');
  increment_energy(e, 'Water');
  for (let r = 1; r <= 5; r++) { endRound(); if (r < 5) advance(); }
  ok(key(e) === 'j_poke_gastrodon' && ex(e).energy_count === 1 && near(ex(e).chips, 52) && near(ex(e).Xmult_mod, 0.12) && near(ex(e).drain_Xmult, 1) && ex(e).form === 'west',
    'a 1-Energy West Shellos becomes a 1-Energy West Gastrodon: +52 Chips, gain X0.12, bank X1', ex(e));
});

// ------------------------------------------------------------------- the art: real cells, which is which sea, the type each shows
if (ART) {
  await sec('art cells', async () => {
    const ATL = MODS.pokermon.content.atlases;
    const file = (atlas) => path.join(ART, decodeURIComponent(ATL[atlas].src).replace(/^.*\/assets\/2x\//, ''));
    // the cell each card is DRAWN from, cut out of the sheet it names
    start('SHPX');
    const cases = [];
    for (const k of LINE) for (const f of ['west', 'east']) for (const sh of [false, true]) { const j = sea(k, f); const [atlas, pos] = drawn(j, sh); cases.push({ k, f, sh, atlas, pos }); }
    const byFile = {};
    cases.forEach((c, i) => { (byFile[file(c.atlas)] || (byFile[file(c.atlas)] = {}))[i] = [c.pos.x * 142 + 20, c.pos.y * 190 + 40, 102, 100]; });
    const px = {};
    for (const [f, rects] of Object.entries(byFile)) Object.assign(px, await crops(f, rects));
    // West Sea Shellos / Gastrodon are pink, East Sea blue / green: count the pink pixels of the Pokémon
    const pink = (r) => { let n = 0; for (let i = 0; i < r.px.length; i += 4) { const R = r.px[i], Gc = r.px[i + 1], B = r.px[i + 2]; if (r.px[i + 3] && R > 180 && R - Gc > 50 && B > 90 && R >= B) n++; } return n; };
    const got = cases.map((c, i) => [c.k + ' ' + c.f + (c.sh ? ' shiny' : ''), px[i] && px[i].inside, px[i] && pink(px[i])]);
    ok(got.every(([n, inside, p]) => inside && (/west/.test(n) ? p > 500 : p < 50)), 'each sea\'s card is the right picture: West pink (500+ pink pixels), East blue (none), Shiny too', got);
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const types = [];
    for (const k of LINE) for (const [f, p] of Object.entries(SPRITES['j_poke_' + k] || {})) { const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen04', pos: [p.x, p.y] }); types.push([k, f, r && r.ptype]); }
    ok(types.length === 4 && types.every(([k, , t]) => t === P_CENTERS['j_poke_' + k].ptype && t === 'Water'), 'all four sea cards show the Water icon (the type each joker has)', types);
  });
} else console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');

// ------------------------------------------------------------------- text
await sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(J.j_poke_shellos && J.j_poke_gastrodon, 'the texts');
  start('SHTXT');
  const s = sea('shellos', 'east');
  let d = plain(s);
  ok(/Tide Pool: \+40 Chips on the \| rightmost scored card \|/.test(d) && /East Sea: rolled once when created/.test(d) && /Two Seas/.test(d) && /needs a West Sea/.test(d) && /Evolves after 5 rounds/.test(d),
    'Shellos (East): Tide Pool +40 Chips on the rightmost scored card, East Sea, Two Seas needs a West Sea, 5 rounds', d);
  const g = sea('gastrodon', 'west');
  d = plain(g);
  ok(/Tide: retrigger the \| leftmost and rightmost scored cards, \| \+40 Chips per trigger/.test(d) && /Storm Drain/.test(d) && /X0\.1\s+Mult/.test(d) && /X0\.2\s+for Water/.test(d) && /Currently\s+X1\s+Mult/.test(d) && /Two Seas: active/.test(d),
    'Gastrodon (West, beside an East Shellos): both ends, retrigger, Storm Drain X0.1 / X0.2 (Currently X1), Two Seas active', d);
});

done();
