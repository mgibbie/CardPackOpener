// AutumnMoodMechanics (micatro/mods/autumnmood): off -> nothing; AMM alone -> only its own content (the Oddity
// type, 8 packs, 2 tags; packs/tags/shop rate stay out of play while no mod adds Oddities); and every system
// fired through real act() plays: suit levels, graveyard (+ API, move/remove, buried context), bottles, combining,
// destroy_random_jokers, mod_blind, card qualities, unscored perma bonuses, held perma bonuses, perma
// repetitions, petting, and — through a tiny inline client mod (as a mod using AMM's API would) — Stamps,
// Aspects, Oddity rarities, Oddity packs (Select, not Use), the Oddity / Heirloom tags and the feature-gated
// Run Info "Suits" tab / deck "Graveyard" tab. Each intended-design fix has a test that fails without it.
//   node micatro/tests/mods/autumnmood_test.mjs
import {
  start, clearHand, hand, add, clearJokers, clearConsumables, play, discard, use, winRound, nextRound, toShop, destroy, msgs, tot, filled,
  ok, near, flush, done, G, P_CENTERS, P_CARDS, act, STATES, describe, describeCenter, AMM,
} from './autumncircus_helpers.mjs';
import { P_CENTER_POOLS, P_SEALS, P_TAGS, add_joker, create_card, create_playing_card, get_current_pool, Card } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { toView } from '../../js/engine/view.js';
import { registerMod, CONSUMABLE_TYPES, ATLASES, MODS } from '../../js/mods/registry.js';
import { STATUS } from '../../mods/autumnmood/index.js';
import { describeTag } from '../../js/engine/describe.js';

// --------------------------------------------------- a client mod built on AMM's API
const LOG = [];
registerMod({
  id: 'amm_client', name: 'AMM client', prefix: 'ac', requires: ['autumnmood'],
  optional_features: { unscored: true, amm_suit_levels: true, amm_graveyard: true },
  content: {
    seals: [{
      key: 'ac_wide', set: 'Stamp', name: 'Wide', display_name: "Wide Stamp", text: ['+1 hand size'], atlas: 'ac_atlas', pos: { x: 0, y: 0 }, colour: '#123456',
      apply(card) { if (card.added_to_deck) G.hand.change_size(1); }, unapply(card) { if (card.added_to_deck) G.hand.change_size(-1); },
      deck_add() { G.hand.change_size(1); }, deck_remove() { G.hand.change_size(-1); },
      calculate(self, card, ctx) {
        if (ctx.joker_main) return { mult: 7 };
        if (ctx.end_of_round && ctx.cardarea === G.jokers) return { message: 'EOR', func() { LOG.push('stamp_eor'); } };
      },
    }],
    centers: [
      { key: 'c_ac_common', set: 'Oddity', name: 'c_ac_common', consumeable: true, rarity: 1, cost: 1, pos: { x: 0, y: 0 }, config: {}, can_use: () => true, use() { LOG.push('common'); } },
      { key: 'c_ac_legend', set: 'Oddity', name: 'c_ac_legend', consumeable: true, rarity: 4, cost: 9, pos: { x: 0, y: 0 }, config: {}, can_use: () => true, use() { LOG.push('legend'); } },
      { key: 'j_ac_watcher', set: 'Joker', name: 'j_ac_watcher', rarity: 1, cost: 1, pos: { x: 0, y: 0 }, config: {},
        calculate(self, card, ctx) {
          if (ctx.amm_buried_card) LOG.push('buried:' + ctx.other_card.base.value);
          if (ctx.amm_pet_card) LOG.push('pet:' + ctx.amm_pet_direction + ':' + (ctx.amm_pet_card === card));
          if (ctx.individual && ctx.cardarea === 'unscored') return { chips: 3 };
        } },
    ],
    atlases: { ac_atlas: { src: '/x.png', px: 71, py: 95 } },
  },
});
AMM.registerAspects('amm_client', [
  { key: 'ac_double', name: 'Double', atlas: 'ac_atlas', pos: { x: 1, y: 0 }, badge_colour: '#ff0000',
    calculate(self, card, ctx) {
      if (ctx.cardarea === G.play && ctx.main_scoring) return { Xmult: 2 };
      if (ctx.repetition_only) return { repetitions: 1, message: 'Again!', card };
      if (ctx.discard && ctx.other_card === card) return { message: 'Disc', func() { LOG.push('aspect_discard'); } };
      if (ctx.before && ctx.cardarea === G.hand) return { func() { LOG.push('aspect_before_held'); } };
    } },
]);
const CLIENT = ['amm_client'];

