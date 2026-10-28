// The Gen 5 starters (owner said "build", 2026-10-28; jokers/pokejokers_designs.js "The Gen 5 starters"; PORTING.md "The Gen 5 starters").
// Pokermon's starter rules: the type's perk at every stage (Grass +1 hand size, Fire +1 discard, Water +1 hand), Basic Uncommon $5 with
// `starter` (the Starter Pack), Stage 1 Safari $8, Stage 2 Safari $10, evolving after 5 rounds, then 5 more.
//   Snivy 495 (Grass)      Contrary: each debuffed card held in hand gives +4 Mult.        Servine 496: +8.
//   Serperior 497          Contrary: debuffed scored cards score as if not debuffed, and each gives X1.25 Mult (run.js score_debuffed).
//   Tepig 498 (Fire)       Flame Charge: +4 Mult for each hand in a row of the same poker hand this round, this one included.  Pignite: +6.
//   Emboar 500             Flame Charge: X1 + X0.25 per hand in a row.
//   Oshawott 501 (Water)   Razor Shell: the first scored card retriggers.   Dewott: the first 2.
//   Samurott 503           the first 3 retrigger; Shell Blade: scored Aces give X1.5 Mult.
//   Energy: Snivy / Servine / Tepig / Pignite `mult` +40%, Serperior / the Oshawott line `Xmult_multi` +5% (the line carries Samurott's
//   X from the start), Emboar `Xmult_mod` +20%; the perks, the retriggers and the timers are fixed.
// Every ability is FIRED through real hands / rounds / packs with exact numbers.
//   node micatro/tests/mods/pokermon_starters_gen5_test.mjs
import { T, start, hand, add, clearHand, G, P_CENTERS, P_CARDS, act, state } from './poke_helpers.mjs';
import { P_BLINDS, Card } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { starter_lists } from '../../mods/pokermon/boosters/packs1.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const flat = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const LINES = { grass: ['snivy', 'servine', 'serperior'], fire: ['tepig', 'pignite', 'emboar'], water: ['oshawott', 'dewott', 'samurott'] };
const NAMES = [...LINES.grass, ...LINES.fire, ...LINES.water];
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** Play `keys` (debuffing the ones in `debuffed`), with `held` cards left in hand (debuffing those in `heldDebuffed`). The round never
 *  ends by accident. -> the hand's total, the cards, and the scoring order (the engine's scoring_hand event). */
function play(keys, { held = [], heldDebuffed = [], debuffed = [], center } = {}) {
  clearHand();
  const cs = hand(keys, center ? { center } : {});
  const hs = hand(held);
  for (const i of debuffed) debuff(cs[i]);
  for (const i of heldDebuffed) debuff(hs[i]);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  const sh = events.find((e) => e.type === 'scoring_hand');
  const order = sh ? sh.cards.map((id) => cs.find((c) => c.sort_id === id)) : [];
  return { cards: cs, held: hs, events, total, order, mult: Number(total.mult), chips: Number(total.chips) };
}
function fresh(seed, jokers, extra) { start(seed, {}, extra); return jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k)); }
/** Win the round (High Card), cash out: -> SHOP. */
function toShop() {
  clearHand();
  const c = hand(['S_2']);
  G.GAME.blind.chips = 1; G.GAME.chips = 1; G.GAME.current_round.hands_left = Math.max(2, G.GAME.current_round.hands_left);
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
  act({ type: 'play' }); flush();
  if (state() === 'ROUND_EVAL') act({ type: 'cash_out' });
  flush();
}
function nextRound() { toShop(); act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); flush(); clearHand(); }
const hsize = () => G.hand.config.card_limit;

