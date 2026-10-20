// Pokermon 3.9.1 new jokers, sub-batch 13 (PORTING.md "New jokers, sub-batch 13"): the 19 jokers 3.9.1 added to
// pokejokers_12.lua (Cacnea / Cacturne, Swablu / Altaria, Zangoose, Seviper, Corphish / Crawdaunt, Baltoy / Claydol,
// Lileep / Cradily, Anorith / Armaldo, Kecleon, Shuppet / Banette, Tropius, Chimecho), every one fired through real plays
// (act), and each evolution.
//   - the overlay: data391.js new_jokers / families, the 3.9.1 static data, text, order and pools; contentRev 10
//   - each joker's main effect; Cacnea -> Cacturne, Swablu -> Altaria, Corphish -> Crawdaunt, Baltoy -> Claydol,
//     Lileep -> Cradily, Anorith -> Armaldo, Shuppet -> Banette
//   - the seams it needed: Zangoose's cards out of the poker hand (poker_hand_cards), Chimecho's free Vouchers (set_cost),
//     joker_type_destroyed for an extinct Gros Michel (Tropius), Kecleon's type and card
//   - the art: every new joker's 3.9.1 cell (and its Shiny twin) holds a real picture, and Kecleon's 11 type cards
//     (needs the gitignored art: MICATRO_MAIN)
//   node micatro/tests/mods/pokermon_391_new_13_test.mjs
import path from 'path';
import { T, start, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, P_CENTER_POOLS, localize, get_current_pool, Card } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { STATUS } from '../../mods/pokermon/index.js';
import D391 from '../../mods/pokermon/data391.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const NEW = ['cacnea', 'cacturne', 'swablu', 'altaria', 'zangoose', 'seviper', 'corphish', 'crawdaunt', 'baltoy', 'claydol', 'lileep',
  'cradily', 'anorith', 'armaldo', 'kecleon', 'shuppet', 'banette', 'tropius', 'chimecho'];
/** A card on top of the deck (the next one drawn). */
const onDeck = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (fn) => { try { fn(); } catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 300)); } };
/** Discard these hand cards (the hand refills from the top of the deck). */
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); };
const flush = () => G.E_MANAGER.flush();
const close = (a, b) => Math.abs(a - b) < 1e-9;

