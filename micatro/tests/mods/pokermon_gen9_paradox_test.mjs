// Gen 9, batch 3: the Paradox Pokémon (contentRev 78+; jokers/pokejokers_designs.js, mods/pokermon/paradox.js; PORTING.md "Gen 9, batch 3").
// The owner's "yes" (2026-11-03): "paradox, ancient and future need to be tags like safari. i want a pokeball card that gives you a paradox
// pokemon and an ancient pack type and a future pack type for paradox pokemon as well."
//   - the Paradox rarity ('poke_paradox', weight 0: Safari's way) + a second pill, Ancient or Future (describe's badges; the tooltip's pills are
//     pinned in a real browser by overworld/tests/micatro_pokermon_paradox_ui_test.mjs);
//   - the 20 jokers, each played alone through real hands, its boost off and on: Protosynthesis (Ancient, while it's sunny) and Quark Drive
//     (Future, on Electric Terrain: more Diamonds than any other suit on the round's first deal), both read from real first deals;
//   - never a shop roll, never a Poké Ball's / Transformation's; the Paradox Ball makes one (a Joker slot needed);
//   - the Ancient / Future Packs (Normal x2, Jumbo, Mega) open on the pack screen with only their era's jokers, all different, and give one;
//   - Energy (the standard shares; the boost on top), save / resume + the replay stepper, and the art (every cell's type, the composed art).
//   node micatro/tests/mods/pokermon_gen9_paradox_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { P_CARDS, create_card } from '../../js/engine/core.js';
import { create_card_for_shop } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { Session } from '../../js/engine/session.js';
import { MODS, RARITIES } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { get_random_poke_key } from '../../mods/pokermon/systems/pools.js';
import { electric_terrain, is_electric_terrain, paradox_boosted, PARADOX_ERAS, PARADOX_COLOUR } from '../../mods/pokermon/jokers/pokejokers_designs.js';
import { paradox_keys } from '../../mods/pokermon/paradox.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { if (process.env.PX_TRACE) console.log('--', name); try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const cr = () => G.GAME.current_round;
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (never the round's last hand) -> {mult, chips}. */
function play(list, { left } = {}) {
  clearHand();
  const cs = cards(list);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (left !== undefined) cr().hands_left = left; else if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips) };
}
function endRound() {
  clearHand(); const c = cards(['S_2']);
  G.GAME.chips = G.GAME.blind.chips;
  if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
}
/** Win the round, then select the next Blind with every deck card turned to `suit` (null: as it is) -> the real first deal reads it. */
function nextRound(suit) {
  endRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  if (suit) for (const c of G.playing_cards) c.set_base(P_CARDS[suit[0] + '_' + (c.base.value === '10' ? 'T' : c.base.id > 10 ? ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[c.base.id] : String(c.base.id))]);
  act({ type: 'select_blind' }); flush();
}
const SUIT = { sunny: 'H', terrain: 'D', none: 'S' };
/** Force a boost state directly (the per-joker checks; the real reads are pinned in 'weather'). */
function force(j, on) {
  const e = ex(j);
  e.sunread_round = e.terrainread_round = G.GAME.round;
  e.sun_round = e.terrain_round = on ? G.GAME.round : -1;
}
const NAMES = ['great_tusk', 'scream_tail', 'brute_bonnet', 'flutter_mane', 'slither_wing', 'sandy_shocks', 'iron_treads', 'iron_bundle', 'iron_hands', 'iron_jugulis',
  'iron_moth', 'iron_thorns', 'roaring_moon', 'iron_valiant', 'walking_wake', 'iron_leaves', 'gouging_fire', 'raging_bolt', 'iron_boulder', 'iron_crown'];
