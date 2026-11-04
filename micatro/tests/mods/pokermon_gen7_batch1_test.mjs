// Gen 7, batch 1 (the owner's "Yes build it and merge when the gate passes", 2026-11-02; jokers/pokejokers_designs.js "Gen 7, batch 1";
// PORTING.md "Gen 7, batch 1"): 19 jokers, #731-756, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8,
// single-stage R $7), in Pokédex order among the Gen 7 jokers Pokermon already has:
//   Pikipek 731 -> Trumbeak -> Toucannon (Colorless)  Multi-hit: each hand hits 2-5 times (seeded, Gen 5+ odds 35/35/15/15%), +3 / +5 Mult
//                                                     a hit; Toucannon's Skill Link: always 5 hits, X1.1 each (one X1.611).
//   Yungoos 734 -> Gumshoos (Colorless)               Stakeout: +15 Mult / X2 if the poker hand differs from the last one played this run.
//   Crabrawler 739 (Fighting) -> Crabominable (Water) Power-Up Punch: the first scored card permanently +2 Mult; Crabominable every scored
//                                                     card +1, the first +3.
//   Oricorio 741 (R $7)                               Dance styles: the suit held most on the round's first deal picks Baile (Hearts, Fire) /
//                                                     Pom-Pom (Diamonds, Lightning) / Pa'u (Spades, Psychic) / Sensu (Clubs, Psychic); its
//                                                     suit's scored cards X1.25; type follows; Monotype-exempt; one 3.9.1 card per style.
//   Cutiefly 742 -> Ribombee (Fairy)                  +4 Mult / X1 + X0.25 for each Fairy Joker, itself included.
//   Wishiwashi 746 (Water, R $7)                      Schooling: X2.5 while at least half the round's hands are left, else +5 Mult.
//   Mareanie 747 -> Toxapex (Dark)                    Merciless: each scored card +1 Mult / X1 + X0.25, per Boss Blind beaten this run.
//   Dewpider 751 -> Araquanid (Water)                 Water Bubble: scored Clubs +15 Chips (/ and X1.25), doubled in the rain.
//   Fomantis 753 -> Lurantis (Grass)                  Solar Blade: +10 Mult / X2.5 on the final hand, X3.5 in the sun.
//   Morelull 755 -> Shiinotic (Fairy)                 +3 Mult per Lucky card in the deck; Shiinotic banks +2 per Lucky trigger.
// Every ability is FIRED through real hands / rounds with exact numbers.
//   node micatro/tests/mods/pokermon_gen7_batch1_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values, energy_matches } from '../../mods/pokermon/systems/energy.js';
import { is_type, get_type } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import * as ANIM from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import * as DES from '../../mods/pokermon/jokers/pokejokers_designs.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const LINES = {
  pikipek: ['pikipek', 'trumbeak', 'toucannon'], yungoos: ['yungoos', 'gumshoos'], crabrawler: ['crabrawler', 'crabominable'], oricorio: ['oricorio'],
  cutiefly: ['cutiefly', 'ribombee'], wishiwashi: ['wishiwashi'], mareanie: ['mareanie', 'toxapex'], dewpider: ['dewpider', 'araquanid'],
  fomantis: ['fomantis', 'lurantis'], morelull: ['morelull', 'shiinotic'],
};
const NAMES = Object.values(LINES).flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function mk(spec, area) {
  const s = typeof spec === 'string' ? { k: spec } : spec;
  return create_playing_card({ front: P_CARDS[s.k], center: P_CENTERS[s.center || 'c_base'] }, area);
}
/** Put cards in hand: a list of keys, or [key, center] pairs (the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list`; the round never ends by accident unless `last` (the round's final hand). */
function play(list, { last = false } = {}) {
  clearHand();
  const cs = cards(list);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (last) G.GAME.current_round.hands_left = 1;
  else if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
}
/** Play cards that already exist (back into the hand from wherever they are). */
function replay(cs) {
  clearHand();
  for (const c of cs) { if (c.area) c.area.remove_card(c); G.hand.emplace(c); }
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips) };
}
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function advance(boss = 'bl_wall') {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); advance(); } };
/** Make the deck exactly these cards so the next Blind's first deal is them (Castform's test). */
function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  return specs.map((s) => mk(s, G.deck));
}
function deal(seed, specs, jokers) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
  return js;
}
/** The next round's first deal is `specs` (win this one, shop, select). */
function nextDeal(specs) {
  endRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
}
const CLUBS = ['C_2', 'C_3', 'C_4', 'C_5', 'C_6', 'H_7', 'H_8', 'S_9'];   // Clubs 5: Rainy; Sensu
const REDS = ['H_2', 'H_3', 'D_4', 'D_5', 'H_6', 'C_7', 'C_8', 'S_9'];    // red 5 (Hearts 3, Diamonds 2): Sunny; Baile
const DIAMONDS = ['D_2', 'D_3', 'D_4', 'H_5', 'C_6', 'S_7', 'D_8', 'S_9']; // Diamonds 4: Pom-Pom
const SPADES = ['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'S_8', 'C_9'];   // Spades 4: Pa'u
const TIE4 = ['S_2', 'S_3', 'C_4', 'C_5', 'H_6', 'D_7', 'H_8', 'D_9'];     // 2 of each: a tie
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
const drawn = (j) => { const f = face(j); return f ? [f.atlas, f.pos] : [j.config.center.atlas, j.config.center.pos]; };
const GEN7 = 'poke_AtlasJokersBasicGen07391';

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 64 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 64+ (Gen 7 batch 1)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 19 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G7B1S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, atlas, x, y]
  const N = 'poke_AtlasJokersBasicNatdex391';
  const WANT = {
    pikipek: [2, 6, 'Basic', 'Colorless', 4, N, 20, 48], trumbeak: [S, 8, 'One', 'Colorless', 5, N, 22, 48], toucannon: [S, 10, 'Two', 'Colorless', undefined, N, 24, 48],
    yungoos: [1, 5, 'Basic', 'Colorless', 4, N, 26, 48], gumshoos: [S, 8, 'One', 'Colorless', undefined, N, 28, 48],
    crabrawler: [1, 5, 'Basic', 'Fighting', 5, N, 6, 49], crabominable: [S, 8, 'One', 'Water', undefined, N, 8, 49],
    oricorio: [3, 7, 'Basic', 'Fire', undefined, GEN7, 0, 0],
    cutiefly: [1, 5, 'Basic', 'Fairy', 5, N, 12, 49], ribombee: [S, 8, 'One', 'Fairy', undefined, N, 14, 49],
    wishiwashi: [3, 7, 'Basic', 'Water', undefined, GEN7, 2, 1],
    mareanie: [1, 5, 'Basic', 'Dark', 5, N, 22, 49], toxapex: [S, 8, 'One', 'Dark', undefined, N, 24, 49],
    dewpider: [1, 5, 'Basic', 'Water', 5, N, 0, 50], araquanid: [S, 8, 'One', 'Water', undefined, N, 2, 50],
    fomantis: [1, 5, 'Basic', 'Grass', 5, N, 4, 50], lurantis: [S, 8, 'One', 'Grass', undefined, N, 6, 50],
    morelull: [1, 5, 'Basic', 'Fairy', 5, N, 8, 50], shiinotic: [S, 8, 'One', 'Fairy', undefined, N, 10, 50],
  };
  ok(Object.keys(WANT).length === 19 && NAMES.length === 19, '19 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, atlas, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 7,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 7`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === atlas && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${atlas} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  ok(C('oricorio').poke_mono_exempt === true && NAMES.filter((n) => n !== 'oricorio').every((n) => !C(n).poke_mono_exempt), 'only Oricorio is Monotype-exempt (its type follows the dance)');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (from, list, to) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && [from, ...list, to].every((k, n) => keys[i - 1 + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  const RUNS = [
    ['primarina', ['pikipek', 'trumbeak', 'toucannon', 'yungoos', 'gumshoos'], 'grubbin'],
    ['vikavolt', ['crabrawler', 'crabominable', 'oricorio', 'cutiefly', 'ribombee'], 'rockruff'],
    ['lycanroc_dusk', ['wishiwashi', 'mareanie', 'toxapex'], 'mudbray'],
    ['mudsdale', ['dewpider', 'araquanid', 'fomantis', 'lurantis', 'morelull', 'shiinotic'], 'salandit'],
  ];
  for (const [from, list, to] of RUNS) ok(run(from, list, to) === true, `Pokédex order: ${from}, ${list.join(', ')}, ${to}`, run(from, list, to));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  for (const line of Object.values(LINES)) if (line.length > 1) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  ok(NAMES.every((n) => !C(n).poke_no_energy_field), 'every one of the 19 takes Energy (each has a main number)');
  ok(['hits', 'glow_mult', 'form', 'rounds'].every((f) => !(f in energy_values)) && ['mult', 'Xmult', 'Xmult2', 'Xmult_mod', 'Xmult_multi', 'mult_mod', 'mult_mod2', 'chips'].every((f) => f in energy_values),
    'Energy fields: the per-hit / per-joker / per-card numbers; fixed: the hit count, the Lucky bank, the style');
});