// ------------------------------------------------------------------- pin, static data, order, art, starter, energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 50 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 50+ (the Gen 5 starters)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => ((MODS[m] && MODS[m].content && MODS[m].content.centers) || []).filter((c) => NAMES.some((n) => (c.name || '') === n || (c.key || '').endsWith('_' + n))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has any of the nine (precedence: nothing to dedupe)', addon);
});
await sec('static', () => {
  start('ST5S0');
  const S = 'poke_safari';
  const cells = { snivy: [28, 32], servine: [0, 33], serperior: [2, 33], tepig: [4, 33], pignite: [6, 33], emboar: [8, 33], oshawott: [10, 33], dewott: [12, 33], samurott: [14, 33] };
  for (const [t, line] of [['Grass', LINES.grass], ['Fire', LINES.fire], ['Water', LINES.water]]) {
    line.forEach((n, s) => {
      const c = C(n), [rarity, cost, stage] = [[2, 5, 'Basic'], [S, 8, 'One'], [S, 10, 'Two']][s];
      ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === t && c.config.extra.ptype === t && c.gen === 5 && c.blueprint_compat,
        `${n}: ${rarity === 2 ? 'Uncommon' : 'Safari'} $${cost}, ${stage}, ${t}, Gen 5`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
      ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === cells[n][0] && c.pos.y === cells[n][1] && !c.soul_pos,
        `${n}: upstream 3.9.1 cell Natdex {${cells[n]}} (nothing to deploy)`, [c.atlas, c.pos]);
      ok(c.attributes.includes('starter') && (s === 0) === (c.starter === true), `${n}: the 'starter' attribute; ${s === 0 ? 'starter: true' : 'not a pack starter'}`, [c.starter, c.attributes]);
      ok(s === 2 ? c.config.extra.rounds === undefined : c.config.extra.rounds === 5, `${n}: ${s === 2 ? 'no evolution' : 'evolves after 5 rounds'}`, c.config.extra.rounds);
      ok(c.attributes.includes('round_evo') === (s < 2), `${n}: round_evo ${s < 2}`, c.attributes);
    });
  }
  const L = starter_lists();
  ok(L.grass.includes('j_poke_snivy') && L.fire.includes('j_poke_tepig') && L.water.includes('j_poke_oshawott')
    && !['servine', 'serperior', 'pignite', 'emboar', 'dewott', 'samurott'].some((n) => [...L.grass, ...L.fire, ...L.water].includes('j_poke_' + n)),
  'Starter Pack lists: Snivy Grass, Tepig Fire, Oshawott Water; their evolutions are not starters', [L.grass, L.fire, L.water]);
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_snivy');
  const want = ['j_poke_arceus', ...NAMES.map((n) => 'j_poke_' + n), 'j_poke_pansage'];
  ok(i > 0 && want.every((k, n) => keys[i - 1 + n] === k), 'Pokédex order: Arceus (493), Snivy ... Samurott (495-503), then Pansage (511)', keys.slice(i - 1, i + 10));
  const E = (n) => C(n).config.extra;
  ok(E('snivy').h_size === 1 && E('snivy').mult === 4 && E('servine').h_size === 1 && E('servine').mult === 8 && E('serperior').h_size === 1 && E('serperior').Xmult_multi === 1.25,
    'Snivy +4, Servine +8, Serperior X1.25; +1 hand size each', LINES.grass.map(E));
  ok(E('tepig').d_size === 1 && E('tepig').mult === 4 && E('pignite').d_size === 1 && E('pignite').mult === 6 && E('emboar').d_size === 1 && E('emboar').Xmult_mod === 0.25,
    'Tepig +4, Pignite +6, Emboar X0.25; +1 discard each', LINES.fire.map(E));
  ok(LINES.water.every((n, s) => E(n).hands === 1 && E(n).strikes === s + 1 && E(n).retriggers === 1 && E(n).Xmult_multi === 1.5),
    'Oshawott / Dewott / Samurott: +1 hand, first 1 / 2 / 3 retrigger once, X1.5 Aces (carried from the Basic)', LINES.water.map(E));
  ok(near(energy_values.mult, 0.4) && near(energy_values.Xmult_multi, 0.05) && near(energy_values.Xmult_mod, 0.2)
    && !['h_size', 'd_size', 'hands', 'strikes', 'retriggers', 'rounds', 'streak'].some((f) => f in energy_values),
  'Energy fields: mult +40%, Xmult_multi +5%, Xmult_mod +20%; the perks, retriggers, strikes, timers and streak are fixed');
});