const WANT = {
  great_tusk: ['ancient', 'Earth'], scream_tail: ['ancient', 'Fairy'], brute_bonnet: ['ancient', 'Dark'], flutter_mane: ['ancient', 'Psychic'], slither_wing: ['ancient', 'Grass'],
  sandy_shocks: ['ancient', 'Lightning'], iron_treads: ['future', 'Metal'], iron_bundle: ['future', 'Water'], iron_hands: ['future', 'Fighting'], iron_jugulis: ['future', 'Dark'],
  iron_moth: ['future', 'Fire'], iron_thorns: ['future', 'Lightning'], roaring_moon: ['ancient', 'Dark'], iron_valiant: ['future', 'Fairy'], walking_wake: ['ancient', 'Water'],
  iron_leaves: ['future', 'Grass'], gouging_fire: ['ancient', 'Fire'], raging_bolt: ['ancient', 'Lightning'], iron_boulder: ['future', 'Earth'], iron_crown: ['future', 'Metal'],
};
/** WCAG contrast of white text on a hex colour. */
const contrast = (hex) => {
  const ch = (i) => { const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
  return 1.05 / (L + 0.05);
};

// ------------------------------------------------------------------- the pin, the rarity and the twenty centers
await sec('static', () => {
  ok(MODS.pokermon.contentRev >= 78 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 78+ (Gen 9 batch 3)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  const R = RARITIES.poke_paradox;
  ok(R && R.name === 'Paradox' && R.weight === 0 && R.badge_colour === PARADOX_COLOUR && RARITIES.poke_safari.weight === 0, 'the Paradox rarity: registered like Safari, weight 0, its own badge colour', R);
  for (const [n, [era, t]] of Object.entries(WANT)) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c && c.rarity === 'poke_paradox' && c.cost === 7 && c.stage === 'Basic' && c.ptype === t && c.gen === 9 && c.poke_paradox === era && c.blueprint_compat === true && !c.unported,
      `${n}: Paradox $7, Basic, ${t}, Gen 9, ${era}, Blueprint-compatible`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen, c.poke_paradox]);
  }
  ok(paradox_keys('ancient').length === 10 && paradox_keys('future').length === 10, 'ten Ancient, ten Future');
  for (const hex of [PARADOX_COLOUR, PARADOX_ERAS.ancient.colour, PARADOX_ERAS.future.colour]) ok(contrast(hex) >= 4.5, `pill colour ${hex}: white text contrast ${contrast(hex).toFixed(2)} >= 4.5`);
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key.replace('j_poke_', ''));
  const chain = (list) => list.every((n, i) => i === 0 || keys.indexOf(n) === keys.indexOf(list[i - 1]) + 1);
  ok(chain(['kingambit', 'great_tusk', 'scream_tail', 'brute_bonnet', 'flutter_mane', 'slither_wing', 'sandy_shocks', 'iron_treads', 'iron_bundle', 'iron_hands', 'iron_jugulis', 'iron_moth', 'iron_thorns', 'gimmighoul']),
    'Pokédex order: Kingambit (983) > Great Tusk (984) ... Iron Thorns (995) > Gimmighoul (999)', keys.slice(keys.indexOf('kingambit'), keys.indexOf('kingambit') + 14));
  ok(chain(['roaring_moon', 'iron_valiant', 'walking_wake', 'iron_leaves']) && chain(['gouging_fire', 'raging_bolt', 'iron_boulder', 'iron_crown']) && keys.indexOf('roaring_moon') > keys.indexOf('gholdengo')
    && keys.indexOf('gouging_fire') > keys.indexOf('iron_leaves') && keys.indexOf('iron_crown') < keys.indexOf('missingno'),
    'Pokédex order: Gholdengo (1000) < Roaring Moon (1005) > Iron Valiant > Walking Wake > Iron Leaves (1010) < Gouging Fire (1020) > Raging Bolt > Iron Boulder > Iron Crown (1023)');
  ok(['sun_round', 'sunread_round', 'terrain_round', 'terrainread_round', 'd_size', 'poke_paradox'].every((f) => !(f in energy_values)), 'the weather reads and the discard are no energy fields');
  // the pills: Paradox (the rarity), then the era, then the type
  start('PXBADGE');
  for (const n of ['great_tusk', 'iron_treads']) {
    const j = add('j_poke_' + n), b = describe(j).badges, [era, t] = WANT[n];
    ok(b[0].label === 'Paradox' && b[0].colour === PARADOX_COLOUR && b[1].label === PARADOX_ERAS[era].name && b[1].colour === PARADOX_ERAS[era].colour && b[2].label === t,
      `${n}: pills Paradox, ${PARADOX_ERAS[era].name}, ${t}`, b);
  }
});