// ------------------------------------------------------------------- the overlay
ok(MODS.pokermon.contentRev >= 10 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 10+ (pin 3.9.1+r10+)', PINS.modPin('pokermon'));
const NJ = Object.fromEntries(Object.entries(D391.new_jokers || {}).filter(([, v]) => v.sub_batch === '13'));
ok(JSON.stringify(Object.keys(NJ)) === JSON.stringify(NEW), 'data391.js new_jokers (sub-batch 13): the 19 of 3.9.1 pokejokers_12, in file order', Object.keys(NJ));
ok(NEW.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'every new joker is registered and ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_12.lua'] && STATUS.PORTED_FILES['pokemon/pokejokers_12.lua'].length === 25, 'defs: 25 from pokejokers_12.lua', STATUS.PORTED_FILES['pokemon/pokejokers_12.lua'] && STATUS.PORTED_FILES['pokemon/pokejokers_12.lua'].length);
sec(() => {
  // Static data straight from 3.9.1 (never retyped): spot checks of rarity / cost / stage / type / config.
  const want = {
    cacnea: [2, 6, 'Basic', 'Grass'], cacturne: ['poke_safari', 8, 'One', 'Grass'], swablu: [1, 4, 'Basic', 'Colorless'],
    altaria: ['poke_safari', 6, 'One', 'Dragon'], zangoose: [3, 7, 'Basic', 'Colorless'], seviper: [3, 7, 'Basic', 'Dark'],
    corphish: [1, 6, 'Basic', 'Water'], baltoy: [1, 5, 'Basic', 'Earth'], anorith: [2, 5, 'Basic', 'Grass'],
    kecleon: [2, 6, 'Basic', 'Colorless'], banette: ['poke_safari', 7, 'One', 'Psychic'], tropius: [2, 4, 'Basic', 'Grass'],
    chimecho: ['poke_safari', 7, 'Basic', 'Psychic'],
  };
  for (const [n, [rarity, cost, stage, ptype]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === ptype, `${n}: 3.9.1 rarity / cost / stage / type`, [c.rarity, c.cost, c.stage, c.ptype]);
  }
  ok(C('chimecho').enhancement_gate === 'm_glass' && C('swablu').perishable_compat === false && C('swablu').knockoff_pseudol === true, 'chimecho: Glass gate; swablu: no Perishable, a knockoff pseudo-legendary');
  ok(C('swablu').config.evo_rqmt === 36 && C('baltoy').config.evo_rqmt === 40 && C('lileep').config.evo_rqmt === 5 && C('cacnea').config.extra.rounds === 5
    && C('armaldo').config.extra.Xmult_multi === 0.1, '3.9.1 configs', [C('swablu').config, C('lileep').config]);
  ok(C('lileep').attributes.includes('ancient') && C('cacnea').attributes.includes('hazards'), 'attributes: 3.9.1 ones', C('lileep').attributes);
});
sec(() => {
  // Their place in the joker list: 3.9.1's file order (its `list`: Kecleon after Milotic, Shuppet after Dusclops).
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const after = (a, b) => keys.indexOf('j_poke_' + b) === keys.indexOf('j_poke_' + a) + 1;
  ok(after('spinda', 'cacnea') && after('cacturne', 'swablu') && after('armaldo', 'feebas') && after('milotic', 'kecleon') && after('kecleon', 'duskull')
    && after('dusclops', 'shuppet') && after('banette', 'tropius') && after('chimecho', 'absol'), 'inserted in 3.9.1 file order');
});
sec(() => {
  // The 3.9.1 text (each #n# the text names filled by loc_vars)
  const JL = MODS.pokermon.content.loc.descriptions.Joker;
  start('LOC13');
  for (const n of NEW) {
    const e = JL['j_poke_' + n];
    const card = add('j_poke_' + n);
    const lv = C(n).loc_vars(C(n), [], card) || {};
    const used = [...new Set((e.text.join(' ').match(/#(\d+)#/g) || []).map((m) => +m.slice(1, -1)))];
    ok(e && used.every((i) => { const v = (lv.vars || [])[i - 1]; return v !== undefined && v !== null && !Number.isNaN(v); }), `${n}: text + loc_vars fill #${used.join('#, #')}#`, lv.vars);
  }
  const b = C('baltoy').loc_vars(C('baltoy'), [], add('j_poke_baltoy'));
  ok(b.main_start && b.main_start[0].includes('+1') && b.main_start[1].includes('+1-6') && b.main_start[1].includes('for each'), 'baltoy: its main_start lines (+1 Hazard layer, +1-6 Chips for each)', b.main_start);
  ok(localize('poke_crush_claw_ex') === 'Crush Claw!' && localize('poke_x_scissor_ex') === 'X Scissor!' && localize('k_poke_chips') === 'Chips', 'loc: Crush Claw!, X Scissor!, Chips');
});
sec(() => {
  // Families (3.9.1 functions/pokefamily.lua), minus jokers not ported yet (Chingling: sub-batch 14)
  const fam = (n) => JSON.stringify(poke_get_family_list(n));
  ok(fam('cacturne') === '["cacnea","cacturne"]' && fam('swablu') === '["swablu","altaria"]' && fam('crawdaunt') === '["corphish","crawdaunt"]'
    && fam('claydol') === '["baltoy","claydol"]' && fam('lileep') === '["lileep","cradily"]' && fam('armaldo') === '["anorith","armaldo"]'
    && fam('banette') === '["shuppet","banette"]', 'families: the 7 lines');
  ok(fam('chimecho') === '["chingling","chimecho"]', 'family: Chingling / Chimecho (Chingling: sub-batch 14)', poke_get_family_list('chimecho'));
});
sec(() => {
  // Pools: in_pool + pool_filter; the shop's rarity pools
  start('POOL13');
  const pool = P_CENTER_POOLS.Joker.map((c) => c.key);
  ok(pool.indexOf('j_poke_cacnea') === pool.indexOf('j_poke_spinda') + 1 && pool.includes('j_poke_chimecho'), 'the Joker pool holds them, in 3.9.1 order');
  ok(C('kecleon').in_pool(C('kecleon')) && pool_filter(C('kecleon'), 'Joker') === undefined, 'Kecleon can be rolled');
  const avail = (r) => get_current_pool('Joker', r)[0].filter((k) => k !== 'UNAVAILABLE');
  const ofNew = (r) => avail(r).filter((k) => NEW.includes(k.replace('j_poke_', '')));
  ok(JSON.stringify(ofNew(0.1)) === JSON.stringify(['j_poke_swablu', 'j_poke_corphish', 'j_poke_baltoy'])
    && JSON.stringify(ofNew(0.8)) === JSON.stringify(['j_poke_cacnea', 'j_poke_lileep', 'j_poke_anorith', 'j_poke_kecleon', 'j_poke_shuppet', 'j_poke_tropius'])
    && JSON.stringify(ofNew(0.99)) === JSON.stringify(['j_poke_zangoose', 'j_poke_seviper']), 'shop rarity pools: Common / Uncommon / Rare (Safari never)', [ofNew(0.1), ofNew(0.8), ofNew(0.99)]);
  ok(C('chimecho').in_pool(C('chimecho')) === false, 'Chimecho waits for a Glass card in the deck (enhancement_gate)');
  add('j_poke_lileep');
  ok(pool_filter(C('lileep'), 'Joker') === false && pool_filter(C('cradily'), 'Joker') === false, 'one per family: Lileep held -> its line is out');
  start('POOL13B', { gen_three: false });
  ok(pool_filter(C('kecleon'), 'Joker') === false, 'Gen 3 off -> out');
});

// ------------------------------------------------------------------- Cacnea / Cacturne
sec(() => {
  start('CACNEA');
  const h0 = G.GAME.poke_hazard_level || 0;
  const j = add('j_poke_cacnea');
  ok((G.GAME.poke_hazard_level || 0) === h0 + 1, 'cacnea: +1 Hazard layer', G.GAME.poke_hazard_level);
  const cards = hand(['S_2', 'S_3']);
  const hang = add('c_hanged_man');
  const d0 = G.GAME.dollars;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const u = act({ type: 'use', id: hang.sort_id });
  flush();
  ok(u.ok && G.GAME.dollars - d0 === 6 && statusMsgs(u.events).includes('$3'), 'cacnea: $3 per destroyed card (The Hanged Man: 2)', [u.error, G.GAME.dollars - d0]);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_cacturne' && (G.GAME.poke_hazard_level || 0) === h0 + 1, 'cacnea -> cacturne (the Hazard layer kept once)', [key(j), G.GAME.poke_hazard_level]);
});
sec(() => {
  start('CACTURNE');
  add('j_poke_cacturne');
  const [a, hz] = hand(['S_A', 'H_K']);
  hz.set_ability(P_CENTERS.m_poke_hazard, null, true);
  const d0 = G.GAME.dollars;
  play([a, hz]);
  flush();
  ok(!G.playing_cards.includes(hz) && G.playing_cards.includes(a), 'cacturne: a Hazard card of the first hand is destroyed after scoring');
  ok(G.GAME.dollars - d0 === 5, 'cacturne: $5 for it', G.GAME.dollars - d0);
  clearHand();
  const [hz2] = hand(['H_Q']);
  hz2.set_ability(P_CENTERS.m_poke_hazard, null, true);
  play([hz2]);
  flush();
  ok(G.playing_cards.includes(hz2), 'cacturne: not on a later hand');
});

// ------------------------------------------------------------------- Swablu / Altaria
sec(() => {
  start('SWABLU');
  const j = add('j_poke_swablu');
  clearHand();
  onDeck('S_9'); onDeck('H_9');
  discard(hand(['S_2', 'S_3']));
  ok(j.ability.extra.chips === 4, 'swablu: +2 Chips per 9 drawn during the Blind', j.ability.extra.chips);
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 4, 'swablu: scores its Chips', r.total);
  j.ability.extra.chips = 36;
  winRound();
  ok(key(j) === 'j_poke_altaria', 'swablu -> altaria at +36', key(j));
});
sec(() => {
  start('ALTARIA');
  const j = add('j_poke_altaria');
  add('j_poke_dratini');
  clearHand();
  onDeck('S_9'); onDeck('H_9');
  const d0 = G.GAME.dollars;
  discard(hand(['S_2', 'S_3']));
  flush();
  ok(j.ability.extra.chips === 6, 'altaria: +3 Chips per 9 drawn', j.ability.extra.chips);
  ok(G.GAME.dollars - d0 === 2, 'altaria: $1 per 9, sure with another Dragon joker', G.GAME.dollars - d0);
});

// ------------------------------------------------------------------- Zangoose
sec(() => {
  start('ZANGOOSE');
  add('j_poke_zangoose');
  const [a, ...held] = hand(['S_A', 'H_2', 'H_3', 'D_4']);
  const r = play([a]);
  const sh = r.events.find((e) => e.type === 'scoring_hand');
  const joined = held.filter((c) => !G.hand.cards.includes(c));
  ok(joined.length === 2 && sh && sh.cards.length === 3 && sh.hand === 'High Card', 'zangoose: 2 random held cards join the played hand and score; the poker hand stays High Card', sh);
  ok(r.total.chips === 5 + 11 + joined.reduce((s, c) => s + c.base.nominal, 0) && statusMsgs(r.events).includes('Crush Claw!'), 'zangoose: they score ("Crush Claw!")', r.total);
  ok(held.every((c) => !c.poke_zangoose_card), 'zangoose: the marks are cleared');
  // A pair + the added cards: still a Pair (they never change the poker hand)
  clearHand();
  const [k1, k2] = hand(['S_K', 'H_K', 'S_5', 'H_5', 'D_5']);
  const r2 = play([k1, k2]);
  const sh2 = r2.events.find((e) => e.type === 'scoring_hand');
  ok(sh2.hand === 'Pair' && sh2.cards.length === 4, 'zangoose: a Pair with two 5s added is still a Pair', sh2);
});

// ------------------------------------------------------------------- Seviper
sec(() => {
  start('SEVIPER');
  add('j_poke_seviper');
  const h0 = G.hand.config.card_limit;
  play(hand(['S_A', 'S_K', 'S_Q']));
  ok(G.hand.config.card_limit === h0 + 1, 'seviper: a played hand of exactly 3 cards: +1 hand size', [h0, G.hand.config.card_limit]);
  clearHand();
  discard(hand(['S_2', 'S_3', 'S_4']));
  ok(G.hand.config.card_limit === h0 + 2, 'seviper: a discard of exactly 3 too', G.hand.config.card_limit);
  clearHand();
  play(hand(['S_A', 'S_K']));
  ok(G.hand.config.card_limit === h0 + 2, 'seviper: not 2 cards');
  winRound();
  ok(G.hand.config.card_limit === h0, 'seviper: this round only', G.hand.config.card_limit);
});

// ------------------------------------------------------------------- Corphish / Crawdaunt
sec(() => {
  start('CORPHISH');
  const j = add('j_poke_corphish');
  ok(j.ability.extra.targets.length === 3 && new Set(j.ability.extra.targets.map((t) => t.id)).size === 3, 'corphish: a Nature of 3 ranks on creation', j.ability.extra.targets);
  j.ability.extra.targets = [{ value: 'Ace', id: 14 }, { value: 'Queen', id: 12 }];
  const r = play(hand(['S_K', 'H_K', 'S_A', 'S_Q']));
  ok(j.ability.extra.mult === 1 && r.total.mult === 2 + 1, 'corphish: +1 Mult once when the hand holds unscored Nature cards', [j.ability.extra.mult, r.total]);
  clearHand();
  play(hand(['S_A', 'H_A']));
  ok(j.ability.extra.mult === 1, 'corphish: not when the Nature cards score');
  j.ability.extra.mult = 10;
  winRound();
  ok(key(j) === 'j_poke_crawdaunt', 'corphish -> crawdaunt at +10', key(j));
});
sec(() => {
  start('CRAWDAUNT');
  const j = add('j_poke_crawdaunt');
  j.ability.extra.targets = [{ value: 'Ace', id: 14 }, { value: 'Queen', id: 12 }];
  const r = play(hand(['S_K', 'H_K', 'S_A', 'S_Q']));
  ok(j.ability.extra.mult === 2 && r.total.mult === 2 + 2, 'crawdaunt: +1 Mult per unscored Nature card (2)', [j.ability.extra.mult, r.total]);
});

// ------------------------------------------------------------------- Baltoy / Claydol
sec(() => {
  start('BALTOY');
  const h0 = G.GAME.poke_hazard_level || 0;
  const j = add('j_poke_baltoy');
  ok((G.GAME.poke_hazard_level || 0) === h0 + 1, 'baltoy: +1 Hazard layer');
  clearHand();
  discard(hand(['S_2', 'S_3'], { center: 'm_poke_hazard' }).concat(hand(['S_4'])));
  const c = j.ability.extra.chips;
  ok(c >= 2 && c <= 12, 'baltoy: +1-6 Chips per discarded Hazard card (2)', c);
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + c, 'baltoy: scores its Chips', r.total);
  j.ability.extra.chips = 40;
  winRound();
  ok(key(j) === 'j_poke_claydol', 'baltoy -> claydol at +40', key(j));
});
sec(() => {
  start('CLAYDOL');
  const j = add('j_poke_claydol');
  j.ability.extra.num = 3; // (1 in 3 made sure)
  clearHand();
  const [hz] = hand(['S_2'], { center: 'm_poke_hazard' });
  const [plain] = hand(['S_3']);
  discard([hz, plain]);
  flush();
  ok(G.hand.cards.includes(hz) && !G.hand.cards.includes(plain) && G.discard.cards.includes(plain), 'claydol: a discarded Hazard card comes back to hand', [G.hand.cards.includes(hz), G.discard.cards.includes(plain)]);
  ok(j.ability.extra.chips >= 1 && j.ability.extra.chips <= 8 && !hz.claydoll_discard, 'claydol: +1-8 Chips for it; the mark is cleared', j.ability.extra.chips);
  j.ability.extra.num = 0;
  clearHand();
  const [hz2] = hand(['S_5'], { center: 'm_poke_hazard' });
  discard([hz2]);
  flush();
  ok(!G.hand.cards.includes(hz2), 'claydol: not when the roll fails');
});

// ------------------------------------------------------------------- Lileep / Cradily
sec(() => {
  start('LILEEP');
  const j = add('j_poke_lileep');
  const pl = add('c_pluto');
  const h0 = G.hand.config.card_limit;
  const s0 = j.sell_cost, p0 = pl.sell_cost;
  const eights = hand(['S_8', 'H_8', 'D_8']);
  hand(['S_2', 'S_3']);
  const r = play(eights);
  // Three of a Kind (30 + 8 x 3) + 2 held cards x 10
  ok(r.total.chips === 30 + 24 + 20, 'lileep: 3+ Ancient 8s: each held card gives +10 Chips', r.total);
  ok(G.hand.config.card_limit === h0 + 1, 'lileep: 1+: +1 hand size this round', G.hand.config.card_limit);
  ok(j.sell_cost === s0 + 1 && pl.sell_cost === p0 + 1, 'lileep: 2+: +$1 sell value to itself and every consumable', [s0, j.sell_cost, p0, pl.sell_cost]);
  ok(j.ability.extra.third_times === 1 && j.ability.extra.ancient_count === 0, 'lileep: its 3+ count', j.ability.extra);
  clearHand();
  hand(['S_2']);
  const r2 = play(hand(['S_8', 'H_8']));
  ok(r2.total.chips === 10 + 16 && j.ability.extra.third_times === 1, 'lileep: 2 Ancient 8s: no held Chips, no 3+ count', r2.total);
  j.ability.extra.third_times = 5;
  winRound();
  ok(key(j) === 'j_poke_cradily', 'lileep -> cradily after 5', key(j));
});
sec(() => {
  start('CRADILY');
  add('j_poke_cradily');
  const pl = add('c_pluto');
  const d0 = G.GAME.dollars;
  play(hand(['S_8', 'H_8', 'D_8', 'C_8']));
  flush();
  ok(G.GAME.dollars - d0 === pl.sell_cost && pl.sell_cost >= 3, 'cradily: 4+: earn the highest consumable sell value (after its +$2)', [G.GAME.dollars - d0, pl.sell_cost]);
});

// ------------------------------------------------------------------- Anorith / Armaldo
sec(() => {
  start('ANORITH');
  const j = add('j_poke_anorith');
  j.ability.extra.num = 4; // (1 in 4 made sure)
  const sevens = hand(['S_7', 'H_7', 'D_7']);
  const n0 = G.playing_cards.length;
  const high = () => G.playing_cards.filter((c) => c.get_id() > 7).length;
  const base7 = () => G.playing_cards.filter((c) => c.get_id() === 7 && c.config.center === P_CENTERS.c_base && !sevens.includes(c)).length;
  const high0 = high(), b0 = base7();
  const r = play(sevens);
  flush();
  ok(r.total.mult === 3 + 7, 'anorith: 1+: +7 Mult', r.total);
  ok(high() === high0 - 1, 'anorith: 3+: a card above 7 is destroyed from the deck', [high0, high()]);
  ok(base7() === b0 + 1, 'anorith: 2+: a 7 is added to the deck', [b0, base7()]);
  ok(j.ability.extra.third_times === 1 && G.playing_cards.length === n0, 'anorith: its 3+ count (one in, one out)', [j.ability.extra.third_times, n0, G.playing_cards.length]);
  j.ability.extra.third_times = 5;
  winRound();
  ok(key(j) === 'j_poke_armaldo', 'anorith -> armaldo after 5', key(j));
});
sec(() => {
  start('ARMALDO');
  const j = add('j_poke_armaldo');
  j.ability.extra.num = 4;
  const deck7 = G.deck.cards.find((c) => c.get_id() === 7);
  deck7.set_ability(P_CENTERS.m_bonus, null, true);
  const r = play(hand(['S_7', 'H_7', 'D_7', 'C_7']));
  flush();
  const added = G.deck.cards.filter((c) => c.get_id() === 7 && c !== deck7 && c.config.center !== P_CENTERS.c_base);
  const enh = G.playing_cards.filter((c) => c.get_id() === 7 && c.config.center !== P_CENTERS.c_base).length;
  ok(added.length === 1 && P_CENTERS[key(added[0])].set === 'Enhanced', 'armaldo: 2+: an Enhanced 7 is added to the deck', added.map(key));
  // Four of a Kind (mult 7) + 11, then X(1 + 0.1 per Enhanced 7: the Bonus one and the new one)
  ok(enh === 2 && close(r.total.mult, (7 + 11) * 1.2) && statusMsgs(r.events).includes('X Scissor!'), 'armaldo: 4+: X0.1 Mult per Enhanced 7 in the full deck ("X Scissor!")', [enh, r.total]);
  void j;
});

// ------------------------------------------------------------------- Kecleon
sec(() => {
  start('KECLEON');
  const k = add('j_poke_kecleon');
  const fire = add('j_poke_charmander');
  ok(k.ability.extra.ptype === 'Fire' && k.ability.fire_sticker === true, 'kecleon: takes the type of the joker to its right (Fire)', k.ability.extra);
  const v = {};
  view_card(k, v);
  const face = POKE_UI.face({ center: 'j_poke_kecleon', facing: 'front', poke: v.poke, atlas: k.config.center.atlas, pos: k.config.center.pos }, { area: 'jokers' });
  ok(face && face.atlas === 'poke_AtlasJokersBasicGen03391' && face.pos.x === 4 && face.pos.y === 1, 'kecleon: drawn as its Fire card (3.9.1 Gen 3 sheet {4,1})', face);
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'kecleon: no X2 with 2 Fire jokers', r.total);
  add('j_poke_vulpix');
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 2, 'kecleon: X2 with 3+ jokers of its type (itself included)', r2.total);
  act({ type: 'sell', id: fire.sort_id });
  flush();
  ok(k.ability.extra.ptype === 'Fire', 'kecleon: the next joker to its right is Fire too (Vulpix)', k.ability.extra.ptype);
  const blue = add('j_poke_squirtle');
  act({ type: 'reorder', area: 'jokers', ids: [k.sort_id, blue.sort_id, ...G.jokers.cards.filter((c) => c !== k && c !== blue).map((c) => c.sort_id)] });
  ok(G.jokers.cards[1] === blue && k.ability.extra.ptype === 'Water', 'kecleon: reordered next to a Water joker -> Water', [G.jokers.cards.map(key), k.ability.extra.ptype]);
  for (const c of G.jokers.cards.slice()) if (c !== k) { act({ type: 'sell', id: c.sort_id }); flush(); }
  ok(k.ability.extra.ptype === 'Colorless', 'kecleon: alone -> Colorless', k.ability.extra.ptype);
  const v2 = {};
  view_card(k, v2);
  ok(POKE_UI.face({ center: 'j_poke_kecleon', facing: 'front', poke: v2.poke }, { area: 'jokers' }) === null, 'kecleon: Colorless = its own card');
});

