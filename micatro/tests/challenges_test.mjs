// Challenges (micatro/js/engine/challenge.js + micatro/data/challenges.js) and deck sleeves
// (micatro/js/engine/sleeve.js): Balatro's 20 challenges and every mod challenge (Pokermon,
// Nacho, Pokermon+, MoreFluff, BETMMA) start with their rules, decks, jokers and bans; the
// custom rules FIRE (no reward, no interest, no shop jokers, Luxury Tax hand size, Typecast,
// Golden Needle discard cost, Nuzlocke slots + Buffoon pack, Gotta Go Fast scaling, Overpowered
// Boss Flint halving, Superboss always on); every sleeve (Pokermon, Pokermon+, MoreFluff) applies
// like a second deck, with its deck pairing; a challenge / sleeve run is in the recipe and replays
// identically; a run with neither never activates the internal mods.
//   node micatro/tests/challenges_test.mjs
import { T, clearHand, hand, play, discard, winRound, nextRound, G, P_CENTERS, act, STATES } from './mods/oio_helpers.mjs';
import { newRun } from '../js/engine/run.js';
import { get_blind_amount } from '../js/engine/core.js';
import { Session } from '../js/engine/session.js';
import { toView } from '../js/engine/view.js';
import { MODS, ACTIVE } from '../js/mods/registry.js';
import { loadMods } from '../js/mods/index.js';
import * as CH from '../js/engine/challenge.js';
import * as SL from '../js/engine/sleeve.js';

const { ok, done } = T();
const jokers = () => G.jokers.cards.map((c) => c.config.center.key);
const start = (challenge, mods = [], seed = 'CHT') => { const s = new Session(); s.start({ seed, challenge, mods }); G.E_MANAGER.flush(); return s; };
const toShop = () => { if (G.STATE === STATES.SELECTING_HAND) { winRound(); G.E_MANAGER.flush(); } if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); };

// ------------------------------------------------------------- vanilla
ok(CH.VANILLA_CHALLENGES.length === 20, 'Balatro ships 20 challenges', CH.VANILLA_CHALLENGES.length);
for (const c of CH.VANILLA_CHALLENGES) {
  const s = start(c.id);
  ok(G.GAME.challenge === c.id && s.recipe.challenge === c.id, `${c.id}: in G.GAME and the recipe`);
  ok(G.GAME.selected_back_key === 'b_challenge' && G.GAME.stake === 1 && s.recipe.stake === 1, `${c.id}: Challenge Deck at stake 1`);
  ok(toView().challenge && toView().challenge.name === c.name, `${c.id}: view.challenge`, toView().challenge);
  ok(!G.GAME.mods.includes(CH.CHALLENGE_ID), `${c.id}: the internal mod is never listed`);
  for (const j of c.jokers || []) ok(jokers().includes(j.id), `${c.id}: starts with ${j.id}`);
  for (const v of c.vouchers || []) ok(G.GAME.used_vouchers[v.id], `${c.id}: voucher ${v.id}`);
  for (const b of c.restrictions.banned_cards) ok(G.GAME.banned_keys[b.id], `${c.id}: bans ${b.id}`);
}
// a stake passed in is ignored (Balatro starts every challenge at stake 1)
{ const s = new Session(); s.start({ seed: 'CHT', challenge: 'c_omelette_1', stake: 8 }); ok(G.GAME.stake === 1 && s.recipe.stake === 1, 'challenge runs are stake 1'); }

// The Omelette: 5 Eggs; no blind reward, no extra-hand money, no interest
start('c_omelette_1');
ok(jokers().filter((k) => k === 'j_egg').length === 5, 'Omelette: 5 Eggs');
act({ type: 'select_blind' }); clearHand();
G.GAME.dollars = 50;
winRound(); G.E_MANAGER.flush();
{ const d0 = G.GAME.dollars; act({ type: 'cash_out' }); ok(G.GAME.dollars === d0, 'Omelette: the cash out pays nothing (no reward / hands / interest)', [d0, G.GAME.dollars]); }