// ------------------------------------------------------------------- the weather: real first deals
await sec('weather', () => {
  start('PXWEATHER');
  const gt = add('j_poke_great_tusk'), it = add('j_poke_iron_treads');
  ok(!paradox_boosted(gt) && !paradox_boosted(it) && /Not sunny yet/.test(plain(gt)) && /No Electric Terrain yet/.test(plain(it)), 'gained mid-round: no read yet, no boost', [plain(gt), plain(it)]);
  nextRound('H');
  ok(paradox_boosted(gt) && !paradox_boosted(it) && /Sunny: boosted!/.test(plain(gt)), 'an all-Hearts first deal: sunny (Protosynthesis on), no Electric Terrain', [ex(gt), ex(it)]);
  let r = play(['S_5', ['S_6', 'm_stone']]);
  ok(near(r.mult, 1.45), 'sunny Great Tusk: the Stone card X1.45', r.total);
  r = play(['S_5']);
  ok(near(r.chips, 5 + 5 + 100), 'Iron Treads not boosted: +100 Chips', r.total);
  nextRound('D');
  ok(paradox_boosted(gt) && paradox_boosted(it) && is_electric_terrain(it), 'an all-Diamonds first deal: sunny too (red) and Electric Terrain', [ex(gt), ex(it)]);
  r = play(['S_5']);
  ok(near(r.chips, 5 + 5 + 150), 'Electric Terrain Iron Treads: +150 Chips', r.total);
  nextRound('S');
  ok(!paradox_boosted(gt) && !paradox_boosted(it) && /Not sunny\b/.test(plain(gt)) && /No Electric Terrain\b/.test(plain(it)), 'an all-Spades first deal: neither', [plain(gt), plain(it)]);
  r = play(['S_5', ['S_6', 'm_stone']]);
  ok(near(r.mult, 1.3), '... Great Tusk X1.3', r.total);
  // the terrain rule itself: strictly more Diamonds than any other suit; Wild counts for all
  const C = (ks, enh) => hand(ks, enh ? { center: enh } : {});
  clearHand();
  ok(electric_terrain(C(['D_2', 'D_3', 'H_4', 'S_5'])) === true, '2 Diamonds vs 1 each: Electric Terrain');
  clearHand();
  ok(electric_terrain(C(['D_2', 'D_3', 'H_4', 'H_5'])) === false, 'a tie for the top: not');
  clearHand();
  ok(electric_terrain([...C(['D_2', 'C_3']), ...C(['S_4'], 'm_wild')]) === false, 'a Wild card counts for every suit (1+1 vs 1+1): not');
  clearHand();
  ok(electric_terrain(C(['S_2'], 'm_stone')) === false, 'a Stone card has no suit');
  clearHand();
  // Volcarona: always sunny (live)
  const v = add('j_poke_volcarona');
  ok(paradox_boosted(gt) && !paradox_boosted(it), 'Volcarona held: sunny for an Ancient (live), no terrain');
  act({ type: 'sell', id: v.sort_id }); flush();
  ok(!paradox_boosted(gt), 'sold: not sunny');
  // Blueprint copies a boosted joker at its boosted value; the Blueprint never reads the weather itself
  nextRound('D');
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(it), 0, bp);
  r = play(['S_5']);
  ok(near(r.chips, 5 + 5 + 300), 'Blueprint copies the boosted +150', r.total);
});

