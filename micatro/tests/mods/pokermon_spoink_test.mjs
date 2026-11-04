// The owner's Spoink line (2026-10-27; jokers/pokejokers_designs.js LINE F6; PORTING.md "The owner's Spoink line"):
//   Spoink (325) -> Grumpig (326), Psychic. Pearl: at the end of each round a random card held in hand with no seal gains a Pink
//   Seal (seeded; none unsealed: nothing). Spoink banks X0.1 Mult each time a Pink Seal triggers (its scoring effect firing, with or
//   without room for the Energy) and evolves after 8 triggers. Grumpig keeps the bank and Pearl; Spoink Dance: Pink Seals trigger
//   on EVERY hand while it is held (seals1.js; without one, the round's first hand only, as upstream — the Obituary Deck too);
//   X0.15 for each hand a Pink Seal triggered in (once per hand), Black Pearl: X0.3 instead when one had no room for its Energy.
//   Energy raises the gains (Xmult_mod, +20% of base each), never the bank (not retroactive); bank + Energy carry through evolution.
//   Blueprint copies the X Mult, never counts triggers or adds seals.
// Every ability is FIRED through real plays / rounds (act) with exact numbers.
//   node micatro/tests/mods/pokermon_spoink_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, act } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const LINE = ['spoink', 'grumpig'];
const ex = (j) => j.ability.extra;
const PINK = 'poke_pink_seal';
const empty_consumables = () => { for (const c of G.consumeables.cards.slice()) c.remove(); G.consumeables.cards.length = 0; G.GAME.consumeable_buffer = 0; flush(); };
const fill_consumables = () => { empty_consumables(); for (let i = 0; i < G.consumeables.config.card_limit; i++) add('c_poke_grass_energy'); };
/** Play these cards, each with a Pink Seal. */
function pinkPlay(keys, opts) {
  clearHand();
  const cs = hand(keys);
  for (const c of cs) c.set_seal(PINK, true);
  const r = play(cs, opts); flush();
  clearHand();
  return r;
}
/** A plain (unsealed) play: moves the round to its next hand. */
function plainPlay() { clearHand(); const r = play(hand(['C_2'])); flush(); clearHand(); return r; }
function endRound(held) { clearHand(); if (held) hand(held); winRound(hand(['C_2'])); flush(); }
function next() { nextRound(); clearHand(); }