// ------------------------------------------------------------------- Pikipek / Trumbeak / Toucannon: Multi-hit, Skill Link
await sec('multi-hit', () => {
  start('PIKI');
  const p = add('j_poke_pikipek');
  const seen = { 2: 0, 3: 0, 4: 0, 5: 0 };
  let okAll = true;
  for (let i = 0; i < 400; i++) {
    const t = play(['S_A']);
    seen[ex(p).hits] = (seen[ex(p).hits] || 0) + 1;
    if (!near(t.mult, 1 + 3 * ex(p).hits)) okAll = false;
  }
  ok(okAll, 'Pikipek: every hand +3 Mult per hit (400 hands)');
  ok(Object.keys(seen).length === 4 && seen[2] > 100 && seen[2] < 180 && seen[3] > 100 && seen[3] < 180 && seen[4] > 30 && seen[4] < 95 && seen[5] > 30 && seen[5] < 95,
    'the hits: 2-5, at about 35 / 35 / 15 / 15% (Gen 5+ odds)', seen);
  ok(/Last hand: \d hits/.test(plain(p)), 'its tooltip shows the last roll', plain(p));
  const seq = (seed) => { start(seed); const j = add('j_poke_pikipek'); const out = []; for (let i = 0; i < 8; i++) { play(['S_A']); out.push(ex(j).hits); } return out.join(''); };
  ok(seq('HITSEED') === seq('HITSEED') && seq('HITSEED') !== seq('HITSEEE'), 'seeded: the same seed rolls the same hits', [seq('HITSEED'), seq('HITSEEE')]);
  // Blueprint copies the same hits (one roll)
  start('PIKIBP');
  const p2 = add('j_poke_pikipek');
  add('j_blueprint');
  G.jokers.cards.reverse();
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 2 * 3 * ex(p2).hits), 'Blueprint: the same hits again (one roll a hand)', [t.total, ex(p2).hits]);
  // a Colorless flock member: Starly counts it
  const st = add('j_poke_starly');
  t = play(['S_A']);
  ok(is_type(p2, 'Colorless') && near(t.mult, 1 + 2 * 3 * ex(p2).hits + 2 * 2), 'Pikipek is Colorless: Starly\'s flock counts it (+2 x 2)', t.total);
  st.remove(); flush();
  // evolution
  start('PIKEVO');
  const e = add('j_poke_pikipek');
  rounds(4);
  ok(key(e) === 'j_poke_trumbeak', 'Pikipek -> Trumbeak after 4 rounds', key(e));
  t = play(['S_A']);
  ok(near(t.mult, 1 + 5 * ex(e).hits) && ex(e).hits >= 2 && ex(e).hits <= 5, 'Trumbeak: +5 Mult per hit', [t.total, ex(e).hits]);
  rounds(5);
  ok(key(e) === 'j_poke_toucannon', 'Trumbeak -> Toucannon after 5 rounds', key(e));
  t = play(['S_A']);
  ok(near(t.mult, Math.pow(1.1, 5)), 'Toucannon, Skill Link: always 5 hits of X1.1 = X1.61051', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * Math.pow(1.1, 5)), '... on any hand', t.total);
  ok(/Total X1.611/.test(plain(e)), 'its tooltip: the total X', plain(e));
});