// ------------------------------------------------------------------- each joker alone, its boost off and on
/** [joker, a hand (and options), the result off, the result on, which number] */
const CASES = [
  ['great_tusk', ['S_5', ['S_6', 'm_stone']], 1.3, 1.45, 'mult'],
  ['scream_tail', ['S_5', 'H_5'], 2 + 6, 2 + 9, 'mult'],                      // a Pair: 2 Mult, one Spade scored
  ['brute_bonnet', ['H_5'], 1 + 25, 1 + 37.5, 'mult'],
  ['flutter_mane', ['H_5'], 2, 2.5, 'mult'],
  ['slither_wing', ['H_5', 'H_6'], 1.2 * 1.2, 1.3 * 1.3, 'mult'],          // High Card: only the 6 scores? (no: High Card scores its top card)
  ['iron_treads', ['S_5'], 5 + 5 + 100, 5 + 5 + 150, 'chips'],
  ['iron_hands', ['S_K', 'H_K'], 2 * 1.25 * 1.25, 2 * 1.375 * 1.375, 'mult'],
  ['iron_jugulis', ['S_5'], 2, 2.5, 'mult'],
  ['iron_moth', ['D_5', 'S_5'], 2 * 1.2, 2 * 1.3, 'mult'],
  ['iron_thorns', [['S_5', 'm_stone']], 5 + 50 + 30, 5 + 50 + 45, 'chips'],
  ['iron_valiant', ['S_Q', 'H_Q'], 2 * 1.2 * 1.2, 2 * 1.3 * 1.3, 'mult'],
  ['walking_wake', ['C_5', 'S_5'], 2 * 1.2, 2 * 1.3, 'mult'],
  ['iron_leaves', ['C_5', 'S_5'], 2 * 1.2, 2 * 1.3, 'mult'],
  ['iron_crown', ['S_5', 'H_5'], 2 * 1.2, 2 * 1.3, 'mult'],
  ['iron_boulder', ['S_5', 'H_5'], 2 * 2, 2 * 2.5, 'mult'],                   // only the first scored 5
];
await sec('jokers', () => {
  for (const [n, list, off, on, field] of CASES) {
    start('PX' + n.toUpperCase());
    const j = add('j_poke_' + n);
    force(j, false);
    const a = play(list);
    force(j, true);
    const b = play(list);
    // (High Card scores one card: Slither Wing's Hearts H_5 + H_6 -> only the 6 scores)
    const offW = n === 'slither_wing' ? 1.2 : off, onW = n === 'slither_wing' ? 1.3 : on;
    ok(near(a[field], offW) && near(b[field], onW), `${n}: ${field} ${offW} -> boosted ${onW}`, [a.total, b.total]);
    ok(/Protosynthesis|Quark Drive/.test(plain(j)), `${n}: its text names its boost`, plain(j));
  }
  // Sandy Shocks: +20 Chips per Steel card in the full deck (3 Steels: +60; boosted +90)
  start('PXSANDY');
  for (const c of G.playing_cards.slice(0, 3)) c.set_ability(P_CENTERS.m_steel, null, true);
  const ss = add('j_poke_sandy_shocks');
  force(ss, false); let a = play(['S_5']);
  force(ss, true); let b = play(['S_5']);
  ok(near(a.chips, 10 + 60) && near(b.chips, 10 + 90) && /Currently \+90 Chips/.test(plain(ss)), 'Sandy Shocks: 3 Steels +60 Chips, sunny +90', [a.total, b.total, plain(ss)]);
  // Roaring Moon: +4 Mult per Straight played this run (a Straight Flush counts; the hand being played counts at once)
  start('PXMOON');
  const rm = add('j_poke_roaring_moon');
  force(rm, false);
  a = play(['S_5']);
  ok(near(a.mult, 1), 'Roaring Moon, no Straight yet: nothing', a.total);
  a = play(['S_2', 'H_3', 'S_4', 'S_5', 'S_6']);
  ok(near(a.mult, 4 + 4), 'a Straight: it counts at once (+4)', a.total);
  a = play(['H_2', 'H_3', 'H_4', 'H_5', 'H_6']);
  ok(near(a.mult, 8 + 8), 'a Straight Flush counts too (+8)', a.total);
  force(rm, true); b = play(['S_5']);
  ok(near(b.mult, 1 + 12) && /Currently 2: \+12 Mult/.test(plain(rm)), 'sunny: +6 each (+12)', [b.total, plain(rm)]);
  // Gouging Fire: +1 discard each round, X1.5 (sunny X1.75)
  start('PXGOUGE');
  const d0 = G.GAME.round_resets.discards, dl = cr().discards_left;
  const gf = add('j_poke_gouging_fire');
  ok(G.GAME.round_resets.discards === d0 + 1 && cr().discards_left === dl + 1, 'Gouging Fire: +1 discard (now and each round)');
  force(gf, false); a = play(['S_5']);
  force(gf, true); b = play(['S_5']);
  ok(near(a.mult, 1.5) && near(b.mult, 1.75), 'X1.5, sunny X1.75', [a.total, b.total]);
  act({ type: 'sell', id: gf.sort_id }); flush();
  ok(G.GAME.round_resets.discards === d0, 'sold: the discard goes back');
  // Raging Bolt: X1 + X0.25 per hand left, this one included (4 left before: X2; the last hand X1.25); sunny X0.375 each
  start('PXBOLT');
  const rb = add('j_poke_raging_bolt');
  force(rb, false);
  a = play(['S_5'], { left: 4 });
  force(rb, true); b = play(['S_5'], { left: 4 });
  force(rb, false);
  const last = play(['S_5'], { left: 1 }); // (the round's last hand: the run ends here)
  ok(near(a.mult, 2) && near(last.mult, 1.25) && near(b.mult, 2.5), 'Raging Bolt: 4 hands left X2, the last hand X1.25, sunny with 4 X2.5', [a.total, last.total, b.total]);
  // Iron Bundle: at end of round a Tarot or Planet (room needed), never boosted
  start('PXBUNDLE');
  add('j_poke_iron_bundle');
  const n0 = G.consumeables.cards.length;
  endRound();
  const got = G.consumeables.cards.slice(n0).map((c) => c.ability.set);
  ok(got.length === 1 && (got[0] === 'Tarot' || got[0] === 'Planet'), 'Iron Bundle: one Tarot or Planet at end of round', got);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); flush();
  while (G.consumeables.cards.length < G.consumeables.config.card_limit) G.consumeables.emplace(create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool'));
  const full = G.consumeables.cards.length;
  endRound();
  ok(G.consumeables.cards.length === full, 'no room: nothing', G.consumeables.cards.length);
  const sets = new Set();
  for (let i = 0; i < 12; i++) {
    for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); }
    act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); flush();
    endRound();
    for (const c of G.consumeables.cards) sets.add(c.ability.set);
  }
  ok(sets.has('Tarot') && sets.has('Planet') && sets.size === 2, 'over rounds both Tarots and Planets come', [...sets]);
});