// ===================================================================== off
{
  start('AMMOFF', { mods: [] });
  ok(!Object.values(P_CENTER_POOLS).some((p) => p.some((c) => c.mod === 'autumnmood')), 'off: no AMM center in any pool');
  ok(!P_CENTER_POOLS.Oddity && G.GAME.oddity_rate === undefined && !G.GAME.amm_data && !G.graveyard, 'off: no Oddity pool / rate / suit levels / graveyard');
  ok(!P_CENTER_POOLS.Tag.some((t) => t.mod === 'autumnmood'), 'off: no AMM tags');
  const c = hand(['S_A'])[0];
  destroy(c);
  ok(!G.graveyard, 'off: a destroyed card goes nowhere');
  const v = toView();
  ok(!v.mod_runinfo_tabs && !v.mod_deck_tabs, 'off: no Suits / Graveyard tabs');
}

// ============================================================ AMM alone
{
  start('AMMALONE', { mods: ['autumnmood'] });
  ok(G.GAME.mods.join() === 'autumnmood', 'AMM alone: only AMM active');
  ok(STATUS.boosters.length === 8 && STATUS.tags.length === 2 && CONSUMABLE_TYPES.Oddity && CONSUMABLE_TYPES.Oddity.shop_rate === 3, '8 Oddity packs, 2 tags, the Oddity type (shop rate 3)');
  ok(G.GAME.oddity_rate === 0 && (P_CENTER_POOLS.Oddity || []).length === 0, 'no Oddities registered -> Oddity shop rate 0 (amm.lua)');
  ok(P_CENTERS.p_amm_oddity_normal_1.config.extra === 3 && P_CENTERS.p_amm_oddity_mega_1.config.choose === 2 && P_CENTERS.p_amm_oddity_mega_2.weight === 0.25 && P_CENTERS.p_amm_oddity_jumbo_1.cost === 6, 'pack numbers (normal 3/1 $4, jumbo 5/1 $6, mega 5/2 $8 w0.25)');
  ok(!P_CENTERS.p_amm_oddity_normal_1.in_pool() && !P_TAGS.tag_amm_oddity.in_pool() && !P_TAGS.tag_amm_heirloom.in_pool(), 'packs and tags stay out of play with no Oddities');
  ok(Object.keys(G.GAME.amm_data.suit_levels).join() === 'Diamonds,Clubs,Hearts,Spades' && G.GAME.amm_data.suit_levels.Spades.level === 1, 'suit levels start at 1 for every suit');
  ok(ATLASES.amm_Oddity.src.endsWith('/autumnmood/assets/2x/Oddity.png') && ATLASES.amm_bottle && ATLASES.amm_modicon.px === 34, 'atlases');
  const v = toView();
  ok(!v.mod_runinfo_tabs && !v.mod_deck_tabs, 'AMM alone: the Suits / Graveyard tabs need a mod to turn them on (optional features)');
  // the graveyard still collects (the Card:remove patch isn't feature-gated)
  const c = hand(['H_7'])[0];
  destroy(c);
  ok(G.graveyard.length === 1 && G.graveyard[0].base.value === '7' && G.graveyard[0].graveyard === true && G.graveyard_area.cards.length === 1, 'AMM alone: a destroyed card is copied into the graveyard');
  for (const k of [...STATUS.boosters]) ok(filled(describeCenter(k)), 'describe ' + k);
  for (const k of STATUS.tags) { const d = describeTag(k); ok(d && d.lines.length && !d.lines.some((l) => /#\d+#/.test(l)), 'describe tag ' + k, d); }
}

// ========================================================== suit levels
{
  start('AMMSUIT', { mods: CLIENT });
  AMM.level_up_suit(null, 'Spades');
  const sl = G.GAME.amm_data.suit_levels.Spades;
  ok(sl.level === 2 && sl.chips === 5 && sl.mult === 1, 'level_up_suit: lvl 2 = +5 chips / +1 mult');
  // High Card 5 x 1; Ace of Spades 11 + 5 chips, +1 mult -> 21 x 2 = 42
  let r = play(hand(['S_A']));
  ok(tot(r).join() === '21,2,42', 'a Spade scores its suit level (+5 chips, +1 mult)', tot(r));
  r = play(hand(['H_A']));
  ok(tot(r).join() === '16,1,16', 'another suit does not', tot(r));
  const stone = hand(['S_K'], 'm_stone')[0];
  r = play([stone]);
  ok(tot(r).join() === '55,1,55', 'a Stone Card (no suit) does not', tot(r));
  AMM.level_up_suit(null, 'Spades', true, 2);
  ok(sl.level === 4 && sl.chips === 15 && sl.mult === 3, 'level_up_suit amount 2 -> lvl 4 = +15 / +3');
  AMM.level_up_suit(null, 'Spades', true, -10);
  ok(sl.level === 0 && sl.chips === 0 && sl.mult === 0, 'never below level 0 / +0');
  AMM.level_up_suit(null, 'Hearts', true, 1);
  const c = hand(['H_5'])[0];
  const v = toView();
  const cv = v.areas.hand.find((x) => x.id === c.sort_id);
  ok(cv.mod_lines && cv.mod_lines.some((l) => l.includes('lvl.2') && l.includes('+5') && l.includes('+1')), 'card tooltip: (Hearts lvl.2) +5 X +1', cv.mod_lines);
  const tab = v.mod_runinfo_tabs && v.mod_runinfo_tabs.find((t) => t.key === 'amm_suits');
  ok(tab && tab.rows.some((x) => x.suit === 'Hearts' && x.level === 2 && x.chips === 5 && x.mult === 1) && tab.rows[0].suit === 'Spades', 'Run Info Suits tab (feature on): rows from Spades down', tab && tab.rows);
}

// ============================================================ graveyard
{
  start('AMMGY', { mods: CLIENT });
  LOG.length = 0;
  add('j_ac_watcher');
  const [a, b, w] = hand(['S_9', 'H_K', 'D_4']);
  AMM.set_aspect(a, 'ac_double', true);
  a.ability.perma_bonus = 7;
  destroy(a);
  ok(G.graveyard.length === 1 && G.graveyard[0].aspect === 'ac_double' && G.graveyard[0].ability.perma_bonus === 7, 'graveyard copy keeps aspect and permanent bonuses');
  ok(LOG.includes('buried:9'), 'amm_buried_card context reaches mod jokers', LOG);
  ok(!G.playing_cards.includes(a) && !G.deck.cards.includes(a) && !G.hand.cards.includes(a), 'the destroyed card left the deck');
  // shatter (Glass)
  b.shatter(); flush();
  ok(G.graveyard.length === 2 && G.graveyard[1].base.value === 'King', 'a shattered card is buried too');
  // remove_from_game: gone for good
  AMM.remove_from_game(w); flush();
  ok(G.graveyard.length === 2 && !G.playing_cards.includes(w), 'remove_from_game: no graveyard copy');
  // API
  w.set_ability(P_CENTERS.m_wild);
  const [x1] = hand(['C_9']);
  x1.set_ability(P_CENTERS.m_wild);
  AMM.move_to_graveyard(x1);
  ok(G.graveyard.length === 3 && x1.graveyard && !G.playing_cards.includes(x1) && x1.playing_card === 3, 'move_to_graveyard: out of the deck, numbered in the graveyard');
  const GY = AMM.GRAVEYARD;
  ok(GY.count_cards() === 3 && GY.count_rank('9') === 2 && GY.count_faces() === 1 && GY.count_suit('Spades') === 2 && GY.count_different_ranks() === 2, 'count_cards / count_rank / count_faces / count_suit (a Wild is every suit) / count_different_ranks');
  ok(GY.count_different_suits() === 3 && GY.count_center('m_wild') === 1 && GY.count_center(P_CENTERS.m_wild) === 1 && GY.count_suitless() === 0 && GY.filter_count((v) => v.base.value === 'King') === 1, 'count_different_suits (wild fills one) / count_center / filter_count');
  AMM.move_from_graveyard(x1);
  ok(!x1.graveyard && x1.area === G.hand && G.playing_cards.includes(x1) && GY.count_cards() === 2, 'move_from_graveyard: back into the hand (default)');
  // a card in the graveyard that is destroyed leaves it
  AMM.remove_from_game(G.graveyard[0]); flush();
  ok(GY.count_cards() === 1, 'remove_from_game on a graveyard card removes it from the graveyard');
  const v = toView();
  const tab = v.mod_deck_tabs && v.mod_deck_tabs.find((t) => t.key === 'amm_graveyard');
  ok(tab && tab.list.length === 1 && tab.cards.length === 1 && v.deck_extra === ' (1)', 'deck view Graveyard tab + "(1)" on the deck (feature on)');
}

// =============================================================== bottles
{
  start('AMMBOT', { mods: CLIENT });
  const target = G.deck.cards[3];
  target.bottle = true;
  G.deck.shuffle('test');
  ok(G.deck.cards[G.deck.cards.length - 1] === target, 'a bottled card ends a shuffle on top of the deck');
  const two = [G.deck.cards[0], G.deck.cards[10]];
  two.forEach((c) => { c.bottle = true; });
  G.deck.shuffle('test2');
  const top = G.deck.cards.slice(-3);
  ok(top.includes(target) && top.includes(two[0]) && top.includes(two[1]), 'several bottled cards: all on top');
  // copy keeps bottle
  const cp = AMM.combine_cards ? null : null; void cp;
  const d = describe(target);
  ok(d.badges.some((b) => b.key === 'bottle') && d.info.some((i) => i.key === 'bottle'), 'describe: Bottled badge + info');
}

// ============================================================== combining
{
  start('AMMCOMB', { mods: CLIENT });
  const [a, b] = hand(['S_K', 'H_5']);
  a.set_ability(P_CENTERS.m_steel); a.set_seal('Red', true); a.ability.perma_mult = 3;
  b.set_edition({ foil: true }, true, true); b.bottle = true; AMM.set_aspect(b, 'ac_double', true); b.ability.perma_bonus = 4;
  const before = G.playing_cards.length;
  const nc = AMM.combine_cards([a, b], 'amalgamiter', G.hand);
  flush();
  ok(!G.playing_cards.includes(a) && !G.playing_cards.includes(b) && G.playing_cards.includes(nc) && G.playing_cards.length === before - 1, 'combine_cards: the two cards leave, the new one joins');
  ok(G.graveyard.length === 0, 'combined cards are removed from the game (no graveyard)');
  ok(nc.config.center.key === 'm_steel' && nc.seal === 'Red' && nc.edition && nc.edition.foil && nc.aspect === 'ac_double' && nc.bottle === true, 'the only enhancement / seal / edition / aspect / bottle carry over');
  ok(['King', '5'].includes(nc.base.value) && ['Spades', 'Hearts'].includes(nc.base.suit), 'suit and rank come from the combined cards');
  // perma_bonus = 10 (K) + 5 (5) + 4 - own nominal
  ok(nc.ability.perma_bonus === 19 - nc.base.nominal && nc.ability.perma_mult === 3, 'permanent bonuses add up (rank chips folded into perma_bonus)', [nc.ability.perma_bonus, nc.base.nominal]);
  // FIX 2: a combined card is numbered like any deck card, so it can be buried when destroyed
  ok(typeof nc.playing_card === 'number' && nc.playing_card > 0, 'fix: the combined card has a playing_card number');
  destroy(nc);
  ok(G.graveyard.length === 1, 'fix: a destroyed combined card reaches the graveyard');
}

// ======================================================= destroy_random_jokers / mod_blind
{
  start('AMMDRJ', { mods: CLIENT });
  const e = add('j_joker'); e.set_eternal(true);
  const r = add('j_greedy_joker'); r.set_rental(true);
  const p = add('j_lusty_joker');
  const q = add('j_wrathful_joker');
  AMM.destroy_random_jokers(G.jokers.cards, 1); flush();
  ok(G.jokers.cards.includes(e) && !G.jokers.cards.includes(r) && G.jokers.cards.length === 3, 'destroy_random_jokers(1): an Eternal stays, a Rental goes first');
  AMM.destroy_random_jokers(G.jokers.cards, 5); flush();
  ok(G.jokers.cards.length === 1 && G.jokers.cards[0] === e, 'destroy_random_jokers(5): everything but the Eternal');
  void p; void q;
  G.GAME.blind.chips = 1000;
  AMM.mod_blind(0.75, true, true);
  ok(G.GAME.blind.chips === 750, 'mod_blind percent: 1000 x 0.75 = 750');
  AMM.mod_blind(-50, true);
  ok(G.GAME.blind.chips === 700, 'mod_blind flat: -50');
}

// ========================================================= card qualities
{
  start('AMMCQ', { mods: CLIENT });
  const Q = AMM.CARD_QUALITIES;
  const [k, s, seven, two] = hand(['S_K', 'S_A', 'H_7', 'D_2']);
  ok(Q.has(k, 'face') && !Q.has(seven, 'face') && Q.has(seven, 'nonface') && Q.has(seven, 'numbered') && !Q.has(s, 'numbered'), 'face / nonface / numbered');
  ok(Q.has(seven, 'odd') && Q.has(s, 'odd') && Q.has(two, 'even') && Q.has(seven, 'prime') && Q.has(s, 'prime') && !Q.has(k, 'prime'), 'odd (Aces too) / even / prime');
  k.set_ability(P_CENTERS.m_stone);
  ok(Q.has(k, 'suitless') && Q.has(k, 'rankless') && Q.has(k, 'rock') && Q.has(k, 'materialenh') && Q.has(seven, 'unenhanced'), 'stone: suitless / rankless / rock / material');
  ok(Q.localize('metal') === 'metal-enhanced' && Q.localize('metal', 1) === 'Metal-Enhanced', 'localize (lower / Capitalised)');
  const before = G.playing_cards.length;
  const made = Q.create('metal', 2, G.deck, 'cqtest');
  ok(made.length === 2 && made.every((c) => ['m_steel', 'm_gold'].includes(c.config.center.key) && G.deck.cards.includes(c)) && G.playing_cards.length === before + 2, 'create("metal", 2): two Steel/Gold cards in the deck');
  const f = Q.create('face', 1, G.hand, 'cqtest')[0];
  ok(f.is_face() && G.hand.cards.includes(f), 'create("face")');
  const rq = Q.random('cqrand');
  ok(typeof rq === 'string' && !['hexed', 'clipped', 'cursed', 'vowel'].includes(rq), 'random(): only qualities whose mods are present', rq);
}

// =============================================== unscored perma / held perma / perma repetitions
{
  start('AMMPERMA', { mods: CLIENT });
  // High Card A + 3: the 3 doesn't score; perma_u_mult +6 and the client joker's unscored +3 chips
  const [a, three] = hand(['S_A', 'H_3']);
  three.ability.perma_u_mult = 6;
  add('j_ac_watcher');
  let r = play([a, three]);
  // 5 + 11 = 16 chips (+3 from the watcher on the unscored 3) = 19; mult 1 + 6 = 7 -> 133
  ok(tot(r).join() === '19,7,133', 'unscored: perma_u_mult and an unscored-card joker effect (SMODS "unscored" area)', tot(r));
  // held perma X mult (SMODS perma_h_x_mult) and perma_repetitions
  const [p1, h1] = hand(['S_A', 'D_9']);
  h1.ability.perma_h_x_mult = 0.5;
  p1.ability.perma_repetitions = 2;
  r = play([p1]);
  // A scores 3 times: 5 + 33 = 38 chips; mult 1 -> held 9 X1.5 = 1.5 -> 57
  ok(tot(r).join() === '38,1.5,57', 'perma_repetitions (2 retriggers) and held perma_h_x_mult X1.5', tot(r));
}

// ======================================================== stamps (via the client mod)
{
  start('AMMSTAMP', { mods: CLIENT });
  ok((P_CENTER_POOLS.Stamp || []).length === 1 && !(P_CENTER_POOLS.Seal || []).some((s) => s.key === 'ac_wide'), 'a Stamp pools apart from the seals');
  const hs = G.hand.config.card_limit;
  const j = add('j_joker');
  j.set_seal('ac_wide'); flush();
  ok(G.hand.config.card_limit === hs + 1, 'Stamp apply on an owned joker: +1 hand size');
  j.set_seal(null); flush();
  ok(G.hand.config.card_limit === hs, 'unapply when the stamp is removed');
  j.set_seal('ac_wide'); flush();
  j.remove(); flush();
  ok(G.hand.config.card_limit === hs, 'deck_remove when the joker leaves');
  const j2 = new Card(P_CARDS.empty, P_CENTERS.j_joker, {});
  j2.set_seal('ac_wide', true);
  j2.add_to_deck(); G.jokers.emplace(j2); flush();
  ok(G.hand.config.card_limit === hs + 1, 'deck_add when a stamped joker joins');
  // calculate: joker_main +7 mult before the joker's own +4
  let r = play(hand(['H_A']));
  ok(tot(r).join() === '16,12,192', 'stamp joker_main: +7 Mult (then the Joker +4)', tot(r));
  j2.set_debuff(true);
  r = play(hand(['H_A']));
  ok(tot(r).join() === '16,1,16', 'a debuffed joker\'s stamp does nothing', tot(r));
  j2.set_debuff(false);
  LOG.length = 0;
  winRound();
  ok(LOG.includes('stamp_eor'), 'stamp end_of_round context (message + func)');
  const d = describe(j2);
  ok(d.badges.some((b) => b.key === 'ac_wide_stamp' && b.label === 'Wide Stamp') && d.info.some((i) => i.name === 'Wide Stamp'), 'describe: the Stamp badge + info');
  const v = toView();
  const jv = v.areas.jokers.find((x) => x.id === j2.sort_id);
  ok(jv.stamp === 'ac_wide' && jv.mod_stickers.some((s) => s.atlas === 'ac_atlas'), 'view: the stamp is drawn over the joker');
}

// ======================================================= aspects (via the client mod)
{
  start('AMMASP', { mods: CLIENT });
  LOG.length = 0;
  const [a] = hand(['H_A']);
  AMM.set_aspect(a, 'ac_double');
  const r = play([a]);
  // the aspect retriggers the Ace once: 5 + 11 + 11 = 27; X2 each time: 1 -> 2 -> 4 => 108
  ok(tot(r).join() === '27,4,108', 'aspect: X2 Mult in main scoring + 1 retrigger', tot(r));
  ok(LOG.includes('aspect_before_held') === false, 'only cards with the aspect react');
  const [held] = hand(['C_2']);
  AMM.set_aspect(held, 'ac_double', true);
  const [p] = hand(['S_3']);
  play([p]);
  ok(LOG.includes('aspect_before_held'), 'aspect: the before context reaches held cards');
  LOG.length = 0;
  const [dc] = hand(['D_8']);
  AMM.set_aspect(dc, 'ac_double', true);
  discard([dc]);
  ok(LOG.includes('aspect_discard'), 'aspect: the discard context');
  const cp = new Card(P_CARDS.S_2, P_CENTERS.c_base, {});
  const { copy_card } = await import('../../js/engine/core.js');
  copy_card(dc, cp);
  ok(cp.aspect === 'ac_double', 'copy_card copies the aspect');
  const d = describe(dc);
  ok(d.badges.some((b) => b.key === 'ac_double_aspect' && b.colour === '#ff0000'), 'describe: aspect badge in its colour');
  const deb = hand(['H_A'])[0];
  AMM.set_aspect(deb, 'ac_double', true);
  deb.set_debuff(true);
  const r2 = play([deb]);
  ok(tot(r2).join() === '5,1,5', 'a debuffed card\'s aspect does nothing', tot(r2));
}

// ============================================== Oddities: rarities, packs, tags (client mod)
{
  start('AMMODD', { mods: CLIENT });
  ok(G.GAME.oddity_rate === 3 && P_CENTER_POOLS.Oddity.length === 2, 'with Oddities registered the shop rate stays 3');
  // rarity pools: weights 65/30/5/0 -> the Legendary (weight 0) never rolls
  const seen = {};
  for (let i = 0; i < 200; i++) { const c = create_card('Oddity', G.consumeables, null, null, null, null, null, 'rt' + i); seen[c.config.center.key] = (seen[c.config.center.key] || 0) + 1; }
  ok(seen.c_ac_common > 0 && !seen.c_ac_legend, 'Oddity rarities: a weight-0 Legendary never rolls', seen);
  // FIX 1: legendary -> the Legendary pool (the Lua pointed at rarity_pools[-4], which doesn't exist)
  const L = create_card('Oddity', G.consumeables, true, null, null, null, null, 'heirloomtag');
  ok(L.config.center.key === 'c_ac_legend', 'fix: a legendary Oddity roll uses the Legendary pool', L.config.center.key);
  L.remove(); flush(); // (frees it for the pool again)
  // Heirloom Tag: a Legendary Oddity (must have room)
  clearConsumables();
  ok(P_TAGS.tag_amm_heirloom.in_pool(), 'Heirloom Tag in pool once a Legendary Oddity exists');
  add_tag(new Tag('tag_amm_heirloom'));
  for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'immediate' });
  flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].config.center.key === 'c_ac_legend', 'Heirloom Tag: creates a Legendary Oddity');
  // Oddity Tag: a free Mega Oddity Pack; pack cards are SELECTED into the consumable slots, not used
  clearConsumables();
  toShop();
  add_tag(new Tag('tag_amm_oddity'));
  act({ type: 'next_round' }); // (the blind select applies new_blind_choice tags)
  ok(G.STATE === STATES.MOD_PACK && G.GAME.pack_kind === 'Oddity' && G.pack_cards.cards.length === 5 && G.GAME.pack_choices === 2, 'Oddity Tag: a free Mega Oddity Pack (5 cards, choose 2)');
  ok(G.pack_cards.cards.every((c) => c.ability.set === 'Oddity'), 'the pack holds Oddities');
  const pc = G.pack_cards.cards[0];
  ok(!act({ type: 'use', id: pc.sort_id }).ok, 'an Oddity in a pack cannot be Used');
  const v = toView();
  const pv = v.areas.pack_cards.find((x) => x.id === pc.sort_id);
  ok(pv.reserve && pv.no_use && pv.reserve_label === 'Select', 'view: the pack card shows Select');
  ok(act({ type: 'reserve', id: pc.sort_id }).ok && G.consumeables.cards.includes(pc) && G.GAME.pack_choices === 1, 'Select: the Oddity goes to the consumable slots');
  const d = describe(pc);
  ok(d.badges.some((b) => b.key === 'common' && b.label === 'Common'), 'describe: the Oddity rarity badge');
}

// ================================================================= petting
{
  start('AMMPET', { mods: CLIENT });
  LOG.length = 0;
  const j = add('j_ac_watcher');
  ok(act({ type: 'amm_pet', id: j.sort_id, direction: 'counter-clockwise', time: 0.8 }).ok, 'the amm_pet action');
  ok(LOG.includes('pet:counter-clockwise:true'), 'amm_pet_card context with its direction', LOG);
  ok(!act({ type: 'amm_pet', id: 999999, direction: 'clockwise' }).ok, 'petting needs a real card');
}

done();