// ------------------------------------------------------------------- Shuppet / Banette
sec(() => {
  start('SHUPPET');
  const j = add('j_poke_shuppet');
  const x = add('j_joker');
  act({ type: 'sell', id: x.sort_id });
  ok(j.ability.extra.mult === 3, 'shuppet: +3 Mult when a Joker is sold during the Blind', j.ability.extra.mult);
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 3, 'shuppet: scores its Mult', r.total);
  j.ability.extra.mult = 18;
  winRound();
  ok(key(j) === 'j_poke_banette', 'shuppet -> banette at +18', key(j));
});
sec(() => {
  start('BANETTE');
  const slots = G.jokers.config.card_limit, hands = G.GAME.round_resets.hands, left = G.GAME.current_round.hands_left;
  const j = add('j_poke_banette');
  ok(G.jokers.config.card_limit === slots + 1 && G.GAME.round_resets.hands === hands - 1 && G.GAME.current_round.hands_left === left - 1, 'banette: +1 Joker slot, -1 hand', [G.jokers.config.card_limit, G.GAME.round_resets.hands, G.GAME.current_round.hands_left]);
  const x = add('j_joker');
  act({ type: 'sell', id: x.sort_id });
  ok(j.ability.extra.mult === 3, 'banette: +3 Mult when a Joker is sold during the Blind', j.ability.extra.mult);
  act({ type: 'sell', id: j.sort_id });
  flush();
  ok(G.jokers.config.card_limit === slots && G.GAME.round_resets.hands === hands, 'banette sold: the slot and the hand come back');
});

