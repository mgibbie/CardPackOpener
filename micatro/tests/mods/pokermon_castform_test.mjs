// The owner's Castform (2026-10-27; jokers/pokejokers_designs.js "Castform 351"; PORTING.md "The owner's Castform"):
//   Rare $7, single-stage, starts Colorless. Forecast: when the round's FIRST hand is drawn, the suit held most picks its form for
//   the whole round, and its Pokermon type with it:
//     Hearts + Diamonds (counted together) -> Sunny, Fire:   scored Hearts / Diamonds +4 Mult
//     Clubs                                -> Rainy, Water:  scored Clubs +30 Chips; the first scored Club retriggers
//     Spades                               -> Snowy, Water:  each Spade held in hand X1.1 Mult
//     a tie for the most (or no suit)      -> Normal, Colorless: +10 Mult
//   A Wild card counts once for each of the three; a debuffed card (or a Stone / Hazard) for none. After the round it is Normal
//   (Colorless) again. Energy: every form's number (mult1 / mult2 +40%, chips1 +30%, Xmult_multi +5% of base), the retrigger fixed;
//   Colorless Energy always works, its form's type works while it is in that form. Its type never counts against Monotype.
// Every ability is FIRED through real rounds (act: select_blind deals the first hand) with exact numbers.
//   node micatro/tests/mods/pokermon_castform_test.mjs
import path from 'path';
import { T, start, hand, add, play, winRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { energy_matches, increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { is_type, get_type, find_pokemon_type, apply_type_sticker } from '../../mods/pokermon/systems/types.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import * as DESIGNS from '../../mods/pokermon/jokers/pokejokers_designs.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const forecast = DESIGNS.forecast || (() => 'n/a'); // (the designs' Forecast reader: absent before Castform)
const key = (c) => c.config.center.key;
const C = () => P_CENTERS.j_poke_castform;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const form = (j) => j && j.ability.extra.form;

/** Spec of a card: 'H_K', or {k: 'C_2', wild: true} / {k: 'C_2', debuff: true}. */
function mk(spec, area) {
  const s = typeof spec === 'string' ? { k: spec } : spec;
  const c = create_playing_card({ front: P_CARDS[s.k], center: P_CENTERS[s.wild ? 'm_wild' : s.stone ? 'm_stone' : 'c_base'] }, area);
  if (s.debuff) { c.ability.debuff_sources = { test: true }; c.set_debuff(); }
  return c;
}
/** Make the deck exactly these cards (the rest wait in the discard pile), so the blind's first deal is exactly them. */
function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  return specs.map((s) => mk(s, G.deck));
}
/** A new run at the first blind select with these jokers; the first deal is `specs`. -> the jokers */
function deal(seed, specs, jokers = ['j_poke_castform'], extra) {
  start(seed, {}, { noBlind: true, ...(extra || {}) });
  const js = jokers.map((k) => add(k));
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
  return js;
}
/** From the round in progress: win it, cash out, next blind with this first deal. */
function nextDeal(specs) {
  clearHand();
  winRound(); flush();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  const shopForm = G.jokers.cards.filter((c) => key(c) === 'j_poke_castform').map((c) => [form(c), ex(c).ptype]);
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
  return shopForm;
}
const play2 = (keys) => { clearHand(); return play(hand(keys)).total; };

// ------------------------------------------------------------------- pin, static data, order, pool, art
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 27 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 27+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(C() && !C().unported && STATUS.PORTED.jokers.includes('j_poke_castform'), 'registered and ported');
  ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes('castform'), 'defined with the owner\'s designs (micatro/pokejokers_designs)');
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || []).filter((c) => /castform/i.test(c.name || '') || /castform/i.test(c.key || '')).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has Castform', addon);
});
sec('static', () => {
  start('CASTFORM0');
  const c = C();
  ok(c.rarity === 3 && c.cost === 7 && c.stage === 'Basic' && c.ptype === 'Colorless' && c.config.extra.ptype === 'Colorless' && c.gen === 3,
    'Rare $7, Basic, Colorless, Gen 3', [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_castform');
  ok(i > 0 && keys[i - 1] === 'j_poke_milotic' && keys[i + 1] === 'j_poke_kecleon', 'Pokédex order: after Milotic (350), before Kecleon (352)', keys.slice(i - 1, i + 2));
  ok(poke_get_family_list('castform').length <= 1 && !C().config.evo_rqmt && !('rounds' in C().config.extra), 'single-stage: no family, no evolution', poke_get_family_list('castform'));
  ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === 10 && c.pos.y === 23 && !c.soul_pos, 'art: upstream 3.9.1\'s own card (Natdex sheet 10, 23)', [c.atlas, c.pos]);
  ok(pool_filter(c, 'Joker') === undefined && c.in_pool(c) !== false, 'Castform can be rolled in the shop (Rare)');
  ok(['mult1', 'chips1', 'Xmult_multi', 'mult2'].every((f) => f in energy_values) && !('retriggers' in energy_values),
    'Energy fields: mult1 / chips1 / Xmult_multi / mult2 (the retrigger is not one)');
  ok(c.poke_mono_exempt === true, 'flagged poke_mono_exempt (Monotype leaves it out)');
});

// ------------------------------------------------------------------- Forecast: the form from the round's first deal
sec('forecast', () => {
  const cases = [
    ['sunny', 'Fire', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9'], 'Hearts + Diamonds most (4 vs 2 vs 2)'],
    ['sunny', 'Fire', ['H_2', 'H_3', 'D_4', 'D_5', 'C_6', 'C_7', 'C_8', 'S_9'], 'Hearts and Diamonds count TOGETHER (2 + 2 = 4 red beats 3 Clubs)'],
    ['rainy', 'Water', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9'], 'Clubs most (4 vs 2 red vs 2)'],
    ['snowy', 'Water', ['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'C_8', 'S_9'], 'Spades most -> Snowy, Water (Ice maps to Water)'],
    ['normal', 'Colorless', ['C_2', 'C_3', 'C_4', 'S_5', 'S_6', 'S_7', 'H_8', 'D_9'], 'a tie for the most (3 Clubs, 3 Spades, 2 red) -> Normal'],
    ['normal', 'Colorless', ['H_2', 'H_3', 'D_4', 'C_5', 'C_6', 'C_7', 'S_8', 'S_9'], 'a tie between red and Clubs (3 / 3) -> Normal'],
    // Wild cards count for every suit
    ['rainy', 'Water', ['C_2', 'C_3', 'S_4', 'H_5', { k: 'D_6', wild: true }, { k: 'H_7', wild: true }, { k: 'S_8', stone: true }, { k: 'D_9', stone: true }],
      'Wild cards count for each suit (Clubs 4, red 3, Spades 3; the Stone cards for none)'],
    ['normal', 'Colorless', ['H_2', 'C_3', 'S_4', { k: 'D_5', wild: true }, { k: 'C_6', wild: true }, { k: 'S_7', stone: true }, { k: 'H_8', stone: true }, { k: 'C_9', stone: true }],
      'one card of each colour + 2 Wild: 3 / 3 / 3 -> Normal (a Wild breaks no tie)'],
    // debuffed cards don't count
    ['snowy', 'Water', [{ k: 'C_2', debuff: true }, { k: 'C_3', debuff: true }, { k: 'C_4', debuff: true }, 'C_5', 'S_6', 'S_7', 'S_8', 'H_9'],
      'debuffed cards count for nothing (4 Clubs, 3 of them debuffed: Spades 3 > Clubs 1, red 1)'],
  ];
  cases.push(['normal', 'Colorless', [{ k: 'S_2', debuff: true }, { k: 'S_3', debuff: true }, 'S_4', 'C_5', 'H_6', { k: 'S_7', stone: true }, { k: 'C_8', stone: true }, { k: 'H_9', stone: true }],
    'debuffed Spades don\'t count: 1 / 1 / 1 -> Normal']);
  cases.push(['normal', 'Colorless', [{ k: 'S_2', stone: true }, { k: 'C_3', stone: true }, { k: 'H_4', stone: true }, { k: 'D_5', stone: true }, { k: 'S_6', stone: true }, { k: 'C_7', stone: true }, { k: 'H_8', stone: true }, { k: 'D_9', stone: true }],
    'no suited card at all -> Normal']);
  cases.forEach(([want, type, specs, why], n) => {
    const [j] = deal('CFF' + n, specs);
    ok(G.hand.cards.length === 8 && specs.length === 8, `(${why}) the first deal is the stacked 8 cards`, G.hand.cards.length);
    ok(form(j) === want && ex(j).ptype === type && get_type(j) === type, `${why}: ${want} / ${type}`, [form(j), ex(j).ptype]);
  });
  // Smeared Joker: Clubs and Spades count as each other, so a black lead is a tie (red can still win)
  const [sm] = deal('CFF_SM', ['C_2', 'C_3', 'C_4', 'C_5', 'S_6', 'H_7', 'D_8', 'H_9'], ['j_poke_castform', 'j_smeared']);
  ok(form(sm) === 'normal', 'with Smeared Joker a black lead is a tie (Clubs 5 = Spades 5) -> Normal', form(sm));
  const [sm2] = deal('CFF_SM2', ['H_2', 'D_3', 'H_4', 'D_5', 'H_6', 'C_7', 'S_8', 'C_9'], ['j_poke_castform', 'j_smeared']);
  ok(form(sm2) === 'sunny', 'with Smeared Joker red can still lead (5 vs 3 vs 3) -> Sunny', form(sm2));
  // it fires on the round's first deal, before any play (Blueprint: no forecast of its own, no crash)
  const [cf, bp] = deal('CFF_BP', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9'], ['j_poke_castform', 'j_blueprint']);
  ok(form(cf) === 'rainy' && G.GAME.current_round.hands_played === 0, 'Forecast: set when the first hand is drawn, before anything is played', [form(cf)]);
  ok(key(bp) === 'j_blueprint' && G.STATE === STATES.SELECTING_HAND, 'with a Blueprint in the row: the round goes on');
  // without Castform: nothing about forms anywhere (no throw)
  deal('CFF_NONE', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9'], ['j_joker']);
  ok(G.STATE === STATES.SELECTING_HAND, 'a run without Castform deals as usual');
});

// ------------------------------------------------------------------- the type changes (Kecleon-style): synergy + Energy matching
sec('type', () => {
  const [cf] = deal('CFT1', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9']);
  ok(form(cf) === 'sunny' && is_type(cf, 'Fire') && !is_type(cf, 'Colorless') && find_pokemon_type('Fire').includes(cf), 'Sunny: it IS Fire (is_type / find_pokemon_type)', ex(cf).ptype);
  ok(energy_matches(cf, 'Fire', false) && !energy_matches(cf, 'Water', false) && energy_matches(cf, 'Colorless', true) && !energy_matches(cf, 'Colorless', false),
    'Sunny: Fire Energy matches, Water doesn\'t; Colorless Energy works (the include_colorless path)');
  const v = {}; view_card(cf, v);
  ok(v.poke && v.poke.ptype === 'Fire' && v.poke.form === 'sunny' && !v.poke.tera, 'the view: Fire, form sunny (its own type, no Tera sticker)', v.poke);
  // a Fire synergy: Kecleon (X2 with 3+ jokers of its type) takes the type of the joker to its right = Castform, Fire
  const [k, cf2, ch] = deal('CFT2', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9'], ['j_poke_kecleon', 'j_poke_castform', 'j_poke_charmander']);
  ok(form(cf2) === 'sunny' && k.ability.extra.ptype === 'Fire' && key(ch) === 'j_poke_charmander', 'Kecleon left of a Sunny Castform turns Fire (re-read on the type change)', [form(cf2), k.ability.extra.ptype]);
  let t = play2(['S_A']);
  ok(near(t.mult, 2), 'Kecleon\'s X2 fires: 3 Fire jokers (Kecleon, Sunny Castform, Charmander) — High Card 1 Mult -> X2', t);
  const [k3] = deal('CFT3', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9'], ['j_poke_kecleon', 'j_poke_castform', 'j_poke_charmander']);
  t = play2(['S_A']);
  ok(k3.ability.extra.ptype === 'Water' && near(t.mult, 1), 'a Rainy Castform is Water: Kecleon turns Water, no X2 (Fire count 1)', [k3.ability.extra.ptype, t]);
  const cf3 = G.jokers.cards[1];
  ok(energy_matches(cf3, 'Water', false) && !energy_matches(cf3, 'Fire', false) && find_pokemon_type('Water').includes(cf3), 'Rainy: Water Energy matches, Fire doesn\'t');
  // a player's Tera sticker still overrides the weather's type (as on any joker)
  const [cf4] = deal('CFT4', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9']);
  apply_type_sticker(cf4, 'Dark');
  ok(form(cf4) === 'rainy' && get_type(cf4) === 'Dark' && energy_matches(cf4, 'Dark', false) && !energy_matches(cf4, 'Water', false), 'a Tera sticker overrides the type (Dark), the form stays Rainy', [form(cf4), get_type(cf4)]);
});

// ------------------------------------------------------------------- each form's effect, exact numbers
sec('sunny', () => {
  deal('CFS1', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9']);
  let t = play2(['H_K', 'D_K']);
  ok(t.chips === 30 && near(t.mult, 10), 'Sunny: Pair of a Heart and a Diamond: 30 Chips, 2 + 4 + 4 = 10 Mult', t);
  t = play2(['S_K', 'C_K']);
  ok(t.chips === 30 && near(t.mult, 2), 'Sunny: black cards give nothing (2 Mult)', t);
  clearHand();
  const w = [mk('H_Q', G.hand), mk({ k: 'S_Q', wild: true }, G.hand)];
  t = play(w).total;
  ok(near(t.mult, 10), 'Sunny: a scored Wild card counts as a Heart / Diamond (+4)', t);
  clearHand();
  const db = [mk('H_J', G.hand), mk({ k: 'D_J', debuff: true }, G.hand)];
  t = play(db).total;
  ok(near(t.mult, 6), 'Sunny: a debuffed Diamond gives nothing (2 + 4)', t);
});
sec('rainy', () => {
  deal('CFR1', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9']);
  let t = play2(['C_K', 'S_K']);
  ok(t.chips === 100 && near(t.mult, 2), 'Rainy: Pair (club + spade): 10 + (10 + 30) x 2 (the Club retriggers) + 10 = 100 Chips', t);
  t = play2(['C_K', 'C_K']);
  ok(t.chips === 130, 'Rainy: two Clubs: only the FIRST retriggers: 10 + 40 x 2 + 40 = 130 Chips', t);
  t = play2(['S_K', 'C_K']);
  ok(t.chips === 100, 'Rainy: the first scored Club retriggers wherever it sits (100)', t);
  t = play2(['H_K', 'D_K']);
  ok(t.chips === 30 && near(t.mult, 2), 'Rainy: no Club, nothing (30 / 2)', t);
  const r = (() => { clearHand(); return play(hand(['C_A', 'S_A'])); })();
  ok(r.events.some((e) => e.type === 'status' && e.message === 'Again!'), 'Rainy: "Again!" on the retrigger');
});
sec('snowy', () => {
  deal('CFW1', ['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'C_8', 'S_9']);
  clearHand();
  hand(['S_2', 'S_3', 'H_4']);
  let t = play(hand(['H_K', 'D_K'])).total;
  ok(t.chips === 30 && near(t.mult, 2 * 1.1 * 1.1), 'Snowy: 2 Spades held: 2 x 1.1 x 1.1 = 2.42 Mult (the held Heart gives nothing)', t);
  clearHand();
  hand(['S_2']); mk({ k: 'S_5', debuff: true }, G.hand); mk({ k: 'H_6', wild: true }, G.hand);
  t = play(hand(['H_K', 'D_K'])).total;
  ok(near(t.mult, 2 * 1.1 * 1.1), 'Snowy: a held Wild counts as a Spade, a debuffed Spade doesn\'t (X1.1 twice)', t);
  clearHand();
  t = play(hand(['S_K', 'S_Q'])).total;
  ok(near(t.mult, 1), 'Snowy: PLAYED Spades give nothing (High Card 1 Mult)', t);
});
sec('normal', () => {
  deal('CFN1', ['C_2', 'C_3', 'C_4', 'S_5', 'S_6', 'S_7', 'H_8', 'D_9']);
  const t = play2(['H_K', 'D_K']);
  ok(t.chips === 30 && near(t.mult, 12), 'Normal: +10 Mult (Pair 2 -> 12)', t);
  const [, bp] = deal('CFN2', ['C_2', 'C_3', 'C_4', 'S_5', 'S_6', 'S_7', 'H_8', 'D_9'], ['j_blueprint', 'j_poke_castform']);
  const t2 = play2(['H_K', 'D_K']);
  ok(key(bp) === 'j_poke_castform' && near(t2.mult, 22), 'a Blueprint copies the form\'s effect (+10 twice: 22)', t2);
  deal('CFN3', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9'], ['j_blueprint', 'j_poke_castform']);
  const t3 = play2(['H_K', 'D_K']);
  ok(near(t3.mult, 18), 'a Blueprint copying a Sunny Castform: +4 x 2 cards x 2 = 18', t3);
});

// ------------------------------------------------------------------- persistence through the round; Normal again after it
sec('persist', () => {
  const [cf] = deal('CFP1', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9']);
  ok(form(cf) === 'sunny', 'the round starts Sunny');
  // the rest of the deck is all Spades: later draws (after a play, after a discard) never re-forecast
  for (let i = 0; i < 20; i++) mk('S_' + (2 + (i % 8)), G.deck);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  const red = (n) => G.hand.cards.filter((c) => c.base.suit === 'Hearts' || c.base.suit === 'Diamonds').slice(0, n).map((c) => c.sort_id);
  act({ type: 'highlight', ids: red(2) });
  act({ type: 'discard' }); flush();
  ok(form(cf) === 'sunny' && G.GAME.current_round.discards_used === 1, 'after a discard (Spades drawn): still Sunny', form(cf));
  act({ type: 'highlight', ids: red(1) });
  act({ type: 'play' }); flush();
  ok(form(cf) === 'sunny' && ex(cf).ptype === 'Fire' && G.GAME.current_round.hands_played === 1, 'after a played hand (more Spades drawn): still Sunny, Fire', [form(cf), G.hand.cards.map((c) => c.base.suit)]);
  ok(forecast(G.hand.cards) === 'snowy', '(the hand held now would forecast Snowy: the form is not re-read)', G.hand.cards.map((c) => c.base.suit));
  const shop = nextDeal(['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'C_8', 'S_9']);
  ok(JSON.stringify(shop) === JSON.stringify([['normal', 'Colorless']]), 'after the round (the shop): Normal again, Colorless', shop);
  ok(form(cf) === 'snowy' && ex(cf).ptype === 'Water', 'the next round\'s first deal forecasts again: Snowy', form(cf));
  const v = {}; view_card(cf, v);
  ok(v.poke.ptype === 'Water' && v.poke.form === 'snowy', 'the view follows', v.poke);
});

// ------------------------------------------------------------------- Energy: every form's numbers
sec('energy', () => {
  const [cf] = deal('CFE1', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9']);
  G.consumeables.config.card_limit = 10;
  const e = add('c_poke_fire_energy');
  act({ type: 'use', id: e.sort_id }); flush();
  ok(ex(cf).energy_count === 1 && near(ex(cf).mult1, 5.6) && near(ex(cf).chips1, 39) && near(ex(cf).Xmult_multi, 1.155) && near(ex(cf).mult2, 14) && ex(cf).retriggers === 1,
    'a Fire Energy used on a Sunny Castform: +5.6 / +39 / X1.155 / +14 (every form), the retrigger fixed', ex(cf));
  let t = play2(['H_K', 'D_K']);
  ok(near(t.mult, 2 + 5.6 * 2), 'energized Sunny: 2 + 5.6 x 2 = 13.2 Mult', t);
  const w = add('c_poke_water_energy');
  const before = ex(cf).energy_count;
  act({ type: 'use', id: w.sort_id }); flush();
  ok(ex(cf).energy_count === before && near(ex(cf).mult1, 5.6), 'a Water Energy does nothing to a Sunny (Fire) Castform', ex(cf));
  // Colorless Energy on a Sunny (Fire) Castform: half strength, as on any non-Colorless joker
  const ce = add('c_poke_colorless_energy');
  act({ type: 'use', id: ce.sort_id }); flush();
  ok(ex(cf).c_energy_count === 1 && near(ex(cf).mult1, 6.4) && near(ex(cf).chips1, 43.5), 'Colorless Energy on Sunny: half (+0.8 Mult, +4.5 Chips)', ex(cf));
  // Rainy: Water matches; energized Chips
  const [cr] = deal('CFE2', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9']);
  G.consumeables.config.card_limit = 10;
  const w2 = add('c_poke_water_energy');
  act({ type: 'use', id: w2.sort_id }); flush();
  ok(ex(cr).energy_count === 1 && near(ex(cr).chips1, 39), 'a Water Energy on a Rainy Castform: +39 Chips per Club', ex(cr));
  t = play2(['C_K', 'S_K']);
  ok(t.chips === 10 + (10 + 39) * 2 + 10, 'energized Rainy: 10 + 49 x 2 + 10 = 128 Chips (still one retrigger)', t);
  // Snowy: X1.155 per held Spade after one Water Energy; three: X1.265
  const [cs] = deal('CFE3', ['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'C_8', 'S_9']);
  increment_energy(cs, 'Water'); increment_energy(cs, 'Water'); increment_energy(cs, 'Water');
  ok(ex(cs).energy_count === 3 && near(ex(cs).Xmult_multi, 1.265) && near(ex(cs).mult1, 8.8) && near(ex(cs).chips1, 57) && near(ex(cs).mult2, 22), '3 Energy: X1.265 / +8.8 / +57 / +22', ex(cs));
  clearHand(); hand(['S_2', 'S_3']);
  t = play(hand(['H_K', 'D_K'])).total;
  ok(near(t.mult, 2 * 1.265 * 1.265), 'energized Snowy: 2 x 1.265 x 1.265 Mult', t);
  // Normal: Colorless Energy at full strength; Fire / Water don't match
  const [cn] = deal('CFE4', ['C_2', 'C_3', 'C_4', 'S_5', 'S_6', 'S_7', 'H_8', 'D_9']);
  ok(!energy_matches(cn, 'Fire', false) && !energy_matches(cn, 'Water', false) && energy_matches(cn, 'Colorless', true), 'Normal: only Colorless Energy matches');
  G.consumeables.config.card_limit = 10;
  const ce2 = add('c_poke_colorless_energy');
  act({ type: 'use', id: ce2.sort_id }); flush();
  ok(near(ex(cn).mult2, 14) && near(ex(cn).mult1, 5.6), 'Colorless Energy on a Normal Castform: full strength (+14 / +5.6)', ex(cn));
  t = play2(['H_K', 'D_K']);
  ok(near(t.mult, 16), 'energized Normal: 2 + 14 = 16 Mult', t);
  // the energized numbers carry into the next round's form
  nextDeal(['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9']);
  t = play2(['H_K', 'D_K']);
  ok(form(cn) === 'sunny' && near(t.mult, 2 + 5.6 * 2), 'the next round Sunny: the Energy is kept (+5.6 each)', [form(cn), t]);
  const d = JSON.stringify(describe(cn));
  ok(/\+5\.6/.test(d) && /Sunny Form/.test(d), 'the tooltip shows Sunny Form and the energized +5.6', d.slice(0, 1600));
});

// ------------------------------------------------------------------- Monotype: Castform's type never breaks it; Nuzlocke as usual
sec('monotype', () => {
  const RB = () => G.GAME.run_badges;
  const fresh = (seed) => { newRun({ seed, seeded: false, back: 'b_red', mods: ['pokermon'] }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; };
  fresh('CFMONO1');
  add('j_poke_charmander');
  const cf = add('j_poke_castform');
  stackDeck(['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9']);
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().type === 'Fire', 'a Charmander + Castform run locks Fire at the first round (Castform left out)', RB());
  ok(form(cf) === 'rainy' && ex(cf).ptype === 'Water', 'Castform turns Rainy (Water) in that Fire run', form(cf));
  clearHand(); winRound(); flush(); act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP && toView().run_badges.mono_at_risk === false, 'the shop: no Monotype warning for Castform', toView().run_badges);
  act({ type: 'next_round' });
  stackDeck(['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'C_8', 'S_9']);
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().type === 'Fire' && form(cf) === 'snowy', 'the next round (Castform Normal at the check, then Snowy): Monotype intact', [RB(), form(cf)]);
  clearHand(); winRound(); flush(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  stackDeck(['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9']);
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().mono_reason === '', 'a third round, Rainy again: still Monotype', RB());
  // a Water joker in that run still breaks it (the check is otherwise normal)
  clearHand(); winRound(); flush(); act({ type: 'cash_out' });
  add('j_poke_squirtle');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); flush();
  ok(!RB().mono && /Squirtle \(Water\) in a Fire run/.test(RB().mono_reason), 'a Squirtle in the Fire run still breaks it', RB().mono_reason);
  // Castform alone never locks a type
  fresh('CFMONO2');
  const solo = add('j_poke_castform');
  stackDeck(['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9']);
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().type === null && form(solo) === 'sunny', 'Castform alone: Monotype intact, no type locked', RB());
  // Nuzlocke: Castform is a typed (Colorless) gain like any Pokémon
  ok(RB().nuz && solo.ability.rb_type === 'Colorless', 'Nuzlocke: Castform was gained as Colorless (a Pokémon: not broken)', [RB().nuz, solo.ability.rb_type]);
});

// ------------------------------------------------------------------- resume mid-round restores the form
sec('resume', () => {
  let tried = 0, checked = false;
  for (const seed of ['CFRES1', 'CFRES2', 'CFRES3', 'CFRES4', 'CFRES5', 'CFRES6', 'CFRES7', 'CFRES8']) {
    const s = new Session();
    s.start({ seed, customDeck: { name: 'Weather', mods: ['pokermon'], jokers: [{ key: 'j_poke_castform' }] } });
    s.act({ type: 'select_blind' }); flush();
    const cf = G.jokers.cards.find((c) => key(c) === 'j_poke_castform');
    tried++;
    if (!cf || form(cf) === 'normal') continue;
    const want = [form(cf), ex(cf).ptype];
    // play a hand (new cards drawn), then resume from the recipe
    const ids = G.hand.cards.slice(0, 1).map((c) => c.sort_id);
    s.act({ type: 'highlight', ids }); s.act({ type: 'play' }); flush();
    if (G.STATE !== STATES.SELECTING_HAND) continue;
    const live = [form(cf), ex(cf).ptype];
    const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
    const cf2 = G.jokers.cards.find((c) => key(c) === 'j_poke_castform');
    ok(!r.stoppedAt && G.STATE === STATES.SELECTING_HAND, `resume (${seed}): every move replays, mid-round`, r.stoppedAt);
    ok(JSON.stringify(live) === JSON.stringify(want) && cf2 && JSON.stringify([form(cf2), ex(cf2).ptype]) === JSON.stringify(want),
      `resume (${seed}) mid-round: the form is restored (${want.join(' / ')})`, [want, live, cf2 && [form(cf2), ex(cf2).ptype]]);
    const v = {}; view_card(cf2, v);
    ok(v.poke && v.poke.form === want[0] && v.poke.ptype === want[1], 'resume: its view (card art / type) too', v.poke);
    checked = true;
    break;
  }
  ok(checked, 'a seeded run whose first deal is not Normal was found and resumed', tried);
});

// ------------------------------------------------------------------- art per form + text
sec('art', () => {
  const [cf] = deal('CFA1', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9']);
  const WANT = { sunny: 0, rainy: 2, snowy: 4 };
  for (const [f, x] of Object.entries(WANT)) {
    ex(cf).form = f;
    const v = {}; view_card(cf, v);
    const face = POKE_UI.face({ center: 'j_poke_castform', facing: 'front', poke: v.poke, atlas: C().atlas, pos: C().pos }, { area: 'jokers' });
    ok(face && face.atlas === 'poke_AtlasJokersBasicGen03391' && face.pos.x === x && face.pos.y === 0, `${f}: drawn as its 3.9.1 Gen 3 card {${x},0}`, face);
    const sh = POKE_UI.face({ center: 'j_poke_castform', facing: 'front', poke: v.poke, atlas: C().atlas, pos: C().pos, edition: { poke_shiny: true } }, { area: 'jokers' });
    void sh;
  }
  ex(cf).form = 'normal';
  const v = {}; view_card(cf, v);
  ok(POKE_UI.face({ center: 'j_poke_castform', facing: 'front', poke: v.poke, atlas: C().atlas, pos: C().pos }, { area: 'jokers' }) === null, 'Normal: its own Natdex card');
});
if (ART && !C()) ok(false, 'art: Castform is not registered');
else if (ART) {
  const ATL = MODS.pokermon.content.atlases;
  const { KECLEON_ATLAS, CASTFORM_SPRITES } = await import('../../mods/pokermon/systems/anim.js');
  const want = {};
  const cell = (atlas, pos, id) => { const file = decodeURIComponent(ATL[atlas].src).replace(/^.*\/assets\/2x\//, ''); (want[file] || (want[file] = {}))[id] = [pos.x * 142, pos.y * 190, 142, 190]; };
  for (const [f, pos] of Object.entries(CASTFORM_SPRITES)) { cell(KECLEON_ATLAS, pos, f); cell(KECLEON_ATLAS.replace(/391$/, 'Shiny391'), pos, f + '_shiny'); }
  cell(C().atlas, C().pos, 'normal');
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
  const hash = (r) => { let h = 0; for (let i = 0; i < r.px.length; i += 97) h = (h * 31 + r.px[i]) >>> 0; return h; };
  const all = ['normal', 'sunny', 'rainy', 'snowy'].map((f) => px[f]);
  ok(all.every((r) => r && r.inside && opaque(r) > 0.5) && new Set(all.map(hash)).size === 4, 'art: the Normal card and the 3 weather cards are real, distinct 3.9.1 pictures', all.map((r) => r && opaque(r)));
  ok(['sunny', 'rainy', 'snowy'].every((f) => { const a = px[f], b = px[f + '_shiny']; let d = 0; for (let i = 0; i < a.px.length; i++) d += Math.abs(a.px[i] - b.px[i]); return b.inside && opaque(b) > 0.5 && d > 0; }),
    'art: each weather card has its Shiny twin on the Gen 3 Shiny sheet');
} else console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(['', '_sunny', '_rainy', '_snowy'].every((s) => J['j_poke_castform' + s] && J['j_poke_castform' + s].name === 'Castform'), 'the 4 texts (Normal / chart + one per weather form)');
  const txt = (s) => J['j_poke_castform' + s].text.join(' ');
  ok(/Forecast:/.test(txt('')) && /poke_sun/.test(txt('')) && /poke_rain/.test(txt('')) && /poke_snow/.test(txt('')) && /Monotype/.test(txt('')), 'the chart names the 3 weathers (poke_sun / rain / snow) and the Monotype rule');
  ok(/Sunny Form/.test(txt('_sunny')) && /Rainy Form/.test(txt('_rainy')) && /Snowy Form/.test(txt('_snowy')) && ['_sunny', '_rainy', '_snowy'].every((s) => /Monotype/.test(txt(s))), 'each form names itself and the Monotype rule');
  start('CFTXT');
  const j = add('j_poke_castform');
  let d = JSON.stringify(describe(j));
  ok(/\+4/.test(d) && /\+30/.test(d) && /X1\.1/.test(d) && /\+10/.test(d) && /Normal/.test(d), 'the Normal tooltip shows all four numbers (+4 / +30 / X1.1 / +10)', d.slice(0, 1600));
  ex(j).form = 'rainy';
  d = JSON.stringify(describe(j));
  ok(/Rainy Form/.test(d) && /\+30/.test(d) && !/Sunny/.test(d), 'the Rainy tooltip', d.slice(0, 1200));
});

done();