// ------------------------------------------------------------------- pin, static data, order, family, art
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 26 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 26+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(LINE.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'both registered and ported', LINE.filter((n) => !C(n) || C(n).unported));
  ok(LINE.every((n) => (STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n)), 'defined with the owner\'s designs (micatro/pokejokers_designs)');
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || []).filter((c) => LINE.some((n) => (c.name || '') === n || (c.key || '').endsWith('_' + n))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has these species', addon);
});
sec('static', () => {
  start('SPOINK0');
  const want = { spoink: [1, 5, 'Basic'], grumpig: ['poke_safari', 8, 'One'] };
  for (const [n, [rarity, cost, stage]] of Object.entries(want)) {
    const c = C(n);
    ok(c && c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === 'Psychic' && c.config.extra.ptype === 'Psychic' && c.gen === 3,
      `${n}: rarity / cost / stage / Psychic / Gen 3`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_torkoal');
  ok(i > 0 && keys[i + 1] === 'j_poke_spoink' && keys[i + 2] === 'j_poke_grumpig' && keys[i + 3] === 'j_poke_spinda',
    'Pokédex order: after Torkoal (324), before Spinda (327)', keys.slice(i, i + 4));
  ok(JSON.stringify(poke_get_family_list('spoink')) === JSON.stringify(LINE), 'one family', poke_get_family_list('spoink'));
  const SPR = { spoink: 18, grumpig: 20 };
  ok(LINE.every((n) => C(n).atlas === 'poke_AtlasJokersBasicNatdex391' && C(n).pos.x === SPR[n] && C(n).pos.y === 21 && !C(n).soul_pos),
    'art: upstream 3.9.1\'s own cards (Natdex sheet, 18 / 20 at row 21)', LINE.map((n) => C(n) && [C(n).atlas, C(n).pos]));
  ok(!('pink_Xmult' in energy_values) && !('pink_triggers' in energy_values) && near(energy_values.Xmult_mod, 0.2),
    'Energy: the bank and the count are not energy fields; the gain (Xmult_mod) grows 20% of its base');
});

// ------------------------------------------------------------------- Pearl: the end-of-round Pink Seal
sec('pearl', () => {
  const pick = (seed) => {
    start(seed);
    add('j_poke_spoink');
    clearHand();
    const held = hand(['S_3', 'H_4', 'D_5', 'C_6']);
    held[0].set_seal('Red', true); held[2].set_seal('Gold', true);
    winRound(hand(['C_2'])); flush();
    return held.map((c) => c.seal || '-');
  };
  const a = pick('SPOINK_P1');
  ok(a.filter((s) => s === PINK).length === 1 && a[0] === 'Red' && a[2] === 'Gold' && (a[1] === PINK || a[3] === PINK),
    'end of round: exactly one held card WITHOUT a seal gains a Pink Seal (the sealed ones keep theirs)', a);
  ok(JSON.stringify(pick('SPOINK_P1')) === JSON.stringify(a), 'seeded: the same seed picks the same card', a);
  const seen = new Set();
  for (let k = 0; k < 12; k++) seen.add(pick('SPOINK_PS' + k).indexOf(PINK));
  ok(seen.has(1) && seen.has(3) && !seen.has(0) && !seen.has(2), 'random among the unsealed (both unsealed cards get picked across seeds; never a sealed one)', [...seen]);
  // none unsealed: nothing
  start('SPOINK_P2');
  add('j_poke_spoink');
  clearHand();
  const all = hand(['S_3', 'H_4']);
  all[0].set_seal('Red', true); all[1].set_seal('Blue', true);
  winRound(hand(['C_2'])); flush();
  ok(all[0].seal === 'Red' && all[1].seal === 'Blue', 'every held card already sealed: nothing changes', all.map((c) => c.seal));
  // empty hand: nothing (no throw)
  start('SPOINK_P3');
  add('j_poke_spoink');
  clearHand();
  winRound(hand(['C_2'])); flush();
  ok(G.hand.cards.every((c) => !c.seal), 'no held cards: nothing');
  // Blueprint doesn't add a second seal
  start('SPOINK_P4');
  add('j_poke_spoink');
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp);
  clearHand();
  const h4 = hand(['S_3', 'H_4', 'D_5']);
  winRound(hand(['C_2'])); flush();
  ok(h4.filter((c) => c.seal === PINK).length === 1, 'with a Blueprint copying it: still one Pink Seal a round', h4.map((c) => c.seal));
  // without Spoink: nothing
  start('SPOINK_P5');
  clearHand();
  const h5 = hand(['S_3', 'H_4']);
  winRound(hand(['C_2'])); flush();
  ok(h5.every((c) => !c.seal), 'without the line: no seal');
});

// ------------------------------------------------------------------- Spoink: X0.1 per Pink Seal trigger
sec('spoink x', () => {
  start('SPOINK1');
  const j = add('j_poke_spoink');
  empty_consumables();
  let t = pinkPlay(['S_K', 'H_K']).total;
  ok(ex(j).pink_triggers === 2 && near(ex(j).pink_Xmult, 1.2), 'two Pink Seals score in the first hand: 2 triggers, X1.2 banked', ex(j));
  ok(near(t.mult, 2 * 1.2) && G.consumeables.cards.length === 2, 'and the hand scores X1.2 (Pair 2 Mult -> 2.4); the seals made their 2 Energies', [t, G.consumeables.cards.length]);
  t = pinkPlay(['S_Q']).total;
  ok(ex(j).pink_triggers === 2 && near(ex(j).pink_Xmult, 1.2) && G.consumeables.cards.length === 2, 'the second hand: no trigger (no Grumpig), nothing banked', ex(j));
  ok(near(t.mult, 1.2), 'it still gives the banked X1.2', t);
  // full slots: no Energy, but it is still a trigger
  next();
  fill_consumables();
  const full = G.consumeables.cards.length;
  pinkPlay(['S_9']);
  ok(ex(j).pink_triggers === 3 && near(ex(j).pink_Xmult, 1.3) && G.consumeables.cards.length === full, 'no room for the Energy: still a trigger (3, X1.3), no Energy', [ex(j), G.consumeables.cards.length]);
  // retriggers: each is a trigger
  next();
  empty_consumables();
  G.consumeables.config.card_limit = 5;
  add('j_hanging_chad');
  pinkPlay(['D_9']);
  ok(ex(j).pink_triggers === 6 && near(ex(j).pink_Xmult, 1.6), 'Hanging Chad retriggers one Pink Seal twice: 3 triggers (6, X1.6)', ex(j));
  // Blueprint: copies the X, never the count
  next();
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp);
  for (const c of G.jokers.cards.filter((x) => key(x) === 'j_hanging_chad')) c.remove();
  flush();
  t = pinkPlay(['S_8']).total;
  ok(ex(j).pink_triggers === 7 && near(ex(j).pink_Xmult, 1.7), 'with a Blueprint copying it: one trigger counts once (7, X1.7)', ex(j));
  ok(near(t.mult, 1.7 * 1.7), 'the Blueprint gives the banked X too (X1.7 twice)', t);
  const d = JSON.stringify(describe(j));
  ok(/X1\.7 /.test(d) && /X0\.1 /.test(d) && /7\/8/.test(d) && /Pearl/.test(d) && /Evolves after/.test(d), 'the tooltip: Pearl, X0.1 per trigger, "Currently X1.7", "Pink Seal triggers: 7/8"', d.slice(0, 1200));
});