// Cruelty: Small and Big give no reward money (the Boss still does); 3 joker slots
start('c_cruelty_1');
ok(G.GAME.modifiers.no_blind_reward.Small && G.GAME.modifiers.no_blind_reward.Big && !G.GAME.modifiers.no_blind_reward.Boss && G.jokers.config.card_limit === 3, 'Cruelty: Small/Big no reward, 3 joker slots');

// Jokerless / Bram Poker: no jokers in the shop
start('c_jokerless_1');
ok(G.GAME.joker_rate === 0 && G.jokers.config.card_limit === 0 && G.GAME.banned_keys.p_buffoon_jumbo_1 && G.GAME.banned_keys.tag_buffoon, 'Jokerless: joker rate 0, 0 slots, Buffoon packs + tags banned');
act({ type: 'select_blind' }); clearHand(); toShop();
ok(G.STATE === STATES.SHOP && !G.shop_jokers.cards.some((c) => c.ability.set === 'Joker'), 'Jokerless: the shop sells no jokers', G.shop_jokers.cards.map((c) => c.ability.set));
start('c_bram_poker_1');
ok(G.GAME.joker_rate === 0 && jokers().includes('j_vampire') && G.consumeables.cards.length === 2, 'Bram Poker: no shop jokers, Vampire, Empress + Emperor');

// Luxury Tax: 10 hand size, -1 per $5 held (CardArea:update)
start('c_luxury_1');
ok(G.hand.config.card_limit === 10, 'Luxury Tax: hand size 10');
act({ type: 'select_blind' });
G.GAME.dollars = 17; act({ type: 'sort_hand', by: 'rank' });
ok(G.hand.config.card_limit === 7, 'Luxury Tax: $17 -> hand size 7', G.hand.config.card_limit);
G.GAME.dollars = 4; act({ type: 'sort_hand', by: 'rank' });
ok(G.hand.config.card_limit === 10, 'Luxury Tax: back to 10 at $4', G.hand.config.card_limit);

// Golden Needle: 1 hand, 6 discards, $10, discards cost $1
start('c_golden_needle_1');
ok(G.GAME.round_resets.hands === 1 && G.GAME.round_resets.discards === 6 && G.GAME.dollars === 10, 'Golden Needle: 1 hand, 6 discards, $10');
act({ type: 'select_blind' });
{ const d0 = G.GAME.dollars; act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'discard' }); ok(G.GAME.dollars === d0 - 1, 'Golden Needle: a discard costs $1', [d0, G.GAME.dollars]); }

// Typecast: when the ante 4 boss is beaten, jokers turn eternal and the joker slots drop to 0
start('c_typecast_1');
ok(G.GAME.modifiers.set_eternal_ante === 4 && G.GAME.modifiers.set_joker_slots_ante === 4, 'Typecast: rules set');

// Decks: Mad World (2-9 only), Medusa (stone faces), 15 Minute City (extra faces, no 2/3), Double or Nothing (red seals)
start('c_mad_world_1');
ok(G.playing_cards.length === 32 && G.playing_cards.every((c) => c.base.id >= 2 && c.base.id <= 9), 'Mad World: 32 cards, 2-9');
start('c_medusa_1');
ok(G.playing_cards.filter((c) => c.config.center.key === 'm_stone').length === 12, 'Medusa: J/Q/K are Stone cards');
start('c_city_1');
ok(G.playing_cards.length === 52 && !G.playing_cards.some((c) => c.base.id === 2 || c.base.id === 3) && G.playing_cards.filter((c) => c.base.id >= 11 && c.base.id <= 13).length === 24, '15 Minute City: its 52-card list');
start('c_double_nothing_1');
ok(G.playing_cards.every((c) => c.seal === 'Red') && G.GAME.modifiers.debuff_played_cards, 'Double or Nothing: red seals + played cards debuffed');
start('c_xray_1');
ok(G.GAME.modifiers.flipped_cards === 4, 'X-ray Vision: 1 in 4 drawn face down');
start('c_five_card_1');
ok(G.hand.config.card_limit === 5 && G.jokers.config.card_limit === 7 && G.GAME.round_resets.discards === 6, 'Five-Card Draw: 5 hand, 7 slots, 6 discards');
start('c_knife_1');
ok(G.jokers.cards[0] && G.jokers.cards[0].pinned && G.jokers.cards[0].ability.eternal, "On a Knife's Edge: pinned eternal Ceremonial Dagger");
start('c_fragile_1');
ok(G.jokers.cards.length === 2 && G.jokers.cards.every((c) => c.edition && c.edition.negative) && G.GAME.banned_keys.p_standard_mega_2 && G.GAME.banned_keys.tag_standard, 'Fragile: 2 Negative Oops, Standard packs + tag banned');