// ------------------------------------------------------------------- the perks, applied and removed (and never doubled by evolution)
await sec('perks', () => {
  start('ST5P0');
  const h0 = hsize(), d0 = G.GAME.round_resets.discards, dl0 = G.GAME.current_round.discards_left, n0 = G.GAME.round_resets.hands, hl0 = G.GAME.current_round.hands_left;
  const s = add('j_poke_snivy');
  ok(hsize() === h0 + 1, 'Snivy: +1 hand size', [h0, hsize()]);
  const t = add('j_poke_tepig');
  ok(G.GAME.round_resets.discards === d0 + 1 && G.GAME.current_round.discards_left === dl0 + 1, 'Tepig: +1 discard (each round, and this one)', [G.GAME.round_resets.discards, G.GAME.current_round.discards_left]);
  const o = add('j_poke_oshawott');
  ok(G.GAME.round_resets.hands === n0 + 1 && G.GAME.current_round.hands_left === hl0 + 1, 'Oshawott: +1 hand (each round, and this one)', [G.GAME.round_resets.hands, G.GAME.current_round.hands_left]);
  s.remove(); t.remove(); o.remove(); flush();
  ok(hsize() === h0 && G.GAME.round_resets.discards === d0 && G.GAME.current_round.discards_left === dl0 && G.GAME.round_resets.hands === n0 && G.GAME.current_round.hands_left === hl0,
    'all three gone: hand size, discards and hands back', [hsize(), G.GAME.round_resets.discards, G.GAME.round_resets.hands]);
  for (const n of ['serperior', 'emboar', 'samurott', 'servine', 'pignite', 'dewott']) {
    start('ST5P' + n);
    const a = [hsize(), G.GAME.round_resets.discards, G.GAME.round_resets.hands];
    const j = add('j_poke_' + n);
    const b = [hsize(), G.GAME.round_resets.discards, G.GAME.round_resets.hands];
    const grass = LINES.grass.includes(n), fire = LINES.fire.includes(n);
    ok(b[0] === a[0] + (grass ? 1 : 0) && b[1] === a[1] + (fire ? 1 : 0) && b[2] === a[2] + (!grass && !fire ? 1 : 0), n + ': the same perk at every stage', [a, b]);
    j.remove(); flush();
    ok([hsize(), G.GAME.round_resets.discards, G.GAME.round_resets.hands].join() === a.join(), n + ': removed, back', a);
  }
});

// ------------------------------------------------------------------- Snivy / Servine: +4 / +8 Mult per debuffed card held in hand
await sec('snivy', () => {
  fresh('ST5SN1', ['snivy']);
  let r = play(['S_2'], { held: ['H_5', 'D_6', 'C_7'] });
  ok(r.chips === 7 && near(r.mult, 1), 'no debuffed card held: nothing (High Card 5 + 2, X1)', r.total);
  r = play(['S_2'], { held: ['H_5', 'D_6', 'C_7'], heldDebuffed: [0, 2] });
  ok(r.chips === 7 && near(r.mult, 1 + 4 + 4), 'two debuffed cards held: +4 each -> 9 Mult', r.total);
  r = play(['S_2'], { debuffed: [0], held: ['H_5'] });
  ok(near(r.mult, 1), 'a debuffed PLAYED card is not held: nothing', r.total);
  // Blueprint copies it
  fresh('ST5SN2', ['j_blueprint', 'snivy']);
  r = play(['S_2'], { held: ['H_5'], heldDebuffed: [0] });
  ok(near(r.mult, 1 + 4 + 4), 'Blueprint copies it: +4 twice for one held debuffed card', r.total);
  // a real Boss Blind's debuff: The Club (Clubs)
  start('ST5SN3', {}, { noBlind: true });
  add('j_poke_snivy');
  G.GAME.round_resets.blind_choices.Small = 'bl_club';
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(G.GAME.blind.name === 'The Club', 'The Club selected', G.GAME.blind.name);
  clearHand();
  const cs = hand(['S_2']), hs = hand(['C_5', 'C_9', 'H_4']);
  G.GAME.blind.debuff_card(hs[0]); G.GAME.blind.debuff_card(hs[1]); G.GAME.blind.debuff_card(hs[2]);
  ok(hs[0].debuff && hs[1].debuff && !hs[2].debuff, 'The Club debuffs the two Clubs held');
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const rr = act({ type: 'play' }); flush();
  const tot = rr.events.find((e) => e.type === 'hand_total');
  ok(Number(tot.chips) === 7 && near(Number(tot.mult), 1 + 8), 'under The Club, two held Clubs: +4 each (9 Mult)', tot);
  // Servine +8
  fresh('ST5SV1', ['servine']);
  r = play(['S_2'], { held: ['H_5', 'D_6', 'C_7'], heldDebuffed: [0, 1, 2] });
  ok(near(r.mult, 1 + 24), 'Servine: three debuffed cards held, +8 each -> 25 Mult', r.total);
  // Cresselia (no playing card can be debuffed): nothing for Contrary to count — anti-synergy
  fresh('ST5SN4', ['snivy', 'cresselia']);
  r = play(['S_2'], { held: ['H_5', 'D_6'], heldDebuffed: [0, 1] });
  ok(!r.held[0].debuff && near(r.mult, 1 * 1.5), 'with Cresselia nothing is debuffed: Snivy gives nothing (only Cresselia\'s X1.5)', r.total);
  // the tooltip counts the debuffed cards held now
  fresh('ST5SN5', ['snivy']);
  clearHand();
  const h2 = hand(['H_5', 'D_6', 'C_7']); debuff(h2[1]);
  ok(/Currently 1: \+4 Mult/.test(flat(G.jokers.cards[0])), 'tooltip: (Currently 1: +4 Mult)', flat(G.jokers.cards[0]));
});