// ------------------------------------------------------------------- evolution at exactly 8; the bank carries
sec('evolution', () => {
  start('SPOINK2');
  const j = add('j_poke_spoink');
  ex(j).pink_triggers = 7; ex(j).pink_Xmult = 1.7;
  endRound();
  ok(key(j) === 'j_poke_spoink', '7 triggers: still Spoink at end of round', key(j));
  next();
  empty_consumables();
  pinkPlay(['S_K']);
  ok(ex(j).pink_triggers === 8 && near(ex(j).pink_Xmult, 1.8), '8 triggers (X1.8)', ex(j));
  endRound();
  ok(key(j) === 'j_poke_grumpig', 'the end of the round it reached 8: evolves into Grumpig', key(j));
  ok(near(ex(j).pink_Xmult, 1.8) && near(ex(j).Xmult_mod, 0.15), 'Grumpig keeps the X1.8; its gain is X0.15', ex(j));
  next();
  const t = plainPlay().total;
  ok(near(t.mult, 1.8), 'Grumpig gives the carried X1.8', t);
});

// ------------------------------------------------------------------- Grumpig: every hand; X0.15 once per hand; Black Pearl
sec('grumpig', () => {
  start('GRUMPIG1');
  const g = add('j_poke_grumpig');
  empty_consumables();
  G.consumeables.config.card_limit = 10;
  plainPlay(); plainPlay();
  ok(G.GAME.current_round.hands_played === 2 && near(ex(g).pink_Xmult, 1), 'two plain hands: nothing yet', ex(g));
  let t = pinkPlay(['S_K', 'H_K', 'D_K']).total;
  ok(G.consumeables.cards.length === 3, 'Spoink Dance: Pink Seals trigger in the round\'s 3rd hand (3 Energies)', G.consumeables.cards.length);
  ok(near(ex(g).pink_Xmult, 1.15), 'three Pink Seals in one hand: X0.15 once (X1.15), not per seal', ex(g));
  ok(near(t.mult, 3 * 1.15), 'and the hand scores it (Three of a Kind 3 Mult x 1.15)', t);
  pinkPlay(['S_Q']);
  ok(near(ex(g).pink_Xmult, 1.3) && G.consumeables.cards.length === 4, 'the next hand: +X0.15 again (X1.3), its Energy made', [ex(g), G.consumeables.cards.length]);
  plainPlay();
  ok(near(ex(g).pink_Xmult, 1.3), 'a hand with no Pink Seal: no gain', ex(g));
  // Black Pearl: no room
  next();
  fill_consumables();
  const full = G.consumeables.cards.length;
  pinkPlay(['S_9', 'H_9']);
  ok(near(ex(g).pink_Xmult, 1.6) && G.consumeables.cards.length === full, 'full slots: Black Pearl, X0.3 instead (X1.6), once per hand (two overflowed seals)', [ex(g), G.consumeables.cards.length]);
  // one with room, one without: still X0.3 once (the overflow gain replaces the normal one)
  empty_consumables();
  G.consumeables.config.card_limit = 1;
  pinkPlay(['S_8', 'H_8']);
  ok(near(ex(g).pink_Xmult, 1.9) && G.consumeables.cards.length === 1, 'one seal makes an Energy, the next has no room: X0.3 for the hand, not 0.45 (X1.9)', [ex(g), G.consumeables.cards.length]);
  // Grumpig keeps Pearl
  clearHand();
  const held = hand(['S_3', 'H_4']);
  held[0].set_seal('Red', true);
  winRound(hand(['C_2'])); flush();
  ok(held[1].seal === PINK && held[0].seal === 'Red', 'Grumpig keeps Pearl: the unsealed held card gains a Pink Seal at end of round', held.map((c) => c.seal));
  // a debuffed Grumpig: the round's first hand only
  next();
  empty_consumables();
  G.consumeables.config.card_limit = 10;
  plainPlay();
  g.set_debuff(true);
  pinkPlay(['S_7']);
  ok(G.consumeables.cards.length === 0, 'a debuffed Grumpig: no Spoink Dance (no Energy on hand 2)', G.consumeables.cards.length);
  g.set_debuff(false);
  // Blueprint: copies the X, no extra gain
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp);
  const before = ex(g).pink_Xmult;
  t = pinkPlay(['S_6']).total;
  ok(near(ex(g).pink_Xmult, before + 0.15), 'with a Blueprint: still X0.15 once', [before, ex(g).pink_Xmult]);
  ok(near(t.mult, ex(g).pink_Xmult * ex(g).pink_Xmult), 'the Blueprint copies the banked X', t);
  const d = JSON.stringify(describe(g));
  ok(/Spoink Dance/.test(d) && /Black Pearl/.test(d) && /X0\.15 /.test(d) && /X0\.3 /.test(d) && /Pearl:/.test(d), 'the tooltip: Pearl, Spoink Dance, X0.15, Black Pearl X0.3', d.slice(0, 1400));
});