// determinism: a challenge run rebuilt from its recipe
function bot(s, n) {
  for (let i = 0; i < n && !G.GAME.over; i++) {
    const S = G.STATE;
    if (S === STATES.BLIND_SELECT) s.act({ type: 'select_blind' });
    else if (S === STATES.SELECTING_HAND) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); }
    else if (S === STATES.ROUND_EVAL) s.act({ type: 'cash_out' });
    else if (S === STATES.SHOP) { const c = G.shop_jokers.cards.find((x) => x.cost <= G.GAME.dollars); if (c && i % 3 === 0) s.act({ type: 'buy', id: c.sort_id }); else s.act({ type: 'next_round' }); }
    else s.act({ type: 'skip_booster' });
  }
}
const sig = () => JSON.stringify({ d: G.GAME.dollars, a: G.GAME.round_resets.ante, r: G.GAME.round, c: String(G.GAME.chips), j: jokers(), h: G.hand.cards.map((c) => c.config.card.key), s: G.STATE, hs: G.hand.config.card_limit });
for (const id of ['c_luxury_1', 'c_omelette_1', 'c_jokerless_1', 'c_city_1']) {
  const s = start(id, [], 'DET' + id);
  bot(s, 60);
  const a = sig();
  Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(a === sig(), `${id}: replays identically from its recipe`, [a, sig()]);
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe)));
  st.seek(st.total);
  ok(a === sig(), `${id}: the replay stepper rebuilds it`);
}

// a plain run never activates the internal mods (and keeps no challenge / sleeve)
newRun({ seed: 'PLAIN' });
ok(!ACTIVE.includes(CH.CHALLENGE_ID) && !ACTIVE.includes(SL.SLEEVE_ID) && !G.GAME.challenge && !G.GAME.selected_sleeve, 'a plain run: no challenge / sleeve mods');
{ const s = new Session(); s.start({ seed: 'PLAIN' }); ok(!('challenge' in s.recipe) && !('sleeve' in s.recipe), 'a plain recipe has no challenge / sleeve keys'); }
// an unknown challenge id plays a plain run
newRun({ seed: 'PLAIN', challenge: 'c_nope' });
ok(!G.GAME.challenge && G.GAME.selected_back_key === 'b_red', 'an unknown challenge id is ignored');

// ------------------------------------------------------------- mods
await loadMods(['pokermon', 'nacho', 'pokermonplus', 'morefluff', 'betmma']);
const all = CH.allChallenges();
const byMod = (m) => all.filter((c) => c.mod === m).length;
ok(byMod('pokermon') === 7 && byMod('nacho') === 4 && byMod('pokermonplus') === 4 && byMod('morefluff') === 1 && byMod('betmma') === 5, 'mod challenges: Pokermon 7, Nacho 4, Pokermon+ 4, MoreFluff 1, BETMMA 5', ['pokermon', 'nacho', 'pokermonplus', 'morefluff', 'betmma'].map(byMod));
ok(all.every((c) => c.name && c.name !== c.id), 'every challenge has a name', all.filter((c) => !c.name || c.name === c.id).map((c) => c.id));
for (const c of all.filter((x) => x.mod)) {
  const s = start(c.id, [c.mod]);
  ok(G.GAME.challenge === c.id && G.GAME.mods.includes(c.mod), `${c.id}: starts with ${c.mod} on`);
  for (const j of c.jokers) if (P_CENTERS[j.id]) ok(jokers().includes(j.id), `${c.id}: starts with ${j.id}`);
  bot(s, 25);
}
// a mod challenge brings its mod even when the caller forgot it
start('c_poke_littlecup', []);
ok(G.GAME.mods.includes('pokermon') && jokers().includes('j_poke_everstone'), 'Little Cup turns Pokermon on by itself');