// ------------------------------------------------------------------- Yungoos / Gumshoos: Stakeout
await sec('stakeout', () => {
  start('YUNG');
  ok(G.GAME.poke_last_hand === undefined, 'a new run: no last hand yet');
  const y = add('j_poke_yungoos');
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 + 15), 'the run\'s first hand counts as different: +15', t.total);
  ok(G.GAME.poke_last_hand === 'Pair' && /Last: Pair/.test(plain(y)), 'the run records the Pair', [G.GAME.poke_last_hand, plain(y)]);
  t = play(['S_Q', 'H_Q']);
  ok(near(t.mult, 2), 'a Pair again: nothing', t.total);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 15), 'then a High Card: +15', t.total);
  t = play(['S_K', 'H_K', 'S_3', 'H_3']);
  ok(near(t.mult, 2 + 15), 'then Two Pair: +15', t.total);
  // the record is kept without a Yungoos: a late buy sees it
  y.remove(); flush();
  play(['S_9']);
  ok(G.GAME.poke_last_hand === 'High Card', 'no Yungoos held: the record still moves (High Card)');
  const y2 = add('j_poke_yungoos');
  t = play(['S_7']);
  ok(near(t.mult, 1), 'a Yungoos bought now: a High Card after a High Card is no Stakeout', t.total);
  t = play(['S_7', 'H_7']);
  ok(near(t.mult, 2 + 15), '... a Pair is', t.total);
  // a debuffed hand (The Eye's repeat) still becomes the last hand played
  G.GAME.blind.debuff_hand = () => true;
  t = play(['S_7', 'S_8', 'S_9', 'S_T', 'S_J']);
  ok(t.mult === 0 && G.GAME.poke_last_hand === 'Straight Flush', 'a debuffed hand scores nothing, but it is the last hand played', [t.total, G.GAME.poke_last_hand]);
  delete G.GAME.blind.debuff_hand;
  // Blueprint copies it
  add('j_blueprint'); G.jokers.cards.reverse();
  t = play(['S_4']);
  ok(near(t.mult, 1 + 15 + 15), 'Blueprint copies the +15', t.total);
  G.jokers.cards[0].remove(); flush();
  rounds(4);
  ok(key(y2) === 'j_poke_gumshoos', 'Yungoos -> Gumshoos after 4 rounds', key(y2));
  t = play(['S_5', 'H_5']);
  ok(near(t.mult, 2 * 2), 'Gumshoos: X2 on a hand unlike the last (High Card before)', t.total);
  t = play(['S_6', 'H_6']);
  ok(near(t.mult, 2), 'the same hand again: nothing', t.total);
});

