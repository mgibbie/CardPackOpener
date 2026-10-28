// The Gen 8 starters, the Scorbunny and Sobble lines (2026-10-28, the owner's "build"; jokers/pokejokers_designs.js "Gen 8 starters";
// PORTING.md "The Gen 8 starters"). The Grookey line is #830's (pokermon_new_jokers_test.mjs).
//   Scorbunny 813 (Basic, Uncommon $5, Fire, starter)  +1 discard; +3 Mult for each discard left. Evolves after 5 rounds.
//   Raboot 814 (Stage 1, Safari $8, Fire)               +1 discard; +5 Mult for each discard left. Evolves after 5 rounds.
//   Cinderace 815 (Stage 2, Safari $10, Fire)           +1 discard; Libero: X(1 + 0.5 for each discard left).
//   Sobble 816 (Basic, Uncommon $5, Water, starter)     +1 hand; each played card that doesn't score gives +20 Chips. 5 rounds.
//   Drizzile 817 (Stage 1, Safari $8, Water)            +1 hand; +35 Chips per played card that doesn't score. 5 rounds.
//   Inteleon 818 (Stage 2, Safari $10, Water)           +1 hand; Snipe Shot: the highest-ranked scored card gives X2 Mult (a tie: the
//                                                       leftmost; a debuffed or rankless card is never the target).
//   Energy: Scorbunny / Raboot `mult` +40% of base, Cinderace `Xmult_mod` +20%, Sobble / Drizzile `chips` +30%, Inteleon `Xmult_multi`
//   +5%; the +1 discard / +1 hand and the rounds are fixed; Energy carries through evolution (re-applied to the new base).
// Every ability is FIRED through real hands with exact numbers; the Starter Pack is opened for real.
//   node micatro/tests/mods/pokermon_starters_gen8_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, clearHand, nextRound, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Card, P_CARDS } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { starter_lists } from '../../mods/pokermon/boosters/packs1.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const FIRE = ['scorbunny', 'raboot', 'cinderace'];
const WATER = ['sobble', 'drizzile', 'inteleon'];
const ALL = [...FIRE, ...WATER];
const cr = () => G.GAME.current_round;

/** Play exactly these cards (hand emptied first); returns the hand total {chips, mult}. */
function playKeys(keys, setup) {
  clearHand();
  const cs = hand(keys);
  if (setup) setup(cs);
  const t = play(cs).total;
  flush();
  return { chips: Number(t.chips), mult: Number(t.mult), cards: cs };
}
/** Use up discards for real (discard one card each time) until `left` remain. */
function discardTo(left) {
  while (cr().discards_left > left) {
    clearHand();
    const [c] = hand(['C_3']);
    act({ type: 'highlight', ids: [c.sort_id] });
    const r = act({ type: 'discard' });
    flush();
    if (!r || !r.ok) throw new Error('discard refused');
  }
}
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); return c; }

// ------------------------------------------------------------------- pin, registration, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 49 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 49+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of ALL) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const re = /scorbunny|raboot|cinderace|sobble|drizzile|inteleon/i;
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has either line (precedence: nothing to dedupe)', hits);
});