// Nuzlocke: 1 slot, all eternal, no shop jokers; +1 slot per ante (up to 5); each ante's first shop has a Buffoon pack
start('c_poke_nuzlocke', ['pokermon']);
ok(G.jokers.config.card_limit === 1 && G.GAME.modifiers.all_eternal && G.GAME.joker_rate === 0 && G.GAME.banned_keys.p_buffoon_normal_2, 'Nuzlocke: 1 slot, all eternal, no shop jokers, Buffoon packs banned');
act({ type: 'select_blind' }); clearHand(); toShop();
ok(G.shop_booster.cards.some((c) => /^p_buffoon_normal_/.test(c.config.center.key)), 'Nuzlocke: the first shop has a Buffoon pack despite the ban', G.shop_booster.cards.map((c) => c.config.center.key));
act({ type: 'next_round' });
{
  const lim0 = G.jokers.config.card_limit;
  for (let i = 0; i < 2; i++) nextRound(); // Big, Boss
  toShop();
  ok(G.GAME.round_resets.ante === 2 && G.jokers.config.card_limit === lim0 + 1, 'Nuzlocke: +1 joker slot after the boss', [G.GAME.round_resets.ante, lim0, G.jokers.config.card_limit]);
  ok(G.shop_booster.cards.some((c) => /^p_buffoon_normal_/.test(c.config.center.key)), "Nuzlocke: ante 2's first shop has a Buffoon pack again");
  for (let i = 0; i < 8; i++) MODS.challenge.hooks.ease_ante(1);
  ok(G.jokers.config.card_limit === lim0 + 5, 'Nuzlocke: at most +5 slots', G.jokers.config.card_limit);
}
start('c_poke_randomizer', ['pokermon']);
ok(G.GAME.modifiers.apply_randomizer === true, 'Randomizer: apply_randomizer on');
start('c_poke_goodasgold', ['pokermon']);
ok(G.playing_cards.every((c) => c.config.center.key === 'm_gold') && G.hand.config.card_limit === 6, 'Good As Gold: every card Gold, hand size 6');
start('c_poke_hammertime', ['pokermon']);
ok(G.playing_cards.length === 20 && G.playing_cards.filter((c) => c.config.center.key === 'm_steel').length === 1, 'Hammertime: its 20-card deck (one Steel Ace)');
start('c_nacho_sinnoh_adv', ['nacho']);
ok(G.GAME.modifiers.sinnoh_adv === true && G.GAME.used_vouchers.v_overstock_norm, 'Sinnoh Adventure: rule + Overstock');
start('c_sonfive_wonder_guard', ['pokermonplus']);
ok(G.GAME.modifiers.sonfive_wonderguard === true && jokers().includes('j_sonfive_shedinja'), 'Guard the Wonder: rule + Shedinja');
start('c_sonfive_salt_cured', ['pokermonplus']);
ok(G.jokers.cards.some((c) => c.config.center.key === 'j_poke_corsola' && c.edition && c.edition.poke_shiny), 'Salt Cured: a shiny Corsola');

// MoreFluff's Better Balatro II: Superboss on from the start, scaling 4 + 4
start('c_mf_superboss_always', ['morefluff']);
ok(G.GAME.superboss_active === true && G.GAME.modifiers.scaling === 4 && G.GAME.modifiers.bonus_scaling === 4 && G.GAME.dollars === 14, 'Better Balatro II: Superboss active, scaling 4 + 4, $14');
ok(G.GAME.round_resets.blind_choices.Small === 'bl_mf_bigger_blind', 'Better Balatro II: the first ante already has the Superboss blinds', G.GAME.round_resets.blind_choices);