// ------------------------------------------------------------------- Tropius
sec(() => {
  start('TROPIUS');
  const j = add('j_poke_tropius');
  winRound();
  flush();
  ok(G.jokers.cards.some((c) => key(c) === 'j_gros_michel') && j.ability.extra.active === false, 'tropius: a Gros Michel at end of round (Cavendish chance 0)', G.jokers.cards.map(key));
  // an extinct Gros Michel is a destroyed Joker (SMODS.destroy_cards): +X0.5 and +20% Cavendish chance
  start('TROPIUS2');
  const t = add('j_poke_tropius');
  t.ability.extra.active = false;
  const gm = add('j_gros_michel');
  G.GAME.probabilities.normal = 1000;
  winRound();
  flush();
  ok(!G.jokers.cards.includes(gm) && close(t.ability.extra.Xmult, 1.5) && close(t.ability.extra.cavendish_chance, 0.2), 'tropius: an extinct Gros Michel -> +X0.5, Cavendish chance +0.2', t.ability.extra);
  // a sliced joker (Ceremonial Dagger)
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  G.GAME.probabilities.normal = 1;
  const dag = add('j_ceremonial');
  add('j_joker');
  act({ type: 'select_blind' });
  flush();
  ok(close(t.ability.extra.Xmult, 2), 'tropius: a joker sliced by Ceremonial Dagger -> +X0.5', t.ability.extra.Xmult);
  clearHand();
  const r = play(hand(['S_A']));
  ok(close(r.total.mult, 1 * 2 + dag.ability.mult) && G.jokers.cards.length === 2, 'tropius: X2', [r.total, G.jokers.cards.map(key)]);
  t.calculate_joker({ ante_change: 1, ante_end: true });
  ok(t.ability.extra.active === true, 'tropius: ready again when the ante ends');
});