// ------------------------------------------------------------------- Crabrawler / Crabominable: Power-Up Punch
await sec('power-up punch', () => {
  start('CRAB');
  const c = add('j_poke_crabrawler');
  let t = play(['S_K', 'H_K', 'D_3']);
  const [k1, k2] = t.cards;
  ok(near(t.mult, 2) && k1.ability.perma_mult === 2 && !k2.ability.perma_mult, 'Crabrawler: the first scored King gains +2 Mult for good (not this hand), the second nothing', [t.total, k1.ability.perma_mult, k2.ability.perma_mult]);
  let r = replay([k1, k2]);
  ok(near(r.mult, 2 + 2) && k1.ability.perma_mult === 4, 'played again: the first King gives its +2, then gains +2 more', [r.total, k1.ability.perma_mult]);
  r = replay([k2, k1]);
  ok(near(r.mult, 2 + 4) && k2.ability.perma_mult === 2 && k1.ability.perma_mult === 4, 'order matters: now the other King is first and gains', [r.total, k2.ability.perma_mult, k1.ability.perma_mult]);
  // a debuffed first card scores nothing and gains nothing; the next one isn't "first"
  clearHand();
  const [d1, d2] = cards(['S_9', 'H_9']); debuff(d1);
  replay([d1, d2]);
  ok(!d1.ability.perma_mult && !d2.ability.perma_mult, 'a debuffed first card: no gain, and the second card is not the first', [d1.ability.perma_mult, d2.ability.perma_mult]);
  // Blueprint never gains (blueprint_compat false)
  add('j_blueprint'); G.jokers.cards.reverse();
  t = play(['S_A']);
  ok(t.cards[0].ability.perma_mult === 2 && C('crabrawler').blueprint_compat === false, 'with Blueprint: still +2 once', t.cards[0].ability.perma_mult);
  G.jokers.cards[0].remove(); flush();
  ok(/permanently gains \+2 Mult/.test(plain(c)) && /Evolves after 5 rounds/.test(plain(c)), 'its text', plain(c));
  rounds(5);
  ok(key(c) === 'j_poke_crabominable' && get_type(c) === 'Water', 'Crabrawler -> Crabominable (Water) after 5 rounds', [key(c), get_type(c)]);
  t = play(['S_Q', 'H_Q', 'D_Q']);
  ok(JSON.stringify(t.cards.map((x) => x.ability.perma_mult)) === '[3,1,1]', 'Crabominable: every scored card +1 for good, the first +3', t.cards.map((x) => x.ability.perma_mult));
  r = replay(t.cards);
  ok(near(r.mult, 3 + 3 + 1 + 1), 'played again: they give their +3 / +1 / +1', r.total);
});

// ------------------------------------------------------------------- Oricorio: dance styles, type, Monotype, art
await sec('oricorio', () => {
  let [o] = deal('ORI1', REDS, ['oricorio']);
  ok(ex(o).form === 'baile' && get_type(o) === 'Fire', 'a Hearts-most first deal: Baile Style, Fire', [ex(o).form, get_type(o)]);
  let t = play(['H_K', 'H_9', 'D_9']);
  ok(near(t.mult, 2 * 1.25), 'Baile: the scored Heart X1.25 (a Diamond doesn\'t)', t.total);
  ok(/Currently Baile Style: Hearts/.test(plain(o)), 'its tooltip names the style and suit', plain(o));
  [o] = deal('ORI2', DIAMONDS, ['oricorio']);
  t = play(['D_K', 'D_9', 'H_9']);
  ok(ex(o).form === 'pompom' && get_type(o) === 'Lightning' && near(t.mult, 2 * 1.25), 'Diamonds most: Pom-Pom, Lightning; the Diamond X1.25', [ex(o).form, get_type(o), t.total]);
  [o] = deal('ORI3', SPADES, ['oricorio']);
  t = play(['S_K', 'S_9', 'C_9']);
  ok(ex(o).form === 'pau' && get_type(o) === 'Psychic' && near(t.mult, 2 * 1.25), 'Spades most: Pa\'u, Psychic', [ex(o).form, get_type(o), t.total]);
  [o] = deal('ORI4', CLUBS, ['oricorio']);
  t = play(['C_K', 'C_9', 'S_9']);
  ok(ex(o).form === 'sensu' && get_type(o) === 'Psychic' && near(t.mult, 2 * 1.25), 'Clubs most: Sensu, Psychic', [ex(o).form, get_type(o), t.total]);
  t = play(['C_2', 'C_5', 'C_8', 'C_J', 'C_K']);
  ok(near(t.mult, 4 * Math.pow(1.25, 5)), 'a Club Flush: X1.25 five times', t.total);
  // the style stays: later draws don't change it, the shop keeps it, a tie keeps it
  nextDeal(TIE4);
  ok(ex(o).form === 'sensu' && get_type(o) === 'Psychic', 'a tie on the next first deal (2 of each): Sensu kept', ex(o).form);
  nextDeal(REDS);
  ok(ex(o).form === 'baile' && get_type(o) === 'Fire', 'the round after, Hearts most: Baile again', ex(o).form);
  endRound(); act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP && ex(o).form === 'baile', 'in the shop: still Baile (the style stays between rounds)', ex(o).form);
  // a Wild card counts for every suit (so Wilds alone are a tie), a Stone card for none: the style is kept
  [o] = deal('ORI5', ['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'S_8', 'C_9'], ['oricorio']);
  nextDeal([{ k: 'H_2', center: 'm_wild' }, { k: 'H_3', center: 'm_wild' }, { k: 'H_4', center: 'm_stone' }, { k: 'H_5', center: 'm_stone' },
    { k: 'H_6', center: 'm_stone' }, { k: 'H_7', center: 'm_stone' }, { k: 'H_8', center: 'm_stone' }, { k: 'H_9', center: 'm_stone' }]);
  ok(ex(o).form === 'pau', 'two Wild Hearts and six Stone Hearts: a 2-2-2-2 tie, Pa\'u kept (not Baile)', ex(o).form);
  nextDeal([{ k: 'D_2', center: 'm_wild' }, 'H_3', 'H_4', 'D_5', 'C_6', 'S_7', { k: 'S_8', center: 'm_stone' }, { k: 'S_9', center: 'm_stone' }]);
  ok(ex(o).form === 'baile' && get_type(o) === 'Fire', 'a Wild + Hearts 2 (3) beat Diamonds / Clubs / Spades (2 each, the Wild included; Stone none): Baile', ex(o).form);
  // Energy: the current style's type matches
  [o] = deal('ORI6', DIAMONDS, ['oricorio']);
  ok(energy_matches(o, 'Lightning', false) && !energy_matches(o, 'Fire', false), 'Pom-Pom: Lightning Energy matches, Fire doesn\'t', [energy_matches(o, 'Lightning', false), energy_matches(o, 'Fire', false)]);
  // the art follows the style
  const cell = (s) => { ex(o).form = s; const [atlas, pos] = drawn(o); return atlas + ' ' + pos.x + ',' + pos.y; };
  ok(cell('baile') === GEN7 + ' 0,0' && cell('pompom') === GEN7 + ' 2,0' && cell('pau') === GEN7 + ' 4,0' && cell('sensu') === GEN7 + ' 6,0', 'each style draws its own 3.9.1 card (Gen 7 sheet {0,0} {2,0} {4,0} {6,0})',
    ['baile', 'pompom', 'pau', 'sensu'].map(cell));
  ex(o).form = 'pau';
  const sh = face(o, true);
  ok(sh && sh.atlas === 'poke_AtlasJokersBasicGen07Shiny391' && sh.pos.x === 4 && sh.pos.y === 0, 'a Shiny Pa\'u draws the Shiny sheet\'s twin', sh && [sh.atlas, sh.pos]);
  ex(o).form = 'pompom';
});
await sec('oricorio: monotype', () => {
  const RB = () => G.GAME.run_badges;
  newRun({ seed: 'ORIMONO', seeded: false, back: 'b_red', mods: ['pokermon'] }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  add('j_poke_charmander');
  const o = add('j_poke_oricorio');
  stackDeck(SPADES);
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().type === 'Fire' && ex(o).form === 'pau' && get_type(o) === 'Psychic', 'a Charmander + Oricorio run locks Fire; Oricorio dances Pa\'u (Psychic) in it', [RB(), ex(o).form]);
  clearHand(); endRound(); flush(); act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP && toView().run_badges.mono_at_risk === false, 'the shop: no Monotype warning for a Psychic Oricorio', toView().run_badges);
  act({ type: 'next_round' });
  stackDeck(CLUBS);
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().mono_reason === '' && ex(o).form === 'sensu', 'the next round: Monotype intact', [RB(), ex(o).form]);
});

