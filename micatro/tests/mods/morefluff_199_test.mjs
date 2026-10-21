// More Fluff 1.9.9999 — what the upgrade from 1.5.6 brings beyond the jokers (micatro/mods/morefluff):
//   * the version pin (1.9.9999+r2) and the retired / removed keys (js/mods/aliases.js): a recipe naming a deleted
//     deck / sleeve / joker still loads, the deleted keys read as "retired cards" with their names, the 11 retired
//     jokers stay registered (hidden "Old Fluff" rarity, never offered)
//   * the 6 stakes and their stickers (Pink, Steel/Heavy, Zodiac, Hot/Potato, Ultramarine/Suspended, Final)
//   * the exile zone: the Purple Deck's Wheel, a Suspended consumable using itself two rounds later
//   * Rotarot Merchant / Tycoon, Gold as a hidden Spectral in Colour packs
//   * Final Stake's Superboss: the Ticket used at once, a Mega Superboss Pack filling all three slots, 3,333,333 blinds
//   node micatro/tests/mods/morefluff_199_test.mjs
import {
  ok, done, flush, start, clearHand, hand, add, clearJokers, clearConsumables, play, discard, winRound, nextRound, toShop,
  msgs, tot, filled, G, P_CENTERS, P_CARDS, act, STATES,
} from './morefluff_helpers.mjs';
import { P_JOKER_RARITY_POOLS, P_STAKES, P_BLINDS, Card, add_joker, create_card, get_pack, get_blind_amount, ease_ante } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { Session } from '../../js/engine/session.js';
import { MODS, isRetiredKey, resolveCardKey, keyKnown } from '../../js/mods/registry.js';
import { retiredName, retiredKeys } from '../../js/mods/aliases.js';
import { modPin, pinDiff, LEGACY_MOD_VERSIONS } from '../../js/mods/pins.js';
import { STATUS, RETIRED_KEYS } from '../../mods/morefluff/index.js';

const useC = (c, targets = []) => act({ type: 'use', id: c.sort_id, targets: targets.map((x) => x.sort_id) });
const run = (opts) => { newRun({ mods: ['morefluff'], back: 'b_red', ...opts }); flush(); };

// ===================================================================== version pin + keys
{
  ok(modPin('morefluff') === '1.9.9999+r2' && LEGACY_MOD_VERSIONS.morefluff === '1.5.6', 'pin 1.9.9999+r2 (pre-pin recipes read as 1.5.6)', modPin('morefluff'));
  const s = new Session();
  s.start({ seed: 'MF199PIN', mods: ['morefluff'] });
  ok(s.recipe.modVersions.morefluff === '1.9.9999+r2', 'a new run records the pin', s.recipe.modVersions);
  const old = { v: 1, seed: 'X', back: 'b_red', stake: 1, mods: ['morefluff'], actions: [] };
  const d = pinDiff(old);
  ok(d.length === 1 && d[0].id === 'morefluff' && d[0].recorded === '1.5.6' && d[0].current === '1.9.9999+r2', 'a pre-pin MoreFluff recipe shows the 1.5.6 -> 1.9.9999 change', d);
  // the deleted keys: retired cards (named), never registered; nothing renamed
  const removed = ['j_mf_complexitycreep', 'j_mf_lightningstrikesthrice', 'b_mf_grosmichel', 'b_mf_blasphemy', 'sleeve_mf_grosmichel', 'sleeve_mf_philosophical',
    'sleeve_mf_rainbow', 'sleeve_mf_blasphemy', 'p_mf_modded_jumbo_1', 'p_mf_modded_mega_1', 'tag_mf_moddedpack', 'tag_mf_clutch'];
  ok(removed.every((k) => !keyKnown(k) && isRetiredKey(k) && retiredKeys().includes(k)), 'every key 1.9.9999 deleted is a retired card', removed.filter((k) => !isRetiredKey(k)));
  ok(retiredName('j_mf_complexitycreep') === 'Complexity Creep' && retiredName('j_mf_lightningstrikesthrice') === 'Lightning Strikes Thrice' && retiredName('b_mf_blasphemy') === 'Blasphemous Deck', 'retired cards keep their names');
  ok(removed.every((k) => resolveCardKey(k) === k), 'nothing is renamed');
  // the RETIRED jokers (Old Fluff) are NOT retired keys: they still load as cards
  ok(RETIRED_KEYS.length === 11 && RETIRED_KEYS.every((k) => keyKnown(k) && !isRetiredKey(k) && P_CENTERS[k].rarity === 'mf_oldfluff'), 'the 11 Old Fluff jokers stay registered (not retired keys)');
  // a recipe naming a deleted deck / sleeve still starts (Red Deck, no sleeve)
  run({ seed: 'MF199OLD', back: 'b_mf_grosmichel', sleeve: 'sleeve_mf_blasphemy' });
  ok(G.GAME.selected_back_key === 'b_red' && !G.GAME.selected_sleeve && G.jokers.cards.length === 0, 'a run naming the Gros Michel Deck + Blasphemous Sleeve starts on the Red Deck', [G.GAME.selected_back_key, G.GAME.selected_sleeve]);
  // the retired jokers are never offered, but work when owned (old saves)
  start('MF199RET');
  let rolled = 0;
  for (let i = 0; i < 400; i++) { const c = create_card('Joker', G.jokers, null, null, null, null, null, 'shop'); if (RETIRED_KEYS.includes(c.config.center.key)) rolled++; c.remove(); }
  ok(rolled === 0, 'the retired jokers are never rolled (400 joker rolls)', rolled);
  const v = add('j_mf_virtual');
  ok(play(hand(['S_A', 'H_A'])).total.mult === 6 && describe(v).badges.some((b) => /Scrapped/.test(b.label || '')), 'a retired joker (Virtual, X3) still scores and shows the "Scrapped" rarity', describe(v).badges);
}