// BETMMA: Gotta Go Fast's blind table; Overpowered Boss halves base chips + mult on every boss (The Flint: a quarter)
start('c_betmma_gottagofast', ['betmma']);
ok(get_blind_amount(1) === 300 && get_blind_amount(2) === 1500 && get_blind_amount(8) === 500000000, 'Gotta Go Fast: 300 / 1500 / ... / 500M', [get_blind_amount(2), get_blind_amount(8)]);
ok(get_blind_amount(9) > 500000000, 'Gotta Go Fast: past ante 8 it keeps growing');
start('c_betmma_overpoweredboss', ['betmma']);
{
  const H = MODS.challenge.hooks;
  ok(H.blind_modify_hand({ name: 'The Wall', disabled: false }, [], {}, 'Pair', 10, 100)[0] === 5, 'Overpowered Boss: a boss halves mult');
  ok(H.blind_modify_hand({ name: 'The Flint', disabled: false }, [], {}, 'Pair', 8, 100)[1] === 25, 'Overpowered Boss: The Flint quarters chips');
  ok(H.blind_modify_hand({ name: 'Small Blind', disabled: false }, [], {}, 'Pair', 8, 100) === undefined, 'Overpowered Boss: not the Small Blind');
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); clearHand();
  const r1 = play(hand(['S_K', 'H_K']));
  ok(r1.total && r1.events.some((e) => e.type === 'hand_text' && e.modded) === false, 'Overpowered Boss: the Small Blind leaves the hand alone');
  nextRound(); nextRound(); // Big, then the Boss (The Wall)
  ok(G.GAME.blind.name === 'The Wall', 'Overpowered Boss: at the boss', G.GAME.blind.name);
  const r2 = play(hand(['S_K', 'H_K']));
  const ht = r2.events.find((e) => e.type === 'hand_text' && e.modded);
  ok(ht && ht.mult === 1 && ht.chips === 5, 'Overpowered Boss: The Wall halves a Pair (10 chips x 2 -> 5 x 1) through Blind:modify_hand', ht);
}
// a vanilla run with BETMMA on keeps vanilla scaling (the rule hooks live only in the challenge)
newRun({ seed: 'B', mods: ['betmma'] });
ok(get_blind_amount(2) === 800 && !ACTIVE.includes(CH.CHALLENGE_ID), 'BETMMA without the challenge: vanilla scaling');