// ------------------------------------------------------------------- Cutiefly / Ribombee: the Fairy team
await sec('fairy team', () => {
  start('CUTIE');
  const c = add('j_poke_cutiefly');
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 4), 'Cutiefly alone: +4 (itself)', t.total);
  const s = add('j_poke_spritzee');
  add('j_joker');
  const m = add('j_poke_morelull');
  t = play(['S_A']);
  ok(near(t.mult, 1 + 4 + 12) && /Currently 3: \+12 Mult/.test(plain(c)), 'with Spritzee and Morelull (Fairy; the Joker isn\'t): +12', [t.total, plain(c)]);
  debuff(s);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 4 + 8), 'a debuffed Fairy doesn\'t count', t.total);
  undebuff(s);
  m.remove(); flush();
  rounds(5);
  ok(key(c) === 'j_poke_ribombee', 'Cutiefly -> Ribombee after 5 rounds', key(c));
  t = play(['S_A']);
  ok(near(t.mult, 1 * 1.5 + 4), 'Ribombee (leftmost), 2 Fairy Jokers (itself + Spritzee): X1.5, then the Joker+4', t.total);
  const r2 = add('j_poke_ribombee');
  t = play(['S_A']);
  ok(near(t.mult, (1 * 1.75 + 4) * 1.75), 'two Ribombees, 3 Fairies: X1.75 each', t.total);
  void r2;
});

// ------------------------------------------------------------------- Wishiwashi: Schooling
await sec('schooling', () => {
  start('WISHI');
  const w = add('j_poke_wishiwashi');
  const cr = G.GAME.current_round;
  ok(cr.hands_left === 4 && cr.hands_played === 0, 'a Red Deck round: 4 hands', [cr.hands_left, cr.hands_played]);
  const playNo = (k) => { clearHand(); const cs = cards([k]); G.GAME.chips = 0; G.GAME.blind.chips = 1e15; act({ type: 'highlight', ids: cs.map((x) => x.sort_id) }); const r = act({ type: 'play' }); flush(); return Number((((r && r.events) || []).find((e) => e.type === 'hand_total') || {}).mult); };
  ok(/Next hand: School Form/.test(plain(w)) && drawn(w)[1].x === 4, 'before the first hand: School Form (its School card {4,1})', [plain(w), drawn(w)]);
  const got = [playNo('S_A'), playNo('S_A'), playNo('S_A')];
  ok(got.every((m) => near(m, 2.5)), 'hands 1-3 (4 / 3 / 2 hands left before them, half of 4 = 2): School X2.5', got);
  ok(/Next hand: Solo Form/.test(plain(w)) && drawn(w)[1].x === 2, 'one hand left: Solo Form (its own card)', [plain(w), drawn(w)]);
  const last = playNo('S_A');
  ok(near(last, 1 + 5), 'the 4th hand: Solo +5 Mult', last);
  // 5 hands (round up: 3 of them School)
  start('WISHI5');
  const w5 = add('j_poke_wishiwashi');
  G.GAME.current_round.hands_left = 5;
  const five = [playNo('S_A'), playNo('S_A'), playNo('S_A'), playNo('S_A')];
  ok(JSON.stringify(five.map((m) => near(m, 2.5))) === '[true,true,true,false]' && near(five[3], 6), '5 hands: the 1st-3rd School (5 / 4 / 3 left >= 3), the 4th Solo', five);
  void w5;
  ok(DES.school_on(false) === false, 'school_on reads the live round');
});