// ------------------------------------------------------------------- Chimecho
sec(() => {
  start('CHIMECHO');
  const vprice = () => { const c = new Card(P_CARDS.empty, P_CENTERS.v_overstock_norm); c.set_cost(); return c.cost; };
  const v0 = vprice();
  const j = add('j_poke_chimecho');
  ok(v0 > 0 && vprice() === 0, 'chimecho: Vouchers are free', [v0, vprice()]);
  G.GAME.probabilities.normal = 1000;
  const glass = hand(['S_A', 'H_A', 'D_A'], { center: 'm_glass' });
  play(glass);
  flush();
  const copies = G.hand.cards.filter((c) => c.get_id() === 14 && key(c) === 'm_glass');
  ok(glass.every((c) => !G.playing_cards.includes(c)) && copies.length === 2 && j.ability.extra.glass_restored === 2, 'chimecho: the first 2 Glass cards destroyed come back to hand as copies', [copies.length, j.ability.extra.glass_restored]);
  G.GAME.probabilities.normal = 1;
  const w = winRound();
  ok(j.ability.extra.glass_restored === 0 && statusMsgs(w.events).includes(localize('k_reset')), 'chimecho: resets at end of round');
  act({ type: 'sell', id: j.sort_id });
  flush();
  ok(vprice() === v0, 'chimecho sold: Vouchers full price again');
});