// ===================================================================== stakes
{
  ok(STATUS.stakes.join() === 'stake_mf_pink,stake_mf_steel,stake_mf_zodiac,stake_mf_hot,stake_mf_ultramarine,stake_mf_final', 'six stakes above Gold', STATUS.stakes);
  ok(P_STAKES.stake_mf_pink.applied_stakes[0] === 'gold' && P_STAKES.stake_mf_final.applied_stakes[0] === 'mf_ultramarine' && P_STAKES.stake_mf_pink.atlas === 'mf_stakes', 'stake chain from the Lua');
  // Pink: the second pack of a shop is a Standard Pack
  run({ seed: 'MF199PINK', stake: 'stake_mf_pink' });
  ok(G.GAME.stake === 8 && G.GAME.modifiers.mf_force_standard_pack && G.GAME.modifiers.enable_rentals_in_shop, 'Pink Stake: Gold\'s rules + its own', G.GAME.stake);
  act({ type: 'select_blind' }); clearHand(); toShop();
  const packs = G.shop_booster.cards.map((c) => c.config.center.key);
  ok(packs.length === 2 && /^p_standard_normal_[1-4]$/.test(packs[1]), 'Pink Stake: the second pack is a Standard Pack', packs);
  // Steel: Heavy jokers (one fewer card per discard each)
  run({ seed: 'MF199STEEL', stake: 'stake_mf_steel' });
  ok(G.GAME.modifiers.enable_mf_heavy && G.GAME.modifiers.mf_force_standard_pack, 'Steel Stake applies Pink');
  let heavy = 0;
  for (let i = 0; i < 60; i++) { const c = create_card('Joker', G.shop_jokers, null, null, null, null, null, 'sho'); if (c.ability.mf_heavy) heavy++; c.remove(); }
  ok(heavy > 5 && heavy < 35, 'Steel: ~30% of shop jokers are Heavy', heavy);
  act({ type: 'select_blind' }); clearHand();
  const hj = add('j_joker'); hj.ability.mf_heavy = true;
  const h5 = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6']);
  ok(!discard(h5).ok, 'Heavy: 5 cards can no longer be discarded at once');
  ok(discard(h5.slice(0, 4)).ok, 'Heavy: 4 can');
  const hv = toView().areas.jokers.find((x) => x.id === hj.sort_id);
  ok(describe(hj).badges.some((b) => b.label === 'Heavy') && hv && (hv.mod_stickers || []).length === 1, 'Heavy badge + sticker art', hv);
  // Zodiac: Magic Trick from the start
  run({ seed: 'MF199ZOD', stake: 'stake_mf_zodiac' });
  ok(G.GAME.used_vouchers.v_magic_trick && G.GAME.playing_card_rate > 0, 'Zodiac Stake: starts with Magic Trick', G.GAME.playing_card_rate);
  // Hot: Potato jokers must be sold first
  run({ seed: 'MF199HOT', stake: 'stake_mf_hot' });
  act({ type: 'select_blind' }); clearHand(); toShop();
  const pj = add('j_joker'), other = add('j_mf_jester');
  pj.ability.mf_potato = true;
  ok(!act({ type: 'sell', id: other.sort_id }).ok && act({ type: 'sell', id: pj.sort_id }).ok && act({ type: 'sell', id: other.sort_id }).ok, 'Hot: with a Potato joker held, only it can be sold; then the rest');
  const ep = add('j_joker'); ep.ability.mf_potato = true; ep.set_eternal(true); act({ type: 'reroll_shop' });
  ok(!ep.ability.mf_potato, 'Eternal removes Potato');
  // Final: flat 3,333,333 blinds once Superboss is on (scaling 6)
  run({ seed: 'MF199FIN', stake: 'stake_mf_final' });
  ok(G.GAME.modifiers.mf_final_stake && G.GAME.modifiers.enable_mf_suspend_sticker && G.GAME.modifiers.scaling === 3, 'Final Stake applies every other one');
  G.GAME.modifiers.scaling = 6;
  ok(get_blind_amount(8) === 3333333 && get_blind_amount(3) === 3333333, 'Final Stake: 3,333,333 at scaling 6');
  G.GAME.modifiers.scaling = 3;
  ok(get_blind_amount(3) !== 3333333, 'otherwise the normal amounts');
  // Final: the ante holds below the win ante (only the boss of ante 7 steps onto it)
  G.GAME.round_resets.ante = 7; ease_ante(3); flush();
  ok(G.GAME.round_resets.ante === 7, 'Final Stake: nothing pushes the ante past win_ante - 1', G.GAME.round_resets.ante);
}