// ------------------------------------------------------------- sleeves
const sleeves = SL.allSleeves();
ok(sleeves.filter((s) => s.mod === 'pokermon').length === 10 && sleeves.filter((s) => s.mod === 'pokermonplus').length === 5 && sleeves.filter((s) => s.mod === 'morefluff').length === 4, 'sleeves: Pokermon 10, Pokermon+ 5, MoreFluff 4');
for (const sl of sleeves) {
  const s = new Session();
  s.start({ seed: 'SLV', back: 'b_blue', sleeve: sl.key, mods: [sl.mod] });
  G.E_MANAGER.flush();
  ok(s.recipe.sleeve === sl.key && G.GAME.selected_sleeve === sl.key && toView().sleeve && toView().sleeve.key === sl.key, `${sl.key}: recipe + view`);
  ok(!G.GAME.mods.includes(SL.SLEEVE_ID) && G.GAME.round_resets.hands === 5 + (sl.config.hands || 0), `${sl.key}: on top of the Blue deck (+1 hand)`);
  bot(s, 20);
  const a = sig();
  Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(a === sig(), `${sl.key}: replays identically`);
}
const sleeveRun = (key, back, mods) => { const s = new Session(); s.start({ seed: 'SLV2', back, sleeve: key, mods }); G.E_MANAGER.flush(); return s; };
sleeveRun('sleeve_poke_telekineticsleeve', 'b_red', ['pokermon']);
ok(G.GAME.used_vouchers.v_crystal_ball && G.consumeables.cards.filter((c) => c.config.center.key === 'c_poke_twisted_spoon').length === 2, 'Telekinetic Sleeve: Crystal Ball + 2 Twisted Spoons');
sleeveRun('sleeve_poke_futuresleeve', 'b_red', ['pokermon']);
ok(G.GAME.scry_amount === 4, 'Future Sleeve: +4 Foresight');
sleeveRun('sleeve_poke_stadiumsleeve', 'b_red', ['pokermon']);
ok(G.playing_cards.length === 60 && G.GAME.starting_deck_size === 60, 'Stadium Sleeve: +8 enhanced cards');
sleeveRun('sleeve_poke_megasleeve', 'b_red', ['pokermon']);
ok(G.GAME.shop.joker_max === 1 && G.GAME.used_vouchers.v_reroll_glut, 'Mega Sleeve: -1 shop slot, Reroll Glut');
sleeveRun('sleeve_sonfive_propheticsleeve', 'b_red', ['pokermonplus']);
ok(G.GAME.scry_amount === 3 && G.hand.config.card_limit === 7, 'Prophetic Sleeve: Foresight 3, -1 hand size');
sleeveRun('sleeve_sonfive_propheticsleeve', 'b_sonfive_propheticdeck', ['pokermonplus']);
ok(G.GAME.scry_amount === 6 && toView().sleeve.alt === true, 'Prophetic Sleeve + Prophetic Deck: the alt (Foresight 6)', G.GAME.scry_amount);
sleeveRun('sleeve_sonfive_virtuoussleeve', 'b_sonfive_virtuousdeck', ['pokermonplus']);
ok(G.GAME.used_vouchers.v_hieroglyph, 'Virtuous Sleeve + Virtuous Deck: Hieroglyph');
sleeveRun('sleeve_mf_grosmichel', 'b_red', ['morefluff']);
ok(jokers().join() === 'j_gros_michel', 'Gros Michel Sleeve: a Gros Michel');
sleeveRun('sleeve_mf_grosmichel', 'b_mf_grosmichel', ['morefluff']);
ok(jokers().join() === 'j_cavendish', 'Gros Michel Sleeve + Gros Michel Deck: only a Cavendish (the deck skips its own)', jokers());
newRun({ seed: 'GM', back: 'b_mf_grosmichel', mods: ['morefluff'] }); G.E_MANAGER.flush();
ok(jokers().join() === 'j_gros_michel', 'Gros Michel Deck alone still gives its Gros Michel');
sleeveRun('sleeve_mf_blasphemy', 'b_mf_blasphemy', ['morefluff']);
ok(G.jokers.cards.length === 1 && !G.jokers.cards[0].ability.eternal && G.jokers.cards[0].edition.negative, 'Blasphemous Sleeve + deck: one Negative, non-Eternal Blasphemy');
// the vending sleeve's Voucher Tag after an odd ante's boss
sleeveRun('sleeve_poke_vendingsleeve', 'b_red', ['pokermon']);
act({ type: 'select_blind' }); clearHand();
for (let i = 0; i < 2; i++) nextRound();
G.GAME.last_blind = { boss: true }; G.GAME.round_resets.ante = 2;
MODS.sleeve.hooks.evaluate_round([]); G.E_MANAGER.flush();
ok(G.GAME.tags.some((t) => t.key === 'tag_voucher'), 'Vending Sleeve: a Voucher Tag after the ante 1 boss');
// a sleeve is ignored in a challenge (the challenge decides the deck)
{ const s = new Session(); s.start({ seed: 'X', challenge: 'c_omelette_1', sleeve: 'sleeve_poke_futuresleeve', mods: ['pokermon'] }); ok(!G.GAME.selected_sleeve && !s.recipe.sleeve, 'no sleeve in a challenge run'); }

done();
