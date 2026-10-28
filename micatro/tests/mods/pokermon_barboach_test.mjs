// The owner's Barboach line (2026-10-28; jokers/pokejokers_designs.js "LINE F7"; PORTING.md "The owner's Barboach line"):
//   Barboach 339 (Basic, Common $5, Water)  Muddy Water: +12 Chips for each Water or Earth Joker you have, itself included.
//                                           Evolves after 5 rounds.
//   Whiscash 340 (Stage 1, Safari $8, Water) Muddy Water: +20 Chips per Water or Earth Joker, itself included.
//                                           Earthquake: with at least 2 OTHER Water or Earth Jokers, the first hand of each round
//                                           (hands_played === 0) retriggers every scored card once.
//   Counting: Pokermon's is_type (a Tera sticker counts; Castform counts while Rainy / Snowy, its form's type), a joker that is both
//   Water and Earth counts ONCE, a debuffed joker doesn't count. Energy: the per-joker Chips (`chips`, +30% of base each); the
//   retrigger is fixed. A Blueprint copying Whiscash adds its own retrigger (and its Chips), as on Remoraid / Octillery.
// Every ability is FIRED through real hands with exact numbers.
//   node micatro/tests/mods/pokermon_barboach_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, winRound, clearHand, nextRound, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { apply_type_sticker, is_type, IS_TYPE_RULES } from '../../mods/pokermon/systems/types.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');

/** A joker with no scoring effect of its own (Egg) given a Tera sticker: a pure Water / Earth "count". */
function tera(type) { const e = add('j_egg'); apply_type_sticker(e, type); return e; }
/** High Card of one 2 of Spades: 5 + 2 = 7 Chips, 1 Mult before the jokers. */
const high = () => { clearHand(); return play(hand(['S_2'])).total; };
/** Pair of 5s: 10 + 5 + 5 = 20 Chips, 2 Mult before the jokers (each retrigger of both cards +10). */
const pair = () => { clearHand(); return play(hand(['S_5', 'H_5'])).total; };
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }

// ------------------------------------------------------------------- pin, static data, order, pool, art, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 28 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 28+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of ['barboach', 'whiscash']) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  // precedence: neither add-on has the line (their sources never mention it)
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /barboach|whiscash/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Barboach / Whiscash (precedence: nothing to dedupe)', hits);
});
sec('static', () => {
  start('BARB0');
  const b = P_CENTERS.j_poke_barboach, w = P_CENTERS.j_poke_whiscash;
  ok(b.rarity === 1 && b.cost === 5 && b.stage === 'Basic' && b.ptype === 'Water' && b.gen === 3 && b.config.extra.chips === 12 && b.config.extra.rounds === 5,
    'Barboach: Common $5, Basic, Water, Gen 3, +12 Chips per joker, 5 rounds', [b.rarity, b.cost, b.stage, b.ptype, b.config.extra]);
  ok(w.rarity === 'poke_safari' && w.cost === 8 && w.stage === 'One' && w.ptype === 'Water' && w.gen === 3 && w.config.extra.chips === 20
    && w.config.extra.retriggers === 1 && w.config.extra.quake_req === 2, 'Whiscash: Safari $8, Stage 1, Water, +20 per joker, 1 retrigger with 2 others', [w.rarity, w.cost, w.stage, w.config.extra]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_barboach');
  ok(i > 0 && keys[i - 1] === 'j_poke_seviper' && keys[i + 1] === 'j_poke_whiscash' && keys[i + 2] === 'j_poke_corphish', 'Pokédex order: Seviper (336), Barboach, Whiscash, Corphish (341)', keys.slice(i - 1, i + 3));
  const fam = poke_get_family_list('barboach').map((x) => (typeof x === 'string' ? x : x.key || x.name));
  ok(fam.length === 2 && fam.join() === poke_get_family_list('whiscash').map((x) => (typeof x === 'string' ? x : x.key || x.name)).join() && /barboach/.test(fam[0]) && /whiscash/.test(fam[1]), 'one family: Barboach -> Whiscash', fam);
  ok(b.atlas === 'poke_AtlasJokersBasicNatdex391' && b.pos.x === 16 && b.pos.y === 22 && w.atlas === b.atlas && w.pos.x === 18 && w.pos.y === 22,
    'art: upstream 3.9.1\'s own cells (Natdex 16,22 / 18,22)', [b.atlas, b.pos, w.pos]);
  ok(pool_filter(b, 'Joker') === undefined && b.in_pool(b) !== false, 'Barboach can be rolled in the shop (Common)');
  ok(!w.in_pool || w.in_pool(w) === false || pool_filter(w, 'Joker') !== undefined || w.rarity === 'poke_safari', 'Whiscash is Safari (evolution only)');
  ok('chips' in energy_values && !('retriggers' in energy_values) && !('quake_req' in energy_values) && !('rounds' in energy_values),
    'Energy field: chips (the retrigger, the threshold and the timer are not)');
});

// ------------------------------------------------------------------- Muddy Water: exact Chips for 1-5 Water / Earth jokers
sec('muddy count', () => {
  start('BARB1');
  const b = add('j_poke_barboach');
  let t = high();
  ok(t.chips === 7 + 12 && near(t.mult, 1), '1 (Barboach alone, itself included): 7 + 12 = 19 Chips', t);
  tera('Water');
  t = high();
  ok(t.chips === 7 + 24, '2 (+ a Water-Tera Egg): +24 Chips', t);
  tera('Earth');
  t = high();
  ok(t.chips === 7 + 36, '3 (+ an Earth-Tera Egg: a Tera sticker counts): +36 Chips', t);
  const geo = add('j_poke_geodude'); // Earth, +75 Chips (-1 hand size)
  t = high();
  ok(t.chips === 7 + 75 + 48, '4 (+ Geodude, Earth): +48 Chips (and Geodude\'s +75)', t);
  // a joker that is BOTH Water and Earth counts once: a Water Krabby that also reads as Earth through an add-on is_type rule (the
  // IS_TYPE_RULES hook Pokermon+'s Grafaiai uses; a Tera sticker REPLACES the type, so it never makes a joker both)
  const kr = add('j_poke_krabby'); // Water; +20 Chips per scored face card (none here)
  const rule = (c, t) => c === kr && t === 'Earth';
  IS_TYPE_RULES.push(rule);
  try {
    ok(is_type(kr, 'Water') && is_type(kr, 'Earth'), 'the Krabby is both Water and Earth', kr.ability.extra);
    t = high();
    ok(t.chips === 7 + 75 + 60, '5 (+ a Water AND Earth joker, counted ONCE): +60 Chips, not +72', t);
    ok(/Currently \{C:attention\}5\{C:inactive\}: \{C:chips\}\+60/.test(lines(b)), 'the tooltip shows the count (5) and the Chips (+60)', lines(b));
  } finally { IS_TYPE_RULES.splice(IS_TYPE_RULES.indexOf(rule), 1); }
  // a Tera sticker on a Fire joker makes it count (its type is now Earth)
  const ch = add('j_poke_charmander');
  t = high();
  ok(t.chips === 7 + 75 + 60, 'a Fire joker (Charmander) adds nothing (Krabby, plain Water again, still counts)', t);
  apply_type_sticker(ch, 'Earth');
  t = high();
  ok(t.chips === 7 + 75 + 72, 'the same Charmander with an Earth Tera sticker counts: 6 jokers, +72', t);
  apply_type_sticker(ch, 'Fire');
  // a debuffed Water / Earth joker doesn't count
  debuff(geo);
  ok(geo.debuff === true, 'Geodude debuffed');
  t = high();
  ok(t.chips === 7 + 48, 'a debuffed Geodude doesn\'t count (nor give its +75): +48', t);
  ok(/Currently \{C:attention\}4\{C:inactive\}: \{C:chips\}\+48/.test(lines(b)), 'the tooltip follows (4, +48)', lines(b));
  // the shop / collection card counts itself as once bought
  ok(/Currently \{C:attention\}1\{C:inactive\}: \{C:chips\}\+12/.test((() => { start('BARB1b'); const c = add('j_poke_barboach'); return lines(c); })()), 'alone: (Currently 1: +12 Chips)');
});

// ------------------------------------------------------------------- Castform: counts while Rainy (Water), not while Sunny (Fire)
function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  for (const s of specs) create_playing_card({ front: P_CARDS[s], center: P_CENTERS.c_base }, G.deck);
}
sec('castform', () => {
  for (const [name, deal, want, type] of [
    ['Rainy', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9'], 2, 'Water'],
    ['Snowy', ['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'C_8', 'S_9'], 2, 'Water'],
    ['Sunny', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9'], 1, 'Fire'],
  ]) {
    start('BARBCF' + name, {}, { noBlind: true });
    add('j_poke_barboach'); const cf = add('j_poke_castform');
    stackDeck(deal);
    act({ type: 'select_blind' }); flush();
    ok(ex(cf).ptype === type, `Castform is ${name} (${type}) this round`, [ex(cf).form, ex(cf).ptype]);
    const t = high(); // a lone Spade 2: no Club scored, and Snowy's held-Spade X Mult needs Spades in hand (none are left)
    ok(t.chips === 7 + 12 * want, `${name} Castform: ${want === 2 ? 'counts' : 'doesn\'t count'} (+${12 * want} Chips)`, t);
  }
});

// ------------------------------------------------------------------- evolution after 5 rounds
sec('evolution', () => {
  start('BARBEVO');
  const b = add('j_poke_barboach');
  for (let r = 1; r <= 4; r++) { nextRound(); flush(); }
  ok(key(b) === 'j_poke_barboach' && ex(b).rounds === 1, 'after 4 rounds: still Barboach (1 round left)', [key(b), ex(b).rounds]);
  nextRound(); flush();
  ok(key(b) === 'j_poke_whiscash' && ex(b).chips === 20 && ex(b).retriggers === 1, 'after the 5th round: Whiscash (+20 per joker)', [key(b), ex(b)]);
  ok(/Evolves after \{C:attention,s:0\.8\}5/.test((() => { start('BARBEVO2'); return lines(add('j_poke_barboach')); })()), 'the footer: (Evolves after 5 rounds)');
});

// ------------------------------------------------------------------- Earthquake: the first hand of each round retriggers every scored card
sec('earthquake', () => {
  start('BARBQ1');
  const w = add('j_poke_whiscash'); tera('Water'); tera('Earth');
  ok(/\(Active!\)/.test(lines(w)), 'the tooltip: Earthquake (Active!) with 2 others before the first hand', lines(w));
  let t = pair();
  ok(t.chips === 20 + 10 + 60 && near(t.mult, 2), 'first hand, 2 others: both 5s retrigger (20 + 10) + 3 x 20 = 90 Chips', t);
  ok(/\(Used this round\)/.test(lines(w)), 'after the first hand: (Used this round)', lines(w));
  t = pair();
  ok(t.chips === 20 + 60, 'the second hand: no retrigger (80 Chips)', t);
  nextRound();
  t = pair();
  ok(t.chips === 90, 'the next round\'s first hand retriggers again (90)', t);
  // with 5 scored cards: every one retriggers
  nextRound();
  clearHand();
  t = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T'])).total; // Flush: 35 Chips, 4 Mult; cards 30
  ok(t.chips === 35 + 30 * 2 + 60 && near(t.mult, 4), 'a 5-card Flush on the first hand: all 5 retrigger (35 + 60 + 60 = 155)', t);

  // only 1 other: no Earthquake
  start('BARBQ2');
  const w2 = add('j_poke_whiscash'); tera('Earth');
  ok(/\(Inactive: 1\/2 others\)/.test(lines(w2)), 'the tooltip: (Inactive: 1/2 others)', lines(w2));
  t = pair();
  ok(t.chips === 20 + 40, '1 other: no retrigger on the first hand (20 + 2 x 20 = 60)', t);
  // Whiscash itself is not one of the 2: a Barboach + Whiscash + 1 other is 2 others
  start('BARBQ3');
  const w3 = add('j_poke_whiscash'); add('j_poke_barboach'); tera('Water');
  t = pair();
  ok(t.chips === 20 + 10 + 3 * 20 + 3 * 12, 'Barboach + 1 other = 2 OTHER Water jokers: Earthquake (30 + 60 + Barboach 36)', t);
  // a debuffed one isn't one of them
  start('BARBQ4');
  add('j_poke_whiscash'); tera('Water'); debuff(tera('Earth'));
  t = pair();
  ok(t.chips === 20 + 40, 'a debuffed Earth joker is not one of the 2 (no retrigger; 2 x 20)', t);
  // a non-Water / Earth joker isn't either
  start('BARBQ5');
  add('j_poke_whiscash'); tera('Water'); add('j_joker');
  t = pair();
  ok(t.chips === 20 + 40 && near(t.mult, 2 + 4), 'Joker (+4 Mult, no type) is not one of the 2', t);
  void w3;
});

// ------------------------------------------------------------------- Blueprint: copies it like any repetition joker
sec('blueprint', () => {
  start('BARBBP');
  add('j_blueprint'); add('j_poke_whiscash'); tera('Water'); tera('Earth'); // Blueprint copies the joker to its right
  let t = pair();
  ok(t.chips === 10 + 10 * 3 + 60 * 2, 'Blueprint copies Whiscash: a second retrigger (each 5 scores 3 times) and its Chips again: 10 + 30 + 120 = 160', t);
  t = pair();
  ok(t.chips === 20 + 120, 'the second hand: no retrigger from either (140)', t);
  start('BARBBP2');
  add('j_blueprint'); add('j_poke_whiscash'); tera('Water');
  t = pair();
  ok(t.chips === 20 + 40 * 2, 'with only 1 other, neither Whiscash nor the Blueprint retriggers (100)', t);
  start('BARBBP3');
  add('j_blueprint'); add('j_poke_barboach'); tera('Earth');
  t = high();
  ok(t.chips === 7 + 24 * 2, 'Blueprint copies Barboach\'s Chips (+24 twice)', t);
});

// ------------------------------------------------------------------- Energy: the per-joker Chips at +30% of base; the retrigger fixed
sec('energy', () => {
  start('BARBEN');
  const b = add('j_poke_barboach'); tera('Water');
  increment_energy(b, 'Water');
  ok(ex(b).energy_count === 1 && near(ex(b).chips, 15.6) && ex(b).rounds === 5, '1 Water Energy: +15.6 per joker (12 x 1.3)', ex(b));
  let t = high();
  ok(near(t.chips, 7 + 31.2), 'energized Barboach with 2: 7 + 31.2 Chips', t);
  ok(/\+15\.6\{\}/.test(lines(b)) && /\+31\.2/.test(lines(b)), 'the tooltip shows +15.6 and the total +31.2', lines(b));
  increment_energy(b, 'Water'); increment_energy(b, 'Water');
  ok(ex(b).energy_count === 3 && near(ex(b).chips, 22.8), '3 Energy: +22.8 per joker', ex(b));
  // evolution re-applies the Energy to Whiscash's base: 20 x (1 + 3 x 0.3) = 38
  for (let r = 1; r <= 5; r++) { nextRound(); flush(); }
  ok(key(b) === 'j_poke_whiscash' && near(ex(b).chips, 38) && ex(b).retriggers === 1 && ex(b).quake_req === 2, 'evolved with 3 Energy: +38 per joker; the retrigger stays 1, the threshold 2', ex(b));
  start('BARBEN2');
  const w = add('j_poke_whiscash'); tera('Water'); tera('Earth');
  increment_energy(w, 'Water');
  ok(near(ex(w).chips, 26) && ex(w).retriggers === 1, '1 Energy on Whiscash: +26 per joker, still 1 retrigger', ex(w));
  t = pair();
  ok(near(t.chips, 30 + 78), 'energized Earthquake hand: 30 + 3 x 26 = 108 Chips', t);
});

// ------------------------------------------------------------------- vanilla untouched
sec('vanilla', () => {
  start('BARBVAN');
  add('j_joker');
  const t = pair();
  ok(t.chips === 20 && near(t.mult, 6), 'a run without the line plays as before', t);
});

done();