// ------------------------------------------------------------------- Mareanie / Toxapex: Merciless (Boss Blinds beaten this run)
await sec('merciless', () => {
  start('MARE');
  const m = add('j_poke_mareanie');
  ex(m).rounds = 99; // (kept a Mareanie for this part)
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2) && DES.bosses_beaten() === 0, 'no Boss Blind beaten yet: nothing', t.total);
  rounds(2);
  ok(G.GAME.blind.boss && DES.bosses_beaten() === 0, 'Small and Big beaten: still 0 (the Boss is up)', DES.bosses_beaten());
  rounds(1);
  ok(DES.bosses_beaten() === 1 && G.GAME.poke_bosses_beaten === 1, 'the Boss Blind beaten: 1 on the run\'s record', G.GAME.poke_bosses_beaten);
  t = play(['S_K', 'H_K', 'D_3']);
  ok(near(t.mult, 2 + 1 + 1), 'Mareanie: each scored card +1 Mult (the kicker doesn\'t score)', t.total);
  rounds(3);
  ok(DES.bosses_beaten() === 2, 'two Bosses', DES.bosses_beaten());
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 + 2 + 2) && /Currently 2: \+2 Mult a card/.test(plain(m)), '+2 a card', [t.total, plain(m)]);
  // a lost run doesn't count; the record runs without a Mareanie (a late buy sees it)
  start('MARE2');
  rounds(3);
  ok(DES.bosses_beaten() === 1, 'no Mareanie held: the run still records the Boss', DES.bosses_beaten());
  add('j_poke_mareanie');
  t = play(['S_A']);
  ok(near(t.mult, 1 + 1), 'a Mareanie bought now counts it: +1', t.total);
  // evolution: Toxapex X1 + 0.25 per Boss
  start('MAREVO');
  const e = add('j_poke_mareanie');
  rounds(5);
  ok(key(e) === 'j_poke_toxapex' && DES.bosses_beaten() === 1, 'Mareanie -> Toxapex after 5 rounds (one Boss on the way)', [key(e), DES.bosses_beaten()]);
  t = play(['S_A']);
  ok(near(t.mult, 1.25), 'Toxapex, 1 Boss: X1.25', t.total);
  rounds(3);
  t = play(['S_A']);
  ok(DES.bosses_beaten() === 2 && near(t.mult, 1.5), '2 Bosses: X1.5', [DES.bosses_beaten(), t.total]);
});

// ------------------------------------------------------------------- Dewpider / Araquanid: Water Bubble, doubled in rain
await sec('water bubble', () => {
  let [d] = deal('DEW1', REDS, ['dewpider']);
  let t = play(['C_K']);
  ok(t.chips === 5 + 10 + 15 && /Not raining/.test(plain(d)), 'Dewpider, dry: a scored Club +15 Chips', [t.total, plain(d)]);
  t = play(['S_K']);
  ok(t.chips === 15, 'a Spade: nothing', t.total);
  [d] = deal('DEW2', CLUBS, ['dewpider']);
  t = play(['C_K', 'C_9']);
  ok(/Raining!/.test(plain(d)) && t.chips === 5 + 10 + 30, 'raining (Clubs most on the first deal): +30 (doubled)', [t.total, plain(d)]);
  t = play(['C_K', 'H_K']);
  ok(t.chips === 10 + 20 + 30, 'a Pair with one Club: +30 once', t.total);
  rounds(5);
  ok(key(d) === 'j_poke_araquanid', 'Dewpider -> Araquanid after 5 rounds', key(d));
  [d] = deal('DEW3', REDS, ['araquanid']);
  t = play(['C_K', 'C_9']);
  ok(t.chips === 5 + 10 + 15 && near(t.mult, 1.25), 'Araquanid, dry: +15 Chips and X1.25', t.total);
  [d] = deal('DEW4', REDS, ['araquanid', 'kyogre']);
  t = play(['C_K', 'C_9']);
  ok(t.chips === 5 + 2 * (10 + 30) && near(t.mult, 1.5 * 1.5) && /Raining!/.test(plain(d)), 'with Kyogre it rains: +30 Chips and X1.5, twice (Kyogre retriggers the Club)', t.total);
  // (Kyogre's own rule retriggers the Club too)
  t = play(['C_2', 'C_9', 'C_7', 'C_5', 'C_K']);
  ok(Number.isFinite(t.mult), 'a Club Flush in the rain plays', t.total);
  [d] = deal('DEW5', CLUBS, ['araquanid']);
  t = play(['C_K', 'C_9']);
  ok(t.chips === 5 + 10 + 30 && near(t.mult, 1.5), 'rain: +30 and X1.5 (the X\'s bonus doubles)', t.total);
  ok(/raining: \+30 \| Chips and X1.5/.test(plain(d)), 'its tooltip shows the rain numbers', plain(d));
});