// ------------------------------------------------------------------- the art
if (!ART) console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
else if (!NEW.every(C)) ok(false, 'art: the new jokers are not registered');
else {
  const ATL = MODS.pokermon.content.atlases;
  const want = {};
  const cell = (atlas, pos, id) => {
    const A = ATL[atlas];
    const file = decodeURIComponent(A.src).replace(/^.*\/assets\/2x\//, '');
    (want[file] || (want[file] = {}))[id] = [pos.x * 142, pos.y * 190, 142, 190];
  };
  for (const n of NEW) {
    const c = C(n);
    cell(c.atlas, c.pos, n + '|' + c.atlas);
    cell(c.atlas.replace(/391$/, 'Shiny391'), c.pos, n + '|' + c.atlas.replace(/391$/, 'Shiny391'));
  }
  const { KECLEON_ATLAS, KECLEON_SPRITES } = await import('../../mods/pokermon/systems/anim.js');
  for (const [t, pos] of Object.entries(KECLEON_SPRITES)) cell(KECLEON_ATLAS, pos, 'kecleon_' + t);
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
  for (const n of NEW) {
    const c = C(n);
    const base = px[n + '|' + c.atlas], shiny = px[n + '|' + c.atlas.replace(/391$/, 'Shiny391')];
    let diff = 0; for (let i = 0; i < base.px.length; i++) diff += Math.abs(base.px[i] - shiny.px[i]);
    ok(base.inside && opaque(base) > 0.5 && shiny.inside && opaque(shiny) > 0.5 && diff > 0, `${n}: a real 3.9.1 sprite and Shiny (${c.atlas} ${c.pos.x},${c.pos.y})`, [opaque(base), opaque(shiny), diff]);
  }
  const kc = Object.keys(KECLEON_SPRITES).map((t) => px['kecleon_' + t]);
  const distinct = new Set(kc.map((r) => { let h = 0; for (let i = 0; i < r.px.length; i += 97) h = (h * 31 + r.px[i]) >>> 0; return h; })).size;
  ok(kc.every((r) => r.inside && opaque(r) > 0.5) && distinct === kc.length, 'kecleon: its 11 type cards on the 3.9.1 Gen 3 sheet are real, distinct pictures', [kc.map(opaque), distinct]);
}

done();