// ------------------------------------------------------------------- never in the shop, never a Poké Ball's
await sec('pools', () => {
  start('PXSHOP');
  let seen = 0, paradox = 0;
  for (let i = 0; i < 1500; i++) {
    const c = create_card_for_shop(G.shop_jokers);
    if (c.ability.set === 'Joker') { seen++; if (c.config.center.rarity === 'poke_paradox') paradox++; }
    G.shop_jokers.remove_card(c);
  }
  ok(seen > 500 && paradox === 0, `${seen} shop jokers rolled: no Paradox`, paradox);
  let bad = 0;
  for (let i = 0; i < 400; i++) { const k = get_random_poke_key('pxball' + i, 'Basic'); if (P_CENTERS[k].rarity === 'poke_paradox') bad++; }
  ok(bad === 0, 'a Poké Ball (any Basic) never rolls a Paradox', bad);
  for (let i = 0; i < 200; i++) { const k = get_random_poke_key('pxany' + i); if (P_CENTERS[k].rarity === 'poke_paradox') bad++; }
  ok(bad === 0, 'nor an any-stage roll (Transformation, illusions)', bad);
  for (let i = 0; i < 300; i++) { const c = create_card('Joker', G.jokers, null, 0.99, true, null, null, 'pxrare' + i); if (c.config.center.rarity === 'poke_paradox') bad++; c.remove(); }
  ok(bad === 0, 'nor a rarity roll (Rare: Wraith / Judgement style)', bad);
  // the packs and the ball are in their pools (Gen 9 on), weights as decided
  const P = (k) => P_CENTERS['p_poke_pokepack_' + k];
  ok(['ancient', 'future'].every((e) => P(e + '_normal').weight === 0.3 && P(e + '_normal_2').weight === 0.3 && P(e + '_jumbo').weight === 0.3 && P(e + '_mega').weight === 0.075
    && P(e + '_normal').cost === 4 && P(e + '_jumbo').cost === 6 && P(e + '_mega').cost === 8 && P(e + '_normal').in_pool() === true), 'packs: weights 0.3 / 0.3 / 0.3 / 0.075, $4 / $6 / $8, in the pool');
  const ball = P_CENTERS.c_poke_paradoxball;
  ok(ball.set === 'Item' && ball.cost === 4 && ball.weight === 3 && ball.in_pool(ball) === true, 'the Paradox Ball: an Item, $4, weight 3, in the pool');
  start('PXGEN', { gen_nine: false });
  ok(P('ancient_normal').in_pool() === false && ball.in_pool(ball) === false, 'Gen 9 off: neither the packs nor the ball');
  start('PXNOBALL', { pokeballs: false });
  ok(ball.in_pool(ball) === false, 'the pokeballs option off: no Paradox Ball');
});