// ------------------------------------------------------------------- no Grumpig: first hand only (no regression), Obituary Deck too
sec('no grumpig', () => {
  start('NOGRUMP');
  add('j_poke_charmander');
  empty_consumables();
  pinkPlay(['S_A']);
  ok(G.consumeables.cards.length === 1, 'first hand: an Energy', G.consumeables.cards.length);
  pinkPlay(['S_K']); pinkPlay(['S_Q']);
  ok(G.consumeables.cards.length === 1, 'no Grumpig: hands 2 and 3 make none', G.consumeables.cards.length);
  const s = add('j_poke_spoink');
  pinkPlay(['S_J']);
  ok(G.consumeables.cards.length === 1 && ex(s).pink_triggers === 0, 'Spoink alone doesn\'t make them trigger later: no Energy, no trigger', ex(s));
  // the Obituary Deck (+ sleeve): every card Pink; 1 in 3 fall-off (made sure)
  const obit = () => {
    newRun({ seed: 'SPOINK_OBIT', back: 'b_poke_obituarydeck', sleeve: 'sleeve_poke_obituarysleeve', mods: ['pokermon'], modOptions: { pokermon: { pokemon_legacy: true } } });
    flush();
    G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
    act({ type: 'select_blind' }); clearHand();
    empty_consumables();
    G.consumeables.config.card_limit = 10;
    G.GAME.probabilities.normal = 3;
  };
  obit();
  ok(G.GAME.modifiers.poke_pink_seal_selfdestruct && G.playing_cards.every((c) => c.seal === PINK), 'the Obituary Deck + Sleeve: every card Pink, seals may fall off');
  const one = () => { clearHand(); const [c] = hand(['S_A']); c.set_seal(PINK, true); play([c]); flush(); clearHand(); return c; };
  let c1 = one();
  ok(G.consumeables.cards.length === 1 && !c1.seal, 'Obituary, first hand: an Energy, then the seal falls off', [G.consumeables.cards.length, c1.seal]);
  c1 = one();
  ok(G.consumeables.cards.length === 1 && c1.seal === PINK, 'Obituary, second hand without Grumpig: no Energy, the seal stays (as before)', [G.consumeables.cards.length, c1.seal]);
  obit();
  add('j_poke_grumpig');
  one();
  c1 = one();
  ok(G.consumeables.cards.length === 2 && !c1.seal, 'Obituary with Grumpig: hand 2 makes an Energy too, and its fall-off roll still applies', [G.consumeables.cards.length, c1.seal]);
  G.GAME.probabilities.normal = 0;
  c1 = one();
  ok(G.consumeables.cards.length === 3 && c1.seal === PINK, '... (a failed roll keeps the seal)', [G.consumeables.cards.length, c1.seal]);
});