// ------------------------------------------------------------------- Serperior: debuffed scored cards score as if not, X1.25 each
await sec('serperior', () => {
  fresh('ST5SE0', ['tepig']); // (no Serperior: a debuffed Pair scores nothing but the hand's base; Tepig only adds +4 Mult)
  let r = play(['S_K', 'H_K'], { debuffed: [0, 1] });
  ok(r.chips === 10 && near(r.mult, 2 + 4), 'without Serperior a debuffed Pair of Kings adds no Chips (10)', r.total);
  fresh('ST5SE1', ['serperior']);
  r = play(['S_K', 'H_K'], { debuffed: [0, 1] });
  ok(r.chips === 10 + 10 + 10 && near(r.mult, 2 * 1.25 * 1.25), 'Serperior: both debuffed Kings score (+10 each) and give X1.25 each', r.total);
  ok(r.cards.every((c) => c.debuff && !c.debuff_lifted), '... and are still debuffed after the hand (lifted for their scoring only)', r.cards.map((c) => [c.debuff, c.debuff_lifted]));
  r = play(['S_K', 'H_K'], { debuffed: [0] });
  ok(r.chips === 30 && near(r.mult, 2 * 1.25), 'only the debuffed card gives X1.25 (the other just scores)', r.total);
  r = play(['S_K', 'H_K']);
  ok(r.chips === 30 && near(r.mult, 2), 'no debuffed card: no X', r.total);
  r = play(['S_K', 'H_K'], { debuffed: [0, 1], center: 'm_mult' });
  ok(r.chips === 30 && near(r.mult, ((2 + 4) * 1.25 + 4) * 1.25), 'a lifted Mult card gives its +4 Mult too (the card scores as if not debuffed)', r.total);
  // held debuffed cards: Serperior's rule is for scored cards only
  r = play(['S_2'], { held: ['H_5'], heldDebuffed: [0] });
  ok(near(r.mult, 1) && r.chips === 7, 'a debuffed card HELD gives nothing to Serperior', r.total);
  // a debuffed Serperior lifts nothing
  debuff(G.jokers.cards[0]);
  r = play(['S_K', 'H_K'], { debuffed: [0, 1] });
  ok(r.chips === 10 && near(r.mult, 2), 'Serperior debuffed: the debuffed Kings score nothing', r.total);
  // with Oshawott: a lifted first card retriggers (and gives X1.25 each time)
  fresh('ST5SE2', ['serperior', 'oshawott']);
  r = play(['S_K', 'H_K'], { debuffed: [0, 1] });
  ok(r.chips === 10 + 10 * 2 + 10 && near(r.mult, 2 * Math.pow(1.25, 3)), 'with Oshawott: the lifted first King retriggers (+10 and X1.25 twice)', r.total);
  // two Serperiors: one lift, X1.25 from each
  fresh('ST5SE3', ['serperior', 'serperior']);
  r = play(['S_K'], { debuffed: [0] });
  ok(r.chips === 5 + 10 && near(r.mult, 1.25 * 1.25), 'two Serperiors: the card scores once, X1.25 from each', r.total);
  // a real Boss Blind: The Goad (Spades)
  start('ST5SE4', {}, { noBlind: true });
  add('j_poke_serperior');
  G.GAME.round_resets.blind_choices.Small = 'bl_goad';
  act({ type: 'select_blind' }); flush();
  ok(G.GAME.blind.name === 'The Goad', 'The Goad selected', G.GAME.blind.name);
  clearHand();
  const cs = hand(['S_A', 'H_A']);
  G.GAME.blind.debuff_card(cs[0]); G.GAME.blind.debuff_card(cs[1]);
  ok(cs[0].debuff && !cs[1].debuff, 'The Goad debuffs the Spade');
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const rr = act({ type: 'play' }); flush();
  const tot = rr.events.find((e) => e.type === 'hand_total');
  ok(Number(tot.chips) === 10 + 22 && near(Number(tot.mult), 2 * 1.25), 'under The Goad, a Pair of Aces: the Spade scores (+11) and gives X1.25', tot);
  ok(G.GAME.blind.triggered !== true, 'a lifted card doesn\'t trigger the Boss Blind', G.GAME.blind.triggered);
  // Cresselia: nothing is debuffed, so nothing to lift (anti-synergy: the X never fires)
  fresh('ST5SE5', ['serperior', 'cresselia']);
  r = play(['S_K', 'H_K'], { debuffed: [0, 1] });
  ok(r.chips === 30 && near(r.mult, 2 * 1.5), 'with Cresselia: the Kings are not debuffed, so no X1.25 (only Cresselia\'s X1.5)', r.total);
});