// ===================================================================== Ultramarine: Suspended consumables
{
  run({ seed: 'MF199ULTRA', stake: 'stake_mf_ultramarine' });
  let sus = 0;
  for (let i = 0; i < 60; i++) { const c = create_card('Tarot', G.shop_jokers, null, null, null, null, null, 'sho'); if (c.ability.mf_suspend_sticker) sus++; c.remove(); }
  ok(sus > 10 && sus < 40, 'Ultramarine: ~40% of shop consumables are Suspended', sus);
  act({ type: 'select_blind' }); clearHand(); clearConsumables();
  const j0 = add('j_joker');
  const w = add_joker('c_mf_rot_wheel'); flush(); // (a 45° Wheel: 1 in 5 for an edition)
  w.ability.mf_suspend_sticker = true;
  G.GAME.probabilities.normal = 5;
  ok(useC(w).ok && w.area === G.mf_exile && w.ability.mf_suspended.rounds === 2 && !j0.edition, 'Suspended: the use exiles it for 2 rounds instead');
  const ev = toView().mod_areas;
  ok(ev && ev.some((a) => a.key === 'mf_exile') && toView().areas.mf_exile.length === 1, 'the exile row is shown while it holds cards', ev);
  ok(describe(w).info.some((i) => i.key === 'mf_suspended_info' && i.lines.join(' ').includes('2')), 'its text says when it comes back');
  nextRound();
  ok(w.area === G.mf_exile && w.ability.mf_suspended.rounds === 1, 'a round later: 1 to go', w.ability.mf_suspended);
  nextRound();
  ok(w.area !== G.mf_exile && j0.edition && !G.mf_exile.cards.length, 'two rounds later it uses itself (the Wheel gave the Joker an edition)', [j0.edition, w.area && w.area.name]);
  ok(G.STATE === STATES.SELECTING_HAND && G.GAME.last_rot_tarot_colour === 'c_mf_rot_wheel', 'the round goes on; the 45° Fool remembers it');
  G.GAME.probabilities.normal = 1;
}

// ===================================================================== Purple Deck
{
  run({ seed: 'MF199PURPLE', back: 'b_mf_purple' });
  ok(G.GAME.selected_back_key === 'b_mf_purple' && P_CENTERS.b_mf_purple.atlas === 'mf_enhancers', 'Purple Deck');
  const j0 = add('j_joker');
  G.GAME.probabilities.normal = 5;
  act({ type: 'select_blind' });
  ok(!G.mf_exile.cards.length && j0.edition && G.GAME.last_rot_tarot_colour === 'c_mf_rot_wheel', 'Purple Deck: each blind a 45° Wheel of Fortune is used (made in exile, 1 round)', j0.edition);
  ok(G.STATE === STATES.SELECTING_HAND && G.hand.cards.length === 8, 'and the round plays on');
  G.GAME.probabilities.normal = 1;
  clearJokers();
  nextRound();
  ok(!G.mf_exile.cards.length && G.STATE === STATES.SELECTING_HAND, 'with no joker to edition it is destroyed (nothing left in exile)');
}