// ------------------------------------------------------------------- the Paradox Ball
await sec('ball', () => {
  start('PXBALL');
  const b = add('c_poke_paradoxball');
  ok(/Create a random Paradox Joker card/.test(plain(b)), 'its text', plain(b));
  const n0 = G.jokers.cards.length;
  let r = act({ type: 'use', id: b.sort_id, targets: [] }); flush();
  const made = G.jokers.cards.slice(n0);
  ok(r.ok !== false && made.length === 1 && made[0].config.center.rarity === 'poke_paradox' && !G.consumeables.cards.includes(b), 'used: one Paradox joker', made.map(key));
  // seeded: the same seed makes the same one
  start('PXBALL');
  const b2 = add('c_poke_paradoxball');
  act({ type: 'use', id: b2.sort_id, targets: [] }); flush();
  ok(key(G.jokers.cards[G.jokers.cards.length - 1]) === key(made[0]), 'seeded: the same run makes the same one');
  // over seeds: both eras
  const eras = new Set();
  for (let i = 0; i < 16; i++) { start('PXBALLS' + i); const x = add('c_poke_paradoxball'); act({ type: 'use', id: x.sort_id, targets: [] }); flush(); eras.add(G.jokers.cards[G.jokers.cards.length - 1].config.center.poke_paradox); }
  ok(eras.has('ancient') && eras.has('future'), 'Ancient and Future both come out', [...eras]);
  // full joker slots: refused, the ball stays
  start('PXBALLFULL');
  while (G.jokers.cards.length < G.jokers.config.card_limit) add('j_joker');
  const b3 = add('c_poke_paradoxball');
  r = act({ type: 'use', id: b3.sort_id, targets: [] }); flush();
  ok(r.ok === false && G.consumeables.cards.includes(b3) && G.jokers.cards.length === G.jokers.config.card_limit, 'no Joker slot: refused, kept', r);
});

// ------------------------------------------------------------------- the Ancient / Future Packs
await sec('packs', () => {
  for (const era of ['ancient', 'future']) {
    for (const [v, size, choose] of [['normal', 2, 1], ['normal_2', 2, 1], ['jumbo', 4, 1], ['mega', 4, 2]]) {
      start('PXPACK' + era + v);
      endRound(); act({ type: 'cash_out' }); flush();
      ok(G.STATE === STATES.SHOP, 'in the shop');
      G.GAME.dollars = 100;
      const p = create_card('Booster', G.shop_booster, null, null, null, null, 'p_poke_pokepack_' + era + '_' + v);
      G.shop_booster.emplace(p); flush();
      const d0 = G.GAME.dollars;
      act({ type: 'buy', id: p.sort_id }); flush();
      const pc = G.pack_cards.cards;
      const view = toView();
      ok(G.STATE === STATES.MOD_PACK && pc.length === size && G.GAME.pack_choices === choose && G.GAME.dollars === d0 - p.cost,
        `${era} ${v}: opens on the pack screen, ${size} cards, choose ${choose}, $${p.cost}`, [G.STATE, pc.length, G.GAME.pack_choices]);
      ok(pc.every((c) => c.config.center.rarity === 'poke_paradox' && c.config.center.poke_paradox === era) && new Set(pc.map(key)).size === pc.length,
        `${era} ${v}: only ${era} Paradox jokers, all different`, pc.map(key));
      ok(view.pack_kind === PARADOX_ERAS[era].name && view.pack_colours && view.pack_colours.colour, `${era} ${v}: the pack screen names it "${PARADOX_ERAS[era].name} Pack" in its colours`, [view.pack_kind, view.pack_colours]);
      const n0 = G.jokers.cards.length, pick = pc[0], pk = key(pick);
      act({ type: 'use', id: pick.sort_id, targets: [] }); flush();
      ok(G.jokers.cards.length === n0 + 1 && key(G.jokers.cards[n0]) === pk, `${era} ${v}: taking one puts it in the Joker row`);
      if (choose === 1) ok(G.STATE === STATES.SHOP, `${era} ${v}: chosen, back to the shop`, G.STATE);
    }
  }
  // the held ones aren't offered again (pokemon_in_pool): hold 8 of the 10 Ancients, a Jumbo shows the other 2 first
  start('PXPACKHELD');
  const anc = paradox_keys('ancient');
  G.jokers.config.card_limit = 20;
  for (const k of anc.slice(0, 8)) add(k);
  endRound(); act({ type: 'cash_out' }); flush();
  G.GAME.dollars = 100;
  const p = create_card('Booster', G.shop_booster, null, null, null, null, 'p_poke_pokepack_ancient_jumbo'); G.shop_booster.emplace(p); flush();
  act({ type: 'buy', id: p.sort_id }); flush();
  const got = G.pack_cards.cards.map(key);
  ok(got.length === 4 && got.slice(0, 2).every((k) => anc.slice(8).includes(k)) && got.every((k) => anc.includes(k)), 'the two not held come first; then the pool runs dry and any Ancient fills it', got);
  ok(/Choose 1 of up to 4 Ancient Paradox Joker cards/.test(describe(p).lines.join(' ').replace(/\{[^}]*\}/g, '')), 'its text', describe(p).lines);
});