// ------------------------------------------------------------------- Tepig / Pignite / Emboar: Flame Charge
await sec('tepig', () => {
  fresh('ST5TE1', ['tepig']);
  const pair = () => play(['S_5', 'H_5']);
  let r = pair();
  ok(r.chips === 20 && near(r.mult, 2 + 4), 'the first Pair: 1 in a row, +4', r.total);
  r = pair();
  ok(near(r.mult, 2 + 8), 'the second Pair in a row: +8', r.total);
  ok(/Currently 2 in a row: Pair/.test(flat(G.jokers.cards[0])), 'tooltip: (Currently 2 in a row: Pair)', flat(G.jokers.cards[0]));
  // a discard doesn't break it
  clearHand(); const d = hand(['D_9']); act({ type: 'highlight', ids: [d[0].sort_id] }); act({ type: 'discard' }); flush();
  r = pair();
  ok(near(r.mult, 2 + 12), 'a discard between: still a streak, the third Pair +12', r.total);
  r = play(['S_2']);
  ok(near(r.mult, 1 + 4), 'a High Card breaks it: 1 in a row, +4', r.total);
  r = pair();
  ok(near(r.mult, 2 + 4), 'back to Pair: 1 in a row again, +4', r.total);
  // a debuffed hand (The Psychic: 5 cards) still continues the streak, and scores nothing
  G.GAME.blind.set_blind(P_BLINDS.bl_psychic); flush();
  r = pair();
  ok(Number(r.total.total) === 0, 'The Psychic: a 2-card Pair is debuffed (scores 0)', r.total);
  G.GAME.blind.set_blind(P_BLINDS.bl_small); flush();
  r = pair();
  ok(near(r.mult, 2 + 12), '... but it counted: the next Pair is 3 in a row, +12', r.total);
  // a new round starts over
  toShop();
  ok(/Currently 0 in a row: None/.test(flat(G.jokers.cards[0])), 'in the shop: (Currently 0 in a row: None)', flat(G.jokers.cards[0]));
  act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); flush();
  r = pair();
  ok(near(r.mult, 2 + 4), 'a new round: the first Pair is 1 in a row again, +4', r.total);
  // Blueprint copies the Mult, never the streak
  fresh('ST5TE2', ['j_blueprint', 'tepig']);
  r = pair();
  ok(near(r.mult, 2 + 4 + 4), 'Blueprint + Tepig, the first Pair: +4 twice', r.total);
  r = pair();
  ok(near(r.mult, 2 + 8 + 8), 'the second: +8 twice (the streak counted once)', r.total);
  // Pignite +6
  fresh('ST5PI1', ['pignite']);
  r = play(['S_2']); ok(near(r.mult, 1 + 6), 'Pignite: +6 on the first', r.total);
  r = play(['H_3']); ok(near(r.mult, 1 + 12), 'Pignite: +12 on the second High Card', r.total);
  r = play(['D_4']); ok(near(r.mult, 1 + 18), 'Pignite: +18 on the third', r.total);
  // Emboar X1 + X0.25 per hand in a row
  fresh('ST5EM1', ['emboar']);
  r = pair(); ok(near(r.mult, 2 * 1.25), 'Emboar: X1.25 on the first Pair', r.total);
  r = pair(); ok(near(r.mult, 2 * 1.5), 'X1.5 on the second', r.total);
  r = pair(); ok(near(r.mult, 2 * 1.75), 'X1.75 on the third', r.total);
  ok(/Currently 3 in a row: Pair, X1\.75 Mult/.test(flat(G.jokers.cards[0])), 'tooltip: (Currently 3 in a row: Pair, X1.75 Mult)', flat(G.jokers.cards[0]));
  r = play(['S_2', 'H_2', 'D_2']); ok(near(r.mult, 3 * 1.25), 'Three of a Kind: back to X1.25', r.total);
});