// ===================================================================== Rotarot Merchant / Tycoon, Gold
{
  run({ seed: 'MF199MERCH' });
  const rot = Object.values(P_CENTERS).filter((c) => c.kind === 'Rotarot');
  const w0 = rot[0].get_weight(rot[0]);
  G.GAME.used_vouchers.v_mf_rotarot_merchant = true;
  ok(rot[0].get_weight(rot[0]) === w0 * 3, 'Rotarot Merchant: Rotarot packs X3 as likely');
  G.GAME.used_vouchers.v_mf_rotarot_tycoon = true;
  ok(rot[0].get_weight(rot[0]) === w0 * 9 && P_CENTERS.v_mf_rotarot_tycoon.requires[0] === 'v_mf_rotarot_merchant', 'Tycoon: X9');
  ok(filled(describeCenter('v_mf_rotarot_merchant')) && describeCenter('v_mf_rotarot_tycoon').lines.join(' ').includes('9'), 'voucher texts');
  act({ type: 'select_blind' }); clearHand(); toShop();
  G.GAME.dollars = 100;
  const pk = new Card(P_CARDS.empty, P_CENTERS.p_mf_rotarot_normal_1);
  G.shop_booster.emplace(pk);
  act({ type: 'buy', id: pk.sort_id });
  ok(G.pack_cards.cards.length === 3 + 2, 'Merchant + Tycoon: a Rotarot pack holds 2 more cards', G.pack_cards.cards.length);
  act({ type: 'skip_booster' });
  // Gold: a hidden Spectral that turns up in Colour packs like The Soul and charges like a Colour card
  let gold = 0;
  for (let i = 0; i < 4000 && !gold; i++) { G.GAME.round_resets.ante = i; const c = create_card('Colour', G.pack_cards, null, null, true, true, null, 'mf_colour'); if (c.config.center.key === 'c_mf_new_gold') gold++; c.remove(); }
  ok(gold === 1, 'Gold rolls (rarely) in Colour packs');
}

// ===================================================================== Final Stake: the Superboss ante
{
  run({ seed: 'MF199FINSB', stake: 'stake_mf_final' });
  G.GAME.win_ante = 2;
  act({ type: 'select_blind' }); clearHand(); winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  act({ type: 'select_blind' }); clearHand(); winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  act({ type: 'select_blind' }); clearHand(); winRound(); act({ type: 'cash_out' });
  const rr = G.GAME.round_resets;
  ok(rr.ante === 2 && G.GAME.mf_superboss_active && G.GAME.mf_forced_weird_routed, 'Final Stake: the Ticket is used as the win ante\'s shop opens', [rr.ante, G.GAME.mf_superboss_active]);
  ok(G.GAME.pack_center === 'p_mf_superboss_mega_1' && G.pack_cards.cards.length === 7 && G.GAME.pack_choices === 3, 'a Mega Superboss Pack: 3 of 7', [G.pack_cards.cards.length, G.GAME.pack_choices]);
  ok(/Small Blind/.test(describe(G.pack_cards.cards[0]).lines.join(' ')), 'the token text names the Small Blind first', describe(G.pack_cards.cards[0]).lines);
  const picks = G.pack_cards.cards.slice(0, 3).map((c) => c.config.center.config.blind);
  for (let i = 0; i < 3; i++) act({ type: 'use', id: G.pack_cards.cards[0].sort_id });
  flush();
  ok(G.STATE === STATES.SHOP && rr.blind_choices.Small === picks[0] && rr.blind_choices.Big === picks[1] && rr.blind_choices.Boss === picks[2], 'the three picks fill Small, Big and Boss', rr.blind_choices);
  ok(get_blind_amount(2) === 3333333, 'every blind is 3,333,333 (scaling 6)');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.debuff.superboss && G.GAME.blind.chips === 3333333 * P_BLINDS[picks[0]].mult, 'Small slot: a DX boss', G.GAME.blind.name);
  G.GAME.blind.disabled = false; winRound(); flush();
  ok(!G.GAME.won && rr.ante === 2 && rr.blind_states.Small === 'Defeated' && G.GAME.mf_superboss_active, 'beating it neither wins nor ends the ante; Superboss stays on');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  G.GAME.blind.disabled = false; winRound(); flush();
  ok(!G.GAME.won && rr.blind_states.Big === 'Defeated', 'Big slot: the second DX boss');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  G.GAME.blind.disabled = false; winRound(); flush();
  ok(G.GAME.won && !G.GAME.mf_superboss_active && rr.ante === 3, 'the third (Boss slot) wins the run and ends Superboss', [G.GAME.won, rr.ante]);
}

done();