// ------------------------------------------------------------------- Energy (the standard shares; the boost on top)
await sec('energy', () => {
  const steps = (n, field, want, type) => {
    start('PXEN' + n);
    const j = add('j_poke_' + n);
    const got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(Math.round(ex(j)[field] * 1e9) / 1e9); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  steps('great_tusk', 'Xmult_multi', [1.365, 1.43, 1.495], 'Earth');
  steps('scream_tail', 'mult', [8.4, 10.8, 13.2], 'Fairy');
  const bb = steps('brute_bonnet', 'mult', [35, 45, 55], 'Dark');
  force(bb, true);
  let r = play(['H_5']);
  ok(near(r.mult, 1 + 82.5), 'energized + sunny Brute Bonnet: +55 x1.5 = +82.5 (the boost on top)', r.total);
  const fm = steps('flutter_mane', 'Xmult', [2.4, 2.8, 3.2], 'Psychic');
  force(fm, true);
  r = play(['H_5']);
  ok(near(r.mult, 4.3), 'energized + sunny Flutter Mane: X3.2 -> X4.3', r.total);
  steps('slither_wing', 'Xmult_multi', [1.26, 1.32, 1.38], 'Grass');
  steps('sandy_shocks', 'chips', [26, 32, 38], 'Lightning');
  steps('iron_treads', 'chips', [130, 160, 190], 'Metal');
  steps('iron_hands', 'Xmult_multi', [1.3125, 1.375, 1.4375], 'Fighting');
  steps('iron_jugulis', 'Xmult', [2.4, 2.8, 3.2], 'Dark');
  steps('iron_moth', 'Xmult_multi', [1.26, 1.32, 1.38], 'Fire');
  steps('iron_thorns', 'chips', [39, 48, 57], 'Lightning');
  steps('roaring_moon', 'mult', [5.6, 7.2, 8.8], 'Dark');
  steps('iron_valiant', 'Xmult_multi', [1.26, 1.32, 1.38], 'Fairy');
  steps('walking_wake', 'Xmult_multi', [1.26, 1.32, 1.38], 'Water');
  steps('iron_leaves', 'Xmult_multi', [1.26, 1.32, 1.38], 'Grass');
  const gf = steps('gouging_fire', 'Xmult', [1.8, 2.1, 2.4], 'Fire');
  ok(ex(gf).d_size === 1, 'Gouging Fire: the discard fixed');
  steps('raging_bolt', 'Xmult_mod', [0.3, 0.35, 0.4], 'Lightning');
  steps('iron_boulder', 'Xmult_multi', [2.1, 2.2, 2.3], 'Earth');
  steps('iron_crown', 'Xmult_multi', [1.26, 1.32, 1.38], 'Metal');
  start('PXENBUNDLE');
  const ib = add('j_poke_iron_bundle');
  const before = JSON.stringify(ex(ib));
  increment_energy(ib, 'Water');
  const after = { ...ex(ib) }; delete after.energy_count;
  const b0 = JSON.parse(before); delete b0.energy_count;
  ok(JSON.stringify(after) === JSON.stringify(b0), 'Iron Bundle: no number, Energy-inert');
});

// ------------------------------------------------------------------- save / resume (a run is its recipe)
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'PXRESUME', customDeck: { name: 'Paradox', mods: ['pokermon'], params: { joker_slots: 12, consumable_slots: 10, blind_scaling: 0.05 },
    jokers: [{ key: 'j_poke_great_tusk' }, { key: 'j_poke_iron_treads' }, { key: 'j_poke_roaring_moon' }, { key: 'j_poke_gouging_fire' }, { key: 'j_poke_raging_bolt' }, { key: 'j_poke_iron_bundle' }],
    consumables: [{ key: 'c_poke_paradoxball' }, { key: 'c_poke_paradoxball' }, { key: 'c_poke_metal_energy' }] } });
  flush();
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  for (const p of G.consumeables.cards.slice()) if (key(p) === 'c_poke_paradoxball') must({ type: 'use', id: p.sort_id, targets: [] });
  const me = G.consumeables.cards.find((c) => key(c) === 'c_poke_metal_energy');
  if (me) must({ type: 'use', id: me.sort_id, targets: [] });
  let rounds = 0;
  while (rounds < 5 && G.STATE !== STATES.GAME_OVER) {
    if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
    must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    must({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); rounds++; }
  }
  if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
  const J = (n) => G.jokers.cards.find((c) => key(c) === 'j_poke_' + n);
  const snap = () => [G.jokers.cards.map(key).join(','), ex(J('iron_treads')).chips, ex(J('iron_treads')).energy_count, paradox_boosted(J('great_tusk')), paradox_boosted(J('iron_treads')),
    ex(J('great_tusk')).sun_round, ex(J('iron_treads')).terrain_round, G.consumeables.cards.map(key).join(','), G.GAME.round_resets.discards, G.GAME.dollars, G.GAME.chips];
  const live = snap();
  ok(rounds === 5 && G.jokers.cards.filter((c) => c.config.center.rarity === 'poke_paradox').length === 8 && near(live[1], 130),
    'live, 5 rounds: 2 Paradox Ball jokers made, Iron Treads energized, Iron Bundle made consumables', live);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && JSON.stringify(snap()) === JSON.stringify(live), 'resumed: the Ball\'s jokers, the reads, the Energy, the consumables come back exactly', [r.stoppedAt, snap(), live]);
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); st.seek(st.total);
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(live), 'the replay stepper too', snap());
});