// ------------------------------------------------------------------- Fomantis / Lurantis: Solar Blade
await sec('solar blade', () => {
  start('FOMA');
  const f = add('j_poke_fomantis');
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Fomantis: not the final hand, nothing', t.total);
  t = play(['S_A'], { last: true });
  ok(near(t.mult, 1 + 10), 'the final hand: +10 Mult', t.total);
  start('FOMEVO');
  const e = add('j_poke_fomantis');
  rounds(5);
  ok(key(e) === 'j_poke_lurantis', 'Fomantis -> Lurantis after 5 rounds', key(e));
  void f;
  let [l] = deal('LUR1', CLUBS, ['lurantis']);
  t = play(['S_A']);
  ok(near(t.mult, 1), 'Lurantis: not the final hand, nothing', t.total);
  t = play(['S_A'], { last: true });
  ok(near(t.mult, 2.5), 'the final hand, not sunny: X2.5', t.total);
  [l] = deal('LUR2', REDS, ['lurantis']);
  ok(/Sunny!/.test(plain(l)), 'a red first deal: sunny', plain(l));
  t = play(['S_A'], { last: true });
  ok(near(t.mult, 3.5), 'the final hand in the sun: X3.5', t.total);
  [l] = deal('LUR3', CLUBS, ['lurantis', 'volcarona']);
  t = play(['S_A'], { last: true });
  ok(near(t.mult, 3.5 * 1.25), 'Volcarona makes it sunny: X3.5 (and Volcarona\'s own X1.25 for itself, a Fire Joker)', t.total);
});

// ------------------------------------------------------------------- Morelull / Shiinotic: Lucky cards
await sec('lucky glow', () => {
  start('MORE');
  const m = add('j_poke_morelull');
  let t = play(['S_A']);
  ok(near(t.mult, 1) && /Currently \+0 Mult/.test(plain(m)), 'no Lucky card in the deck: nothing', [t.total, plain(m)]);
  const deck = G.playing_cards.filter((c) => key(c) === 'c_base').slice(0, 4);
  for (const c of deck) c.set_ability(P_CENTERS.m_lucky, null, true);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 12), '4 Lucky cards in the full deck: +12', t.total);
  rounds(5);
  ok(key(m) === 'j_poke_shiinotic', 'Morelull -> Shiinotic after 5 rounds', key(m));
  const lucky = G.playing_cards.filter((c) => key(c) === 'm_lucky').length;
  t = play(['S_A']);
  ok(lucky === 4 && near(t.mult, 1 + 12), 'Shiinotic keeps +3 a Lucky card (+12)', [lucky, t.total]);
  // force the Lucky rolls: every scored Lucky card triggers
  G.GAME.probabilities.normal = 1000;
  t = play([['S_K', 'm_lucky'], ['H_K', 'm_lucky']]);
  ok(near(ex(m).glow_mult, 4), 'two Lucky cards trigger: +2 each banked (+4)', ex(m).glow_mult);
  add('j_blueprint'); G.jokers.cards.reverse();
  play([['S_K', 'm_lucky']]);
  ok(near(ex(m).glow_mult, 6), 'with Blueprint: still +2 a trigger (Blueprint never banks)', ex(m).glow_mult);
  G.jokers.cards[0].remove(); flush();
  G.GAME.probabilities.normal = 1;
  const L = G.playing_cards.filter((c) => key(c) === 'm_lucky').length;
  t = play(['S_A']);
  ok(L === 7 && near(t.mult, 1 + 3 * 7 + 6) && /Banked: \+6; currently \+27 Mult/.test(plain(m)), 'Shiinotic gives the bank and +3 a deck Lucky card (7 now: the 3 played joined the deck): +27', [L, t.total, plain(m)]);
  // a Lucky card that doesn't trigger banks nothing
  G.GAME.probabilities.normal = 0;
  play([['S_K', 'm_lucky']]);
  ok(near(ex(m).glow_mult, 6), 'a Lucky card that doesn\'t trigger: nothing', ex(m).glow_mult);
  G.GAME.probabilities.normal = 1;
});