// ------------------------------------------------------------------- Oshawott / Dewott / Samurott: Razor Shell, Shell Blade
await sec('oshawott', () => {
  fresh('ST5OS1', ['oshawott']);
  let r = play(['S_K', 'H_K']);
  ok(r.chips === 10 + 10 * 2 + 10 && near(r.mult, 2), 'Oshawott: the first scored King retriggers (+10 twice)', r.total);
  r = play(['S_9', 'H_4', 'D_7', 'C_2', 'S_K']);
  ok(r.order.length === 1 && r.chips === 5 + 10 * 2 && near(r.mult, 1), 'High Card of 5 played: the one scoring card (the King) is the first scored card, retriggered', [r.total, r.order.map((c) => c.base.value)]);
  // the first scored card debuffed: nothing retriggers (the second isn't promoted)
  r = play(['S_K', 'H_K'], { debuffed: [0] });
  const first = r.order[0];
  ok(first === r.cards[0] ? r.chips === 10 + 10 : r.chips === 10 + 20 + 0, 'the first scored card debuffed: no retrigger (the next card isn\'t promoted)', [r.total, first === r.cards[0]]);
  fresh('ST5DW1', ['dewott']);
  r = play(['S_K', 'H_K']);
  ok(r.chips === 10 + 20 + 20, 'Dewott: both Kings of a Pair retrigger', r.total);
  r = play(['S_K', 'H_K', 'D_K']);
  ok(r.chips === 30 + 20 + 20 + 10 && near(r.mult, 3), 'Dewott: the first 2 of 3 Kings retrigger, the third doesn\'t', r.total);
  fresh('ST5SA1', ['samurott']);
  r = play(['S_A', 'H_A', 'D_A']);
  ok(r.chips === 30 + 22 * 3 && near(r.mult, 3 * Math.pow(1.5, 6)), 'Samurott: three Aces, each retriggered, X1.5 each time: X1.5^6', r.total);
  r = play(['S_K', 'H_K', 'D_K', 'C_K']);
  ok(r.chips === 60 + 20 * 3 + 10 && near(r.mult, 7), 'four Kings: the first 3 retrigger, no Ace, no X', r.total);
  r = play(['S_A'], { center: 'm_stone' });
  ok(near(r.mult, 1), 'a Stone card has no rank: no X', r.total);
  r = play(['S_A', 'H_A'], { debuffed: [0, 1] });
  ok(r.chips === 10 && near(r.mult, 2), 'debuffed Aces: nothing', r.total);
  // Blueprint copies the retriggers and the X
  fresh('ST5SA2', ['j_blueprint', 'samurott']);
  r = play(['S_A']);
  ok(r.chips === 5 + 11 * 3 && near(r.mult, Math.pow(1.5, 6)), 'Blueprint + Samurott, one Ace: 2 retriggers (3 scorings), X1.5 from each joker every time', r.total);
});