// ------------------------------------------------------------------- the art
if (ART) {
  await sec('cell types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    for (const n of NAMES) {
      const c = P_CENTERS['j_poke_' + n];
      const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasicNatdex', pos: [c.pos.x, c.pos.y] });
      ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.soul_pos && r && r.ptype === WANT[n][1], `${n}: its Natdex cell {${c.pos.x},${c.pos.y}} shows ${WANT[n][1]} (+ its soul)`, r);
    }
    ok(P_CENTERS.j_poke_walking_wake.soul_pos.x === 7 && P_CENTERS.j_poke_iron_leaves.soul_pos.x === 9, "Walking Wake's soul {7,67}, Iron Leaves' {9,67} (their own Pokémon)");
    const size = (f) => { const b = fs.readFileSync(path.join(ART, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    ok(JSON.stringify(size('paradox_ball.png')) === '[142,190]' && JSON.stringify(size('paradox_packs.png')) === '[568,380]', 'the composed art: the ball card 142 x 190, the packs 4 x 2 cells', [size('paradox_ball.png'), size('paradox_packs.png')]);
    ok(P_CENTERS.c_poke_paradoxball.atlas === 'poke_paradox_ball' && MODS.pokermon.content.atlases.poke_paradox_packs && /paradox_packs\.png$/.test(MODS.pokermon.content.atlases.poke_paradox_packs.src)
      && P_CENTERS.p_poke_pokepack_future_mega.atlas === 'poke_paradox_packs' && P_CENTERS.p_poke_pokepack_future_mega.pos.x === 3 && P_CENTERS.p_poke_pokepack_future_mega.pos.y === 1, 'registered atlases + cells');
  });
} else console.log('(Pokermon art not on disk: the art checks are skipped; set MICATRO_MAIN)');

done();