// ------------------------------------------------------------------- Energy: the main number at the standard rate
await sec('energy', () => {
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const steps = (n, field, type, want) => {
    start('EN' + n + field);
    const j = add('j_poke_' + n);
    const got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r4(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  const p = steps('pikipek', 'mult', 'Colorless', [4.2, 5.4, 6.6]);
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 6.6 * ex(p).hits) && ex(p).hits >= 2, 'energized Pikipek: +6.6 a hit (the hits unchanged)', [t.total, ex(p).hits]);
  steps('trumbeak', 'mult', 'Colorless', [7, 9, 11]);
  const tc = steps('toucannon', 'Xmult_multi', 'Colorless', [1.155, 1.21, 1.265]);
  t = play(['S_A']);
  ok(near(t.mult, Math.pow(1.265, 5)), 'energized Toucannon: 1.265^5 = X3.236', [t.total, ex(tc)]);
  steps('yungoos', 'mult', 'Colorless', [21, 27, 33]);
  steps('gumshoos', 'Xmult', 'Colorless', [2.4, 2.8, 3.2]);
  const cb = steps('crabrawler', 'mult_mod', 'Fighting', [2.4, 2.8, 3.2]);
  t = play(['S_K']);
  ok(near(t.cards[0].ability.perma_mult, 3.2), 'energized Crabrawler: the King gains +3.2', t.cards[0].ability.perma_mult);
  void cb;
  steps('crabominable', 'mult_mod', 'Water', [1.2, 1.4, 1.6]);
  steps('crabominable', 'mult_mod2', 'Water', [3.6, 4.2, 4.8]);
  steps('oricorio', 'Xmult_multi', 'Fire', [1.3125, 1.375, 1.4375]);
  steps('cutiefly', 'mult', 'Fairy', [5.6, 7.2, 8.8]);
  steps('ribombee', 'Xmult_mod', 'Fairy', [0.3, 0.35, 0.4]);
  steps('wishiwashi', 'Xmult', 'Water', [3, 3.5, 4]);
  steps('wishiwashi', 'mult', 'Water', [7, 9, 11]);
  steps('mareanie', 'mult', 'Dark', [1.4, 1.8, 2.2]);
  steps('toxapex', 'Xmult_mod', 'Dark', [0.3, 0.35, 0.4]);
  steps('dewpider', 'chips', 'Water', [19.5, 24, 28.5]);
  steps('araquanid', 'chips', 'Water', [19.5, 24, 28.5]);
  const aq = steps('araquanid', 'Xmult_multi', 'Water', [1.3125, 1.375, 1.4375]);
  ok(/X1.875/.test(plain(aq)), 'energized Araquanid in rain: X1.875 (1 + 2 x 0.4375)', plain(aq));
  steps('fomantis', 'mult', 'Grass', [14, 18, 22]);
  steps('lurantis', 'Xmult', 'Grass', [3, 3.5, 4]);
  steps('lurantis', 'Xmult2', 'Grass', [4.2, 4.9, 5.6]);
  steps('morelull', 'mult', 'Fairy', [4.2, 5.4, 6.6]);
  const sh = steps('shiinotic', 'mult_mod', 'Fairy', [2.4, 2.8, 3.2]);
  ok(ex(sh).glow_mult === 0 && near(ex(sh).mult, 3 * 2.2), 'Shiinotic: its per-Lucky +3 rises too (6.6); the bank is never raised', [ex(sh).glow_mult, ex(sh).mult]);
  // Energy carries through evolution (re-applied to the new base)
  start('ENEVO');
  const pk = add('j_poke_pikipek');
  increment_energy(pk, 'Colorless'); increment_energy(pk, 'Colorless');
  rounds(4);
  ok(key(pk) === 'j_poke_trumbeak' && ex(pk).energy_count === 2 && near(ex(pk).mult, 9), 'Pikipek (2 Energy) -> Trumbeak: +9 a hit', [key(pk), ex(pk).mult]);
  rounds(5);
  ok(key(pk) === 'j_poke_toucannon' && near(ex(pk).Xmult_multi, 1.21), '... -> Toucannon: X1.21 a hit', ex(pk).Xmult_multi);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G7B1RES', customDeck: { name: 'Gen 7', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 0, 0, 0, 12], ['H_9', 'm_lucky', 0, 0, 20], ['D_5', 0, 0, 0, 20]],
    jokers: [{ key: 'j_poke_pikipek' }, { key: 'j_poke_crabrawler' }, { key: 'j_poke_oricorio' }, { key: 'j_poke_yungoos' }, { key: 'j_poke_shiinotic' }] } });
  s.act({ type: 'select_blind' }); flush();
  for (let i = 0; i < 3; i++) {
    s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    if (G.STATE !== STATES.SELECTING_HAND) break;
  }
  const snap = () => ({
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).hits, ex(j).form, ex(j).ptype, ex(j).glow_mult]),
    perma: G.playing_cards.map((c) => c.ability.perma_mult || 0).reduce((a, b) => a + b, 0),
    last: G.GAME.poke_last_hand, bosses: G.GAME.poke_bosses_beaten || 0,
    chips: String(G.GAME.chips), dollars: G.GAME.dollars,
  });
  const want = snap();
  ok(want.perma > 0 && want.last && want.jokers[0][1] >= 2, 'the run: punched cards, a last hand, Pikipek\'s hits', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the hits, the style and type, the punches, the bank, the run records and the score come back the same', { want, got });
});

// ------------------------------------------------------------------- the art: the 3.9.1 cells show these types (forms too)
if (ART) {
  await sec('art types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const sheet = (a) => a.replace(/^poke_/, '').replace(/391$/, '');
    const bad = [];
    for (const n of NAMES) { const r = typer.typeOfEntry({ atlas: sheet(C(n).atlas), pos: [C(n).pos.x, C(n).pos.y] }); if (!r || r.ptype !== C(n).ptype) bad.push([n, C(n).ptype, r && r.ptype]); }
    ok(!bad.length, 'each of the 19 is the type its 3.9.1 card shows', bad);
    const F = ANIM.GEN7_FORM_SPRITES;
    const want = [[F.j_poke_oricorio.pompom, 'Lightning'], [F.j_poke_oricorio.pau, 'Psychic'], [F.j_poke_oricorio.sensu, 'Psychic'], [F.j_poke_wishiwashi.school, 'Water']];
    const wrong = want.filter(([p, t]) => (typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen07', pos: [p.x, p.y] }) || {}).ptype !== t);
    ok(!wrong.length && Object.entries(DES.ORICORIO_STYLES).every(([s, st]) => s === 'baile' || st.ptype === want.find(([p]) => p === F.j_poke_oricorio[s])[1]),
      'every form cell shows its form\'s type (Pom-Pom Lightning, Pa\'u / Sensu Psychic, School Water), and each style takes that type', wrong);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