// ------------------------------------------------------------------- evolution: 5 rounds, then 5; Energy re-applied; perks kept
await sec('evolution grass', () => {
  start('ST5EV1');
  const h0 = hsize();
  const s = add('j_poke_snivy');
  increment_energy(s, 'Grass');
  ok(ex(s).energy_count === 1 && near(ex(s).mult, 5.6), '1 Grass Energy on Snivy: +5.6', ex(s));
  for (let r = 1; r <= 4; r++) nextRound();
  ok(key(s) === 'j_poke_snivy' && ex(s).rounds === 1, 'after 4 rounds: still Snivy (1 left)', [key(s), ex(s).rounds]);
  nextRound();
  ok(key(s) === 'j_poke_servine' && ex(s).rounds === 5 && near(ex(s).mult, 11.2) && ex(s).energy_count === 1 && hsize() === h0 + 1,
    'after the 5th: Servine, Energy re-applied (+11.2), 5 rounds to go, still +1 hand size (not +2)', [key(s), ex(s), hsize() - h0]);
  let r = play(['S_2'], { held: ['H_5'], heldDebuffed: [0] });
  ok(near(r.mult, 1 + 11.2), 'energized Servine: +11.2 per held debuffed card', r.total);
  for (let i = 1; i <= 5; i++) nextRound();
  ok(key(s) === 'j_poke_serperior' && near(ex(s).Xmult_multi, 1.3125) && hsize() === h0 + 1 && ex(s).rounds === undefined,
    'after 5 more: Serperior, X1.3125 (Energy carried), still +1 hand size', [key(s), ex(s), hsize() - h0]);
  r = play(['S_K'], { debuffed: [0] });
  ok(r.chips === 15 && near(r.mult, 1.3125), 'energized Serperior: X1.3125 on a lifted card', r.total);
  s.remove(); flush();
  ok(hsize() === h0, 'Serperior sold: hand size back', hsize() - h0);
});
await sec('evolution fire', () => {
  start('ST5EV2');
  const d0 = G.GAME.round_resets.discards;
  const t = add('j_poke_tepig');
  increment_energy(t, 'Fire'); increment_energy(t, 'Fire');
  ok(near(ex(t).mult, 7.2), '2 Fire Energy on Tepig: +7.2', ex(t));
  for (let r = 1; r <= 5; r++) nextRound();
  ok(key(t) === 'j_poke_pignite' && near(ex(t).mult, 10.8) && G.GAME.round_resets.discards === d0 + 1 && G.GAME.current_round.discards_left === d0 + 1,
    'after 5 rounds: Pignite (+10.8), still +1 discard (not +2)', [key(t), ex(t), G.GAME.round_resets.discards - d0]);
  for (let r = 1; r <= 5; r++) nextRound();
  ok(key(t) === 'j_poke_emboar' && near(ex(t).Xmult_mod, 0.35) && G.GAME.round_resets.discards === d0 + 1, 'after 5 more: Emboar, X0.35 a hand in a row, +1 discard', [key(t), ex(t)]);
  let r = play(['S_2']); ok(near(r.mult, 1.35), 'energized Emboar: X1.35 on the first', r.total);
  r = play(['S_3']); ok(near(r.mult, 1.7), 'X1.7 on the second', r.total);
});
await sec('evolution water', () => {
  start('ST5EV3');
  const n0 = G.GAME.round_resets.hands;
  const o = add('j_poke_oshawott');
  increment_energy(o, 'Water');
  ok(near(ex(o).Xmult_multi, 1.575) && ex(o).strikes === 1 && ex(o).retriggers === 1, 'Water Energy on Oshawott: its carried Ace X 1.575; the retrigger fixed', ex(o));
  for (let r = 1; r <= 5; r++) nextRound();
  ok(key(o) === 'j_poke_dewott' && ex(o).strikes === 2 && near(ex(o).Xmult_multi, 1.575) && G.GAME.round_resets.hands === n0 + 1, 'after 5 rounds: Dewott (first 2), +1 hand (not +2)', [key(o), ex(o)]);
  for (let r = 1; r <= 5; r++) nextRound();
  ok(key(o) === 'j_poke_samurott' && ex(o).strikes === 3 && near(ex(o).Xmult_multi, 1.575) && ex(o).energy_count === 1 && G.GAME.round_resets.hands === n0 + 1,
    'after 5 more: Samurott, the Energy carried to its Aces (X1.575), +1 hand', [key(o), ex(o)]);
  const r = play(['S_A']);
  ok(r.chips === 5 + 22 && near(r.mult, 1.575 * 1.575), 'energized Samurott: an Ace X1.575, twice (retriggered)', r.total);
});

// ------------------------------------------------------------------- Energy: the numbers after 1 / 2 / 3, and what stays fixed
await sec('energy', () => {
  start('ST5EN');
  const want = { snivy: ['Grass', 'mult', [5.6, 7.2, 8.8]], servine: ['Grass', 'mult', [11.2, 14.4, 17.6]], serperior: ['Grass', 'Xmult_multi', [1.3125, 1.375, 1.4375]],
    tepig: ['Fire', 'mult', [5.6, 7.2, 8.8]], pignite: ['Fire', 'mult', [8.4, 10.8, 13.2]], emboar: ['Fire', 'Xmult_mod', [0.3, 0.35, 0.4]],
    oshawott: ['Water', 'Xmult_multi', [1.575, 1.65, 1.725]], dewott: ['Water', 'Xmult_multi', [1.575, 1.65, 1.725]], samurott: ['Water', 'Xmult_multi', [1.575, 1.65, 1.725]] };
  for (const [n, [t, f, xs]] of Object.entries(want)) {
    const j = add('j_poke_' + n);
    const fixed = () => JSON.stringify(['h_size', 'd_size', 'hands', 'strikes', 'retriggers', 'rounds'].map((k) => ex(j)[k]));
    const f0 = fixed();
    xs.forEach((x, i) => { increment_energy(j, t); ok(near(ex(j)[f], x), `${n}: ${i + 1} ${t} Energy -> ${f} ${x}`, ex(j)[f]); });
    ok(fixed() === f0, n + ': the perk, retriggers and timer are untouched', [f0, fixed()]);
    j.remove(); flush();
  }
  // energized numbers fire: Snivy 3 Energy (+8.8 a card), Tepig 3 Energy (+8.8, +17.6), Samurott 3 Energy (X1.725)
  const [s] = fresh('ST5EN2', ['snivy']);
  for (let i = 0; i < 3; i++) increment_energy(s, 'Grass');
  let r = play(['S_2'], { held: ['H_5', 'D_6'], heldDebuffed: [0, 1] });
  ok(near(r.mult, 1 + 17.6), '3-Energy Snivy: two held debuffed cards, +8.8 each', r.total);
  const [t] = fresh('ST5EN3', ['tepig']);
  for (let i = 0; i < 3; i++) increment_energy(t, 'Fire');
  r = play(['S_2']); ok(near(r.mult, 1 + 8.8), '3-Energy Tepig: +8.8 on the first', r.total);
  r = play(['S_3']); ok(near(r.mult, 1 + 17.6), '+17.6 on the second', r.total);
  const [m] = fresh('ST5EN4', ['samurott']);
  for (let i = 0; i < 3; i++) increment_energy(m, 'Water');
  r = play(['S_A']); ok(near(r.mult, 1.725 * 1.725), '3-Energy Samurott: one Ace, X1.725 twice', r.total);
});