// ------------------------------------------------------------------- static data, art, order, families, energy fields
sec('static', () => {
  start('ST8S0');
  const C = (n) => P_CENTERS['j_poke_' + n];
  const want = { scorbunny: [2, 5, 'Basic', 'Fire', 4], raboot: ['poke_safari', 8, 'One', 'Fire', 6], cinderace: ['poke_safari', 10, 'Two', 'Fire', 8],
    sobble: [2, 5, 'Basic', 'Water', 10], drizzile: ['poke_safari', 8, 'One', 'Water', 12], inteleon: ['poke_safari', 10, 'Two', 'Water', 14] };
  for (const [n, [r, cost, st, t, x]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === r && c.cost === cost && c.stage === st && c.ptype === t && c.gen === 8 && c.blueprint_compat, n + ': ' + [r, '$' + cost, st, t, 'Gen 8'].join(' '), [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === x && c.pos.y === 54 && !c.soul_pos, n + ': upstream 3.9.1 cell Natdex {' + x + ',54} (nothing to deploy)', [c.atlas, c.pos]);
    ok(c.attributes.includes('starter'), n + ': the starter attribute');
  }
  ok(C('scorbunny').starter === true && C('sobble').starter === true && !C('raboot').starter && !C('cinderace').starter && !C('drizzile').starter && !C('inteleon').starter,
    'only the Basics are starters (starter: true)');
  const E = (n) => C(n).config.extra;
  ok(E('scorbunny').d_size === 1 && E('scorbunny').mult === 3 && E('scorbunny').rounds === 5, 'Scorbunny: +1 discard, +3 a discard, 5 rounds', E('scorbunny'));
  ok(E('raboot').d_size === 1 && E('raboot').mult === 5 && E('raboot').rounds === 5, 'Raboot: +1 discard, +5 a discard, 5 rounds', E('raboot'));
  ok(E('cinderace').d_size === 1 && E('cinderace').Xmult_mod === 0.5 && !('rounds' in E('cinderace')), 'Cinderace: +1 discard, X0.5 a discard', E('cinderace'));
  ok(E('sobble').hands === 1 && E('sobble').chips === 20 && E('sobble').rounds === 5, 'Sobble: +1 hand, +20 a card, 5 rounds', E('sobble'));
  ok(E('drizzile').hands === 1 && E('drizzile').chips === 35 && E('drizzile').rounds === 5, 'Drizzile: +1 hand, +35 a card, 5 rounds', E('drizzile'));
  ok(E('inteleon').hands === 1 && E('inteleon').Xmult_multi === 2 && !('rounds' in E('inteleon')), 'Inteleon: +1 hand, X2 on its target', E('inteleon'));
  ok(near(energy_values.mult, 0.4) && near(energy_values.Xmult_mod, 0.2) && near(energy_values.chips, 0.3) && near(energy_values.Xmult_multi, 0.05)
    && !('d_size' in energy_values) && !('hands' in energy_values) && !('rounds' in energy_values),
    'Energy fields: mult +40%, Xmult_mod +20%, chips +30%, Xmult_multi +5%; d_size, hands, rounds fixed');
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const order = ['rillaboom', ...ALL, 'nickit'].map((n) => 'j_poke_' + n);
  const i = keys.indexOf('j_poke_rillaboom');
  ok(i > 0 && order.every((k, n) => keys[i + n] === k), 'Pokédex order: Rillaboom (812), Scorbunny ... Inteleon (813-818), Nickit (827)', keys.slice(i, i + 8));
  ok(JSON.stringify(poke_get_family_list('raboot')) === '["scorbunny","raboot","cinderace"]' && JSON.stringify(poke_get_family_list('inteleon')) === '["sobble","drizzile","inteleon"]',
    'families: Scorbunny / Raboot / Cinderace and Sobble / Drizzile / Inteleon');
});

// ------------------------------------------------------------------- the perks: +1 discard (Fire), +1 hand (Water), at every stage
sec('perks', () => {
  for (const n of FIRE) {
    start('ST8P' + n);
    const d0 = G.GAME.round_resets.discards, l0 = cr().discards_left;
    const j = add('j_poke_' + n);
    ok(G.GAME.round_resets.discards === d0 + 1 && cr().discards_left === l0 + 1, n + ': +1 discard each round, and one now', [d0, G.GAME.round_resets.discards, l0, cr().discards_left]);
    j.remove(); flush();
    ok(G.GAME.round_resets.discards === d0 && cr().discards_left === l0, n + ': sold / destroyed, the discard goes again', [G.GAME.round_resets.discards, cr().discards_left]);
  }
  for (const n of WATER) {
    start('ST8P' + n);
    const h0 = G.GAME.round_resets.hands, l0 = cr().hands_left;
    const j = add('j_poke_' + n);
    ok(G.GAME.round_resets.hands === h0 + 1 && cr().hands_left === l0 + 1, n + ': +1 hand each round, and one now', [h0, G.GAME.round_resets.hands, l0, cr().hands_left]);
    j.remove(); flush();
    ok(G.GAME.round_resets.hands === h0 && cr().hands_left === l0, n + ': gone, the hand goes again', [G.GAME.round_resets.hands, cr().hands_left]);
  }
});

// ------------------------------------------------------------------- Scorbunny / Raboot: +Mult per discard left; Cinderace: X per discard left
sec('libero', () => {
  // High Card of a 2: 7 Chips, 1 Mult before the jokers. The Red Deck has 4 discards; the joker's own makes 5.
  start('ST8L1');
  add('j_poke_scorbunny');
  ok(cr().discards_left === 5, '5 discards left (4 + Scorbunny\'s)', cr().discards_left);
  let r = playKeys(['S_2']);
  ok(r.chips === 7 && r.mult === 1 + 3 * 5, 'Scorbunny, 5 discards left: +15 Mult', r);
  discardTo(2);
  r = playKeys(['S_2']);
  ok(r.mult === 1 + 3 * 2, 'two discards used (real discards), 2 left: +6 Mult', r);
  discardTo(0);
  r = playKeys(['S_2']);
  ok(r.mult === 1, '0 discards left: nothing', r);

  start('ST8L2');
  const rb = add('j_poke_raboot');
  r = playKeys(['S_2']);
  ok(r.mult === 1 + 5 * 5, 'Raboot, 5 left: +25 Mult', r);
  ok(/\+25\{/.test(lines(rb)), 'the tooltip shows the current +25', lines(rb));
  discardTo(1);
  r = playKeys(['S_2']);
  ok(r.mult === 1 + 5, 'Raboot, 1 left: +5 Mult', r);

  start('ST8L3');
  const ci = add('j_poke_cinderace');
  r = playKeys(['S_2']);
  ok(near(r.mult, 1 + 0.5 * 5) && r.chips === 7, 'Cinderace, 5 left: X3.5', r);
  ok(/X3\.5 /.test(lines(ci)), 'the tooltip shows the current X3.5', lines(ci));
  discardTo(1);
  r = playKeys(['S_2', 'H_2']);
  ok(near(r.mult, 2 * 1.5) && r.chips === 14, 'Cinderace, 1 left, a Pair (2 Mult): X1.5 -> 3', r);
  discardTo(0);
  r = playKeys(['S_2']);
  ok(r.mult === 1, 'Cinderace, 0 left: nothing (X1)', r);

  // Blueprint copies it
  start('ST8L4');
  add('j_blueprint'); add('j_poke_scorbunny');
  r = playKeys(['S_2']);
  ok(r.mult === 1 + 15 + 15, 'Blueprint + Scorbunny, 5 left: +15 twice', r);
});

// ------------------------------------------------------------------- Sobble / Drizzile: +Chips per played card that doesn't score
sec('unscored', () => {
  start('ST8U1');
  add('j_poke_sobble');
  let r = playKeys(['S_2']);
  ok(r.chips === 7 && r.mult === 1, 'a High Card of one card: every played card scores, nothing', r);
  r = playKeys(['S_2', 'H_2', 'S_5', 'C_7', 'D_9']);
  ok(r.chips === 10 + 2 + 2 + 3 * 20 && r.mult === 2, 'a Pair with 3 kickers: 3 cards don\'t score, +60 Chips', r);
  r = playKeys(['S_K', 'H_4']);
  ok(r.chips === 5 + 10 + 20, 'High Card K + a 4: the 4 doesn\'t score, +20', r);
  r = playKeys(['S_2', 'H_2', 'S_5'], (cs) => debuff(cs[2]));
  ok(r.chips === 14 + 20, 'a debuffed kicker still doesn\'t score: it counts, +20', r);
  r = playKeys(['S_2', 'H_2', 'S_5'], (cs) => debuff(cs[1]));
  ok(r.chips === 10 + 2 + 20, 'a debuffed card of the Pair is part of the scoring hand: only the kicker counts, +20', r);
  start('ST8U2');
  add('j_poke_drizzile');
  r = playKeys(['S_2', 'H_2', 'S_5', 'C_7', 'D_9']);
  ok(r.chips === 14 + 3 * 35, 'Drizzile, a Pair with 3 kickers: +105 Chips', r);
  start('ST8U3');
  add('j_splash'); add('j_poke_sobble');
  r = playKeys(['S_2', 'H_2', 'S_5', 'C_7', 'D_9']);
  ok(r.chips === 14 + 5 + 7 + 9, 'with Splash every played card scores: nothing from Sobble', r);
  start('ST8U4');
  add('j_blueprint'); add('j_poke_sobble');
  r = playKeys(['S_2', 'H_2', 'S_5']);
  ok(r.chips === 14 + 20 + 20, 'Blueprint + Sobble, 1 kicker: +20 twice', r);
});

// ------------------------------------------------------------------- Inteleon: Snipe Shot
sec('snipe shot', () => {
  start('ST8I1');
  const it = add('j_poke_inteleon');
  let r = playKeys(['S_2']);
  ok(r.chips === 7 && near(r.mult, 2), 'one card: it is the target, X2', r);
  r = playKeys(['S_K', 'H_A', 'D_5']);
  ok(r.chips === 5 + 11 && near(r.mult, 2), 'High Card: only the Ace scores, X2 (the unscored King is never the target)', r);
  r = playKeys(['S_K', 'H_K', 'D_5', 'C_5']);
  ok(r.chips === 20 + 10 + 10 + 5 + 5 && near(r.mult, 2 * 2), 'Two Pair K-K-5-5: one King gets X2, once (2 Mult -> 4)', r);
  // a tie goes to the LEFTMOST: a Red Seal on the right King changes nothing, one on the left King doubles it
  r = playKeys(['S_K', 'H_K'], (cs) => cs[1].set_seal('Red', true));
  ok(near(r.mult, 2 * 2) && r.chips === 10 + 10 + 10 + 10, 'Pair of Kings, the RIGHT one retriggered: X2 once (the target is the left one)', r);
  r = playKeys(['S_K', 'H_K'], (cs) => cs[0].set_seal('Red', true));
  ok(near(r.mult, 2 * 2 * 2), 'Pair of Kings, the LEFT one retriggered: X2 twice (each time the target scores)', r);
  // rank order: Ace high; a debuffed or rankless card is skipped
  r = playKeys(['S_A', 'H_A', 'S_K', 'H_K'], (cs) => { debuff(cs[0]); debuff(cs[1]); });
  ok(near(r.mult, 2 * 2) && r.chips === 20 + 10 + 10, 'Two Pair with both Aces debuffed: the left King is the target, X2', r);
  start('ST8I2');
  add('j_poke_inteleon');
  clearHand();
  const [stone] = hand(['S_A'], { center: 'm_stone' });
  const [two] = hand(['H_2']);
  const t = play([stone, two]).total; flush();
  ok(near(Number(t.mult), 2) && Number(t.chips) === 5 + 50 + 2, 'a Stone card (no rank) and a 2: the 2 is the target, X2', t);
  start('ST8I3');
  add('j_blueprint'); add('j_poke_inteleon');
  r = playKeys(['S_A']);
  ok(near(r.mult, 4), 'Blueprint + Inteleon: the target gets X2 twice (X4)', r);
  ok(it && /X2 /.test(lines(it)) && /leftmost/.test(lines(it)), 'the tooltip says X2 and the tie rule', lines(it));
});

// ------------------------------------------------------------------- evolution by rounds (5 then 5), the perk once, Energy carried
sec('evolution: Scorbunny', () => {
  start('ST8E1');
  const d0 = G.GAME.round_resets.discards;
  const s = add('j_poke_scorbunny');
  ok(/Evolves after \{C:attention,s:0\.8\}5/.test(lines(s)), 'Scorbunny\'s footer: (Evolves after 5 rounds)', lines(s));
  increment_energy(s, 'Fire');
  ok(ex(s).energy_count === 1 && near(ex(s).mult, 4.2), '1 Fire Energy: +4.2 a discard', ex(s));
  for (let r = 1; r <= 4; r++) nextRound();
  flush();
  ok(key(s) === 'j_poke_scorbunny' && ex(s).rounds === 1, 'after 4 rounds: still Scorbunny (1 to go)', [key(s), ex(s).rounds]);
  nextRound(); flush();
  ok(key(s) === 'j_poke_raboot' && ex(s).rounds === 5 && near(ex(s).mult, 7) && ex(s).energy_count === 1, 'after the 5th: Raboot, its Energy re-applied (+7), 5 rounds to go', [key(s), ex(s)]);
  ok(G.GAME.round_resets.discards === d0 + 1 && cr().discards_left === d0 + 1, 'the +1 discard carries over once (not twice)', [d0, G.GAME.round_resets.discards, cr().discards_left]);
  let r = playKeys(['S_2']);
  ok(near(r.mult, 1 + 7 * 5), 'energized Raboot, 5 left: +35 Mult', r);
  for (let k = 1; k <= 5; k++) nextRound();
  flush();
  ok(key(s) === 'j_poke_cinderace' && near(ex(s).Xmult_mod, 0.6) && ex(s).energy_count === 1, 'after 5 more: Cinderace, Energy carried (X0.6 a discard)', [key(s), ex(s)]);
  ok(G.GAME.round_resets.discards === d0 + 1, 'still +1 discard', G.GAME.round_resets.discards);
  r = playKeys(['S_2']);
  ok(near(r.mult, 1 + 0.6 * 5), 'energized Cinderace, 5 left: X4', r);
});
sec('evolution: Sobble', () => {
  start('ST8E2');
  const h0 = G.GAME.round_resets.hands;
  const s = add('j_poke_sobble');
  ok(/Evolves after \{C:attention,s:0\.8\}5/.test(lines(s)), 'Sobble\'s footer: (Evolves after 5 rounds)', lines(s));
  increment_energy(s, 'Water');
  ok(near(ex(s).chips, 26), '1 Water Energy: +26 a card', ex(s));
  for (let r = 1; r <= 5; r++) nextRound();
  flush();
  ok(key(s) === 'j_poke_drizzile' && ex(s).rounds === 5 && near(ex(s).chips, 45.5), 'after 5 rounds: Drizzile, Energy re-applied (+45.5)', [key(s), ex(s)]);
  ok(G.GAME.round_resets.hands === h0 + 1, 'the +1 hand carries over once', [h0, G.GAME.round_resets.hands]);
  let r = playKeys(['S_2', 'H_2', 'S_5']);
  ok(near(r.chips, 14 + 45.5), 'energized Drizzile, 1 kicker: +45.5 Chips', r);
  for (let k = 1; k <= 5; k++) nextRound();
  flush();
  ok(key(s) === 'j_poke_inteleon' && near(ex(s).Xmult_multi, 2.1) && ex(s).energy_count === 1, 'after 5 more: Inteleon, Energy carried (X2.1)', [key(s), ex(s)]);
  ok(G.GAME.round_resets.hands === h0 + 1, 'still +1 hand', G.GAME.round_resets.hands);
  r = playKeys(['S_2']);
  ok(near(r.mult, 2.1), 'energized Inteleon: X2.1 on its target', r);
});

// ------------------------------------------------------------------- Energy: the main number only, 3 times each
sec('energy', () => {
  const cases = [['scorbunny', 'Fire', 'mult', [4.2, 5.4, 6.6]], ['raboot', 'Fire', 'mult', [7, 9, 11]], ['cinderace', 'Fire', 'Xmult_mod', [0.6, 0.7, 0.8]],
    ['sobble', 'Water', 'chips', [26, 32, 38]], ['drizzile', 'Water', 'chips', [45.5, 56, 66.5]], ['inteleon', 'Water', 'Xmult_multi', [2.1, 2.2, 2.3]]];
  for (const [n, t, f, vals] of cases) {
    start('ST8N' + n);
    const j = add('j_poke_' + n);
    const fixed = JSON.stringify([ex(j).d_size, ex(j).hands, ex(j).rounds]);
    for (let i = 0; i < 3; i++) {
      increment_energy(j, t);
      ok(near(ex(j)[f], vals[i]), n + ': ' + (i + 1) + ' ' + t + ' Energy -> ' + f + ' ' + vals[i], ex(j)[f]);
    }
    ok(JSON.stringify([ex(j).d_size, ex(j).hands, ex(j).rounds]) === fixed, n + ': the perk and the timer are untouched', [fixed, ex(j)]);
  }
  // the energized numbers, fired
  start('ST8N2');
  const s = add('j_poke_scorbunny');
  for (let i = 0; i < 3; i++) increment_energy(s, 'Fire');
  let r = playKeys(['S_2']);
  ok(near(r.mult, 1 + 6.6 * 5), 'Scorbunny with 3 Energy, 5 left: +33 Mult', r);
  ok(/\+6\.6\{/.test(lines(s)) && /\+33\{/.test(lines(s)), 'its tooltip: +6.6 a discard, currently +33', lines(s));
  start('ST8N3');
  const c = add('j_poke_cinderace');
  for (let i = 0; i < 3; i++) increment_energy(c, 'Fire');
  r = playKeys(['S_2']);
  ok(near(r.mult, 1 + 0.8 * 5), 'Cinderace with 3 Energy, 5 left: X5', r);
  start('ST8N4');
  const d = add('j_poke_drizzile');
  for (let i = 0; i < 3; i++) increment_energy(d, 'Water');
  r = playKeys(['S_2', 'H_2', 'S_5', 'C_7']);
  ok(near(r.chips, 14 + 2 * 66.5), 'Drizzile with 3 Energy, 2 kickers: +133 Chips', r);
  start('ST8N5');
  const it = add('j_poke_inteleon');
  for (let i = 0; i < 3; i++) increment_energy(it, 'Water');
  r = playKeys(['S_A']);
  ok(near(r.mult, 2.3), 'Inteleon with 3 Energy: X2.3', r);
  // a mismatched type: only Colorless works (half strength)
  start('ST8N6');
  const sb = add('j_poke_sobble');
  increment_energy(sb, 'Fire');
  ok(near(ex(sb).chips, 20) && !ex(sb).energy_count, 'Fire Energy on Sobble: nothing', ex(sb));
  increment_energy(sb, 'Colorless');
  ok(near(ex(sb).chips, 23), 'Colorless Energy on Sobble: half strength, +23', ex(sb));
});

// ------------------------------------------------------------------- the Starter Pack
sec('starter pack', () => {
  start('ST8SP');
  let L = starter_lists();
  ok(L.fire.includes('j_poke_scorbunny') && !L.fire.includes('j_poke_raboot') && !L.fire.includes('j_poke_cinderace'), 'Scorbunny is a Fire starter (the Starter Pack); Raboot / Cinderace are not', L.fire);
  ok(L.water.includes('j_poke_sobble') && !L.water.includes('j_poke_drizzile') && !L.water.includes('j_poke_inteleon'), 'Sobble is a Water starter; Drizzile / Inteleon are not', L.water);
  ok(!L.grass.includes('j_poke_scorbunny') && !L.water.includes('j_poke_scorbunny') && !L.fire.includes('j_poke_sobble'), 'each in its own type\'s slot only');
  // every OTHER Fire / Water starter's family already seen (used_jokers): the pack's Fire slot must be Scorbunny, the Water slot Sobble
  for (const k of [...L.fire, ...L.water]) if (k !== 'j_poke_scorbunny' && k !== 'j_poke_sobble') G.GAME.used_jokers[k] = true;
  L = starter_lists();
  ok(JSON.stringify(L.fire) === '["j_poke_scorbunny"]' && JSON.stringify(L.water) === '["j_poke_sobble"]', 'with the others\' families seen, only Scorbunny / Sobble are left', [L.fire, L.water]);
  G.GAME.chips = G.GAME.blind.chips;
  clearHand(); play(hand(['S_2']), { keepChips: true }); flush();
  act({ type: 'cash_out' }); flush();
  ok(G.STATE === STATES.SHOP, 'in the shop');
  const pack = new Card(P_CARDS.empty, P_CENTERS.p_poke_pokepack_starter_pack);
  G.shop_booster.emplace(pack);
  G.GAME.dollars = 2000;
  ok(act({ type: 'buy', id: pack.sort_id }).ok && G.STATE === STATES.MOD_PACK, 'a Starter Pack opens');
  const ks = G.pack_cards.cards.map(key);
  ok(ks[1] === 'j_poke_scorbunny' && ks[2] === 'j_poke_sobble', 'its Fire slot is Scorbunny and its Water slot Sobble', ks);
  ok(act({ type: 'use', id: G.pack_cards.cards[1].sort_id }).ok && G.jokers.cards.some((j) => key(j) === 'j_poke_scorbunny'), 'picked: Scorbunny joins the jokers');
  // a Raboot already seen: the line's family is present, so no Scorbunny
  start('ST8SP2');
  G.GAME.used_jokers.j_poke_raboot = true;
  ok(!starter_lists().fire.includes('j_poke_scorbunny'), 'a Raboot seen this run: Scorbunny leaves the Starter Pack (no family twice)');
});

// ------------------------------------------------------------------- the in-game texts
sec('texts', () => {
  start('ST8T');
  const T = {};
  for (const n of ALL) { const j = add('j_poke_' + n); T[n] = plain(j); j.remove(); flush(); }
  const want = {
    scorbunny: '+1 discard | +3 Mult for each | remaining discard | (Currently +15 Mult) | (Evolves after 5 rounds)',
    raboot: '+1 discard | +5 Mult for each | remaining discard | (Currently +25 Mult) | (Evolves after 5 rounds)',
    cinderace: '+1 discard | Libero: X1 Mult, plus | X0.5 for each | remaining discard | (Currently X3.5 Mult)',
    sobble: '+1 hand | Each played card that | doesn\'t score gives | +20 Chips | (Evolves after 5 rounds)',
    drizzile: '+1 hand | Each played card that | doesn\'t score gives | +35 Chips | (Evolves after 5 rounds)',
    inteleon: '+1 hand | Snipe Shot: the | highest-ranked scored card | gives X2 Mult | (A tie: the leftmost)',
  };
  // (each held alone: the Red Deck's 4 discards + its own = 5 left: +15 / +25 / X3.5)
  for (const n of ALL) ok(T[n].replace(/\| /g, '| ').trim() === want[n].replace(/\s+/g, ' '), n + ': its text', [T[n], want[n]]);
});

done();