// ------------------------------------------------------------------- Energy: the gains, never retroactive; carried through evolution
sec('energy', () => {
  start('SPOINK5');
  const j = add('j_poke_spoink');
  empty_consumables();
  G.consumeables.config.card_limit = 10;
  pinkPlay(['S_K']);
  ok(near(ex(j).pink_Xmult, 1.1), 'before Energy: X1.1', ex(j));
  const e = add('c_poke_psychic_energy');
  act({ type: 'use', id: e.sort_id }); flush();
  ok(ex(j).energy_count === 1 && near(ex(j).Xmult_mod, 0.12), 'a Psychic Energy used on Spoink: X0.12 per trigger', ex(j));
  ok(near(ex(j).pink_Xmult, 1.1), 'not retroactive: the banked X1.1 stays', ex(j).pink_Xmult);
  next();
  empty_consumables();
  pinkPlay(['S_K']);
  ok(near(ex(j).pink_Xmult, 1.22), 'the next trigger banks X0.12 (X1.22)', ex(j).pink_Xmult);
  increment_energy(j, 'Psychic');
  ok(near(ex(j).Xmult_mod, 0.14), '2 Energy: X0.14', ex(j).Xmult_mod);
  increment_energy(j, 'Psychic');
  ok(near(ex(j).Xmult_mod, 0.16), '3 Energy: X0.16', ex(j).Xmult_mod);
  const k = add('j_poke_spoink');
  increment_energy(k, 'Colorless');
  ok(near(ex(k).Xmult_mod, 0.11), 'a Colorless Energy (half): X0.11', ex(k).Xmult_mod);
  k.remove(); flush();
  // the Energy carries: Spoink (3 Energy) -> Grumpig X0.24, Black Pearl X0.48
  ex(j).pink_triggers = 8;
  endRound();
  ok(key(j) === 'j_poke_grumpig' && ex(j).energy_count === 3 && near(ex(j).Xmult_mod, 0.24) && near(ex(j).pink_Xmult, 1.22),
    'Grumpig keeps 3 Energy: X0.24 per hand (0.15 + 3 x 0.03), and the X1.22 banked', ex(j));
  next();
  empty_consumables();
  G.consumeables.config.card_limit = 10;
  pinkPlay(['S_K']);
  ok(near(ex(j).pink_Xmult, 1.46), 'energized Grumpig: a hand with a Pink Seal banks X0.24 (X1.46)', ex(j).pink_Xmult);
  fill_consumables();
  pinkPlay(['S_Q']);
  ok(near(ex(j).pink_Xmult, 1.94), 'energized Black Pearl: X0.48 (X1.94)', ex(j).pink_Xmult);
  const d = JSON.stringify(describe(j));
  ok(/X0\.24 /.test(d) && /X0\.48 /.test(d), 'the tooltip shows the energized X0.24 / X0.48', d.slice(0, 1400));
  const g1 = add('j_poke_grumpig');
  increment_energy(g1, 'Psychic');
  ok(near(ex(g1).Xmult_mod, 0.18), '1 Energy on Grumpig: X0.18 (Black Pearl X0.36)', ex(g1).Xmult_mod);
});

sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(LINE.every((n) => J['j_poke_' + n] && J['j_poke_' + n].name.toLowerCase() === n), 'the 2 texts', LINE.filter((n) => !J['j_poke_' + n]));
  ok(J.j_poke_spoink.text.some((l) => /Pearl/.test(l)) && J.j_poke_grumpig.text.some((l) => /Spoink Dance/.test(l)) && J.j_poke_grumpig.text.some((l) => /Black Pearl/.test(l))
    && J.j_poke_spoink.text.some((l) => /Evolves after/.test(l)) && !J.j_poke_grumpig.text.some((l) => /Evolves/.test(l)),
  'Pearl / Spoink Dance / Black Pearl; the evolution footer on Spoink only');
});

done();