// ------------------------------------------------------------------- the Starter Pack offers them (a real pack, opened)
await sec('starter pack', () => {
  const seen = { grass: new Set(), fire: new Set(), water: new Set() };
  for (let i = 0; i < 60 && !(seen.grass.has('j_poke_snivy') && seen.fire.has('j_poke_tepig') && seen.water.has('j_poke_oshawott')); i++) {
    start('ST5PACK' + i);
    toShop();
    const pack = new Card(P_CARDS.empty, P_CENTERS.p_poke_pokepack_starter_pack);
    G.shop_booster.emplace(pack);
    G.GAME.dollars = 2000;
    if (!act({ type: 'buy', id: pack.sort_id }).ok) { ok(false, 'the Starter Pack opens'); break; }
    const ks = G.pack_cards.cards.map(key);
    seen.grass.add(ks[0]); seen.fire.add(ks[1]); seen.water.add(ks[2]);
  }
  ok(seen.grass.has('j_poke_snivy'), 'a Starter Pack\'s Grass slot offers Snivy', [...seen.grass]);
  ok(seen.fire.has('j_poke_tepig'), 'its Fire slot offers Tepig', [...seen.fire]);
  ok(seen.water.has('j_poke_oshawott'), 'its Water slot offers Oshawott', [...seen.water]);
  ok(![...seen.grass, ...seen.fire, ...seen.water].some((k) => ['servine', 'serperior', 'pignite', 'emboar', 'dewott', 'samurott'].some((n) => k === 'j_poke_' + n)), 'never an evolved form');
  // with Snivy's family owned, the pack never offers it again (poke_family_present)
  start('ST5PACKF'); add('j_poke_servine');
  ok(!starter_lists().grass.includes('j_poke_snivy') && !starter_lists().grass.includes('j_poke_servine'), 'a Servine owned: Snivy is out of the Grass slot (family present)');
});

// ------------------------------------------------------------------- the in-game texts
await sec('texts', () => {
  start('ST5TX');
  const X = {};
  for (const n of NAMES) { const j = add('j_poke_' + n); X[n] = flat(j); j.remove(); flush(); }
  console.log(JSON.stringify(X, null, 1));
  ok(/^\+1 hand size Contrary: each debuffed card held in hand gives \+4 Mult/.test(X.snivy) && /Evolves after 5 rounds/.test(X.snivy), 'Snivy text', X.snivy);
  ok(/gives \+8 Mult/.test(X.servine) && /Evolves after 5 rounds/.test(X.servine), 'Servine text', X.servine);
  ok(/Contrary: debuffed cards score as if not debuffed, and each gives X1\.25 Mult/.test(X.serperior), 'Serperior text', X.serperior);
  ok(/^\+1 discard Flame Charge: \+4 Mult for each hand in a row of the same poker hand this round/.test(X.tepig) && /This hand included/.test(X.tepig), 'Tepig text', X.tepig);
  ok(/\+6 Mult for each hand in a row/.test(X.pignite), 'Pignite text', X.pignite);
  ok(/Flame Charge: X1 Mult, plus X0\.25 for each hand in a row/.test(X.emboar), 'Emboar text', X.emboar);
  ok(/^\+1 hand Razor Shell: retrigger the first scored card \(Energy carries to Samurott\)/.test(X.oshawott), 'Oshawott text', X.oshawott);
  ok(/retrigger the first 2 scored cards/.test(X.dewott), 'Dewott text', X.dewott);
  ok(/retrigger the first 3 scored cards/.test(X.samurott) && /Shell Blade: scored Aces give X1\.5 Mult/.test(X.samurott), 'Samurott text', X.samurott);
});

done();
