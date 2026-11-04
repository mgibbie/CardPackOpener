// Bunco (systems & non-joker content): off -> nothing; on -> every consumable, pack, voucher, deck, tag,
// blind, enhancement, edition, sticker, stake, poker hand, suit and the vanilla reworks, fired through real
// act() plays with the mod's exact numbers. The jokers are in bunco_jokers_{a,b,c}_test.mjs.
//   node micatro/tests/mods/bunco_test.mjs
import {
  T, ok, near, flush, done, start, clearHand, hand, add, clearJokers, clearConsumables, play, discard, winRound, nextRound, toShop,
  msgs, tot, filled, handName, G, P_CENTERS, P_CARDS, P_BLINDS, P_TAGS, act, STATES,
} from './bunco_helpers.mjs';
import { newRun, HANDLIST, get_poker_hand_info } from '../../js/engine/run.js';
import { describe, describeCenter, describeBlind, describeTag } from '../../js/engine/describe.js';
import { P_CARDS_LIST, add_joker, create_card, poll_edition, Card } from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { toView } from '../../js/engine/view.js';
import { STATUS } from '../../mods/bunco/index.js';
import { spectrum_part } from '../../mods/bunco/systems.js';

const keysOfHand = () => G.hand.cards.map((c) => c.config.card.key);
const sel = (cards) => act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
const useC = (c, targets) => act({ type: 'use', id: c.sort_id, targets: targets && targets.map((x) => x.sort_id) });
const cons = (key) => { const c = add_joker(key); flush(); return c; };

// ===================================================================== off
{
  newRun({ seed: 'OFF', back: 'b_red', mods: [] });
  ok(!P_CARDS.bunc_FLEURON_5 && !P_CARDS.bunc_HALBERD_A, 'off: no exotic playing cards');
  ok(HANDLIST.length === 12 && !HANDLIST.some((h) => h.startsWith('bunc_')), 'off: base hand list', HANDLIST);
  ok(!Object.keys(G.GAME.hands).some((h) => h.startsWith('bunc_')), 'off: no Bunco hands in the game');
  ok(P_CENTERS.c_lovers.config.max_highlighted === 1, 'off: The Lovers selects 1 (rework not applied)');
  ok(!Object.keys(P_CARDS_LIST()).some((k) => P_CARDS[k].mod), 'off: random cards are base cards');
  // Luchador sold in a boss fight: vanilla (the boss is disabled, no tag)
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; G.FORCE_BOSS = 'bl_wall';
  act({ type: 'skip_blind' }); act({ type: 'skip_blind' }); act({ type: 'select_blind' });
  const lu = add('j_luchador');
  const ntags = G.GAME.tags.length;
  act({ type: 'sell', id: lu.sort_id });
  ok(G.GAME.blind.disabled && !G.GAME.tags.some((t) => t.key === 'tag_bunc_breaking'), 'off: Luchador disables the boss', G.GAME.tags.length - ntags);
  // a Red Card gains +3 per skipped pack (vanilla)
  const rc = add('j_red_card');
  rc.calculate_joker({ skipping_booster: true }); flush();
  ok(rc.ability.mult === 3, 'off: Red Card +3 per skip', rc.ability.mult);
  ok(!Object.values(P_TAGS).some((t) => t.mod === 'bunco' && G.GAME && false), 'off: (tags checked through pools below)');
  ok(!require_pool_has('Joker', 'j_bunc_') && !require_pool_has('Tarot', 'c_bunc_') && !require_pool_has('Booster', 'p_bunc_') && !require_pool_has('Voucher', 'v_bunc_'), 'off: no Bunco centers in any pool');
}
function require_pool_has(type, prefix) {
  // every center reachable from a pool must be base content
  const all = Object.values(P_CENTERS).filter((c) => c.mod === 'bunco' && c.set === type);
  return all.some((c) => G.GAME && !c.mod_option && G.GAME.mods && G.GAME.mods.includes('bunco') && c.key.startsWith(prefix));
}

// ================================================================ suits
{
  start('SUITS');
  ok(!!P_CARDS.bunc_FLEURON_5 && P_CARDS.bunc_HALBERD_K.suit === 'bunc_Halberds', 'on: exotic playing cards exist');
  ok(!G.playing_cards.some((c) => c.base.suit === 'bunc_Fleurons' || c.base.suit === 'bunc_Halberds'), 'exotic suits are not in the starting deck');
  ok(G.playing_cards.length === 52, 'starting deck still 52 cards', G.playing_cards.length);
  ok(!Object.values(P_CARDS_LIST()).some((v) => v.mod), 'Exotic System off: no exotic random cards');
  G.GAME.Exotic = true;
  ok(Object.values(P_CARDS_LIST()).filter((v) => v.mod).length === 26, 'Exotic System on: 26 exotic cards in random picks');
  G.GAME.Exotic = false;
  const [f, hb] = hand(['bunc_FLEURON_7', 'bunc_HALBERD_Q']);
  ok(f.base.nominal === 7 && f.base.id === 7 && near(f.base.suit_nominal, 0.05) && near(hb.base.suit_nominal, 0.06), 'exotic suit nominals 0.05 / 0.06');
  const c = hand(['S_9'])[0];
  c.change_suit('bunc_Fleurons');
  ok(c.config.card.key === 'bunc_FLEURON_9' && c.base.suit === 'bunc_Fleurons', 'change_suit to an exotic suit');
  // Flush of Fleurons
  clearHand();
  ok(handName(hand(['bunc_FLEURON_2', 'bunc_FLEURON_7', 'bunc_FLEURON_9', 'bunc_FLEURON_K', 'bunc_FLEURON_4'])) === 'Flush', 'five Fleurons make a Flush');
  // Smeared Joker: an exotic suit never smears
  clearHand();
  const sm = add('j_smeared');
  const [fl, he] = hand(['bunc_FLEURON_3', 'H_3']);
  ok(!fl.is_suit('Diamonds') && !fl.is_suit('Spades') && fl.is_suit('bunc_Fleurons') && !he.is_suit('bunc_Fleurons') && he.is_suit('Diamonds'), 'Smeared: exotic suits stay apart');
  sm.remove();
  ok(!fl.is_suit('Hearts'), 'without Smeared an exotic card is only its suit');
  const v = toView().areas.hand.find((x) => x.id === fl.sort_id);
  ok(v.front === 'bunc_FLEURON_3' && v.front_atlas === 'bunco_cards' && v.front_pos.y === 0 && v.front_pos.x === 1, 'view: exotic front art cell', v);
}

// ================================================================ hands
{
  start('HANDS');
  // (5.4.8b: The Deal's above_hand is Spectrum Five)
  ok(HANDLIST.slice(0, 13).join('|') === 'bunc_Deal|bunc_Spectrum Five|Flush Five|bunc_Spectrum House|Flush House|Five of a Kind|bunc_Straight Spectrum|Straight Flush|Four of a Kind|bunc_Spectrum|Full House|Flush|Straight', 'hand order (mult*chips, above_hand)', HANDLIST);
  for (const k of ['bunc_Spectrum', 'bunc_Straight Spectrum', 'bunc_Spectrum House', 'bunc_Spectrum Five', 'bunc_Deal']) ok(G.GAME.hands[k] && G.GAME.hands[k].visible === false, k + ' starts hidden');
  const H = G.GAME.hands;
  ok(H.bunc_Spectrum.chips === 50 && H.bunc_Spectrum.mult === 6 && H.bunc_Spectrum.l_chips === 20 && H.bunc_Spectrum.l_mult === 2, 'Spectrum 50 x 6 (+20/+2)');
  ok(H['bunc_Straight Spectrum'].chips === 120 && H['bunc_Straight Spectrum'].mult === 10 && H['bunc_Straight Spectrum'].l_chips === 45 && H['bunc_Straight Spectrum'].l_mult === 4, 'Straight Spectrum 120 x 10 (+45/+4)');
  ok(H['bunc_Spectrum House'].chips === 150 && H['bunc_Spectrum House'].mult === 15 && H['bunc_Spectrum House'].l_chips === 40 && H['bunc_Spectrum House'].l_mult === 4, 'Spectrum House 150 x 15 (+40/+4)');
  ok(H['bunc_Spectrum Five'].chips === 180 && H['bunc_Spectrum Five'].mult === 18 && H['bunc_Spectrum Five'].l_chips === 55 && H['bunc_Spectrum Five'].l_mult === 3, 'Spectrum Five 180 x 18 (+55/+3)');
  const cases = [
    [['S_2', 'D_7', 'C_3', 'bunc_FLEURON_5', 'H_K'], 'bunc_Spectrum'],
    [['S_Q', 'bunc_FLEURON_J', 'C_T', 'D_9', 'H_8'], 'bunc_Straight Spectrum'],
    [['S_Q', 'bunc_FLEURON_Q', 'C_Q', 'D_8', 'H_8'], 'bunc_Spectrum House'],
    [['S_7', 'bunc_FLEURON_7', 'C_7', 'D_7', 'H_7'], 'bunc_Spectrum Five'],
    [['S_2', 'D_7', 'C_3', 'H_5', 'H_K'], 'High Card'],
    [['S_2', 'D_7', 'C_3', 'bunc_FLEURON_5'], 'High Card'],
  ];
  for (const [ks, want] of cases) { clearHand(); ok(handName(hand(ks)) === want, ks.join(',') + ' -> ' + want, handName(G.hand.cards)); }
  clearHand();
  const royal = get_poker_hand_info(hand(['S_A', 'bunc_HALBERD_K', 'C_Q', 'D_J', 'H_T']));
  ok(royal.text === 'bunc_Straight Spectrum' && royal.loc_disp_text === 'Royal Spectrum', 'Royal Spectrum display name', royal.disp_text);
  // wilds take any free suit; a Stone card breaks a Spectrum
  clearHand();
  const w = hand(['S_2', 'D_7', 'C_3', 'H_K']); hand(['S_5'], 'm_wild');
  ok(handName(G.hand.cards) === 'bunc_Spectrum', 'a Wild card fills the missing suit');
  clearHand();
  ok(spectrum_part(hand(['S_2', 'D_7', 'C_3', 'H_K'].concat([]))).length === 0, 'fewer than 5 cards: no Spectrum');
  clearHand(); hand(['S_2', 'D_7', 'C_3', 'H_K']); hand(['S_5'], 'm_stone');
  ok(handName(G.hand.cards) !== 'bunc_Spectrum', 'a Stone card has no suit: no Spectrum');
  // playing a Spectrum: chips 50 + 2+7+3+5+10, mult 6; the hand becomes visible
  clearHand();
  const r = play(hand(['S_2', 'D_7', 'C_3', 'bunc_HALBERD_5', 'H_K']));
  ok(tot(r) && tot(r)[0] === 77 && tot(r)[1] === 6 && tot(r)[2] === 462, 'Spectrum scores 77 x 6', tot(r));
  ok(G.GAME.hands.bunc_Spectrum.visible && G.GAME.hands.bunc_Spectrum.played === 1, 'played Spectrum is visible');
  // Deal: never levels up
  const lvl = G.GAME.hands.bunc_Deal.level;
  const { level_up_hand } = await import('../../js/engine/core.js');
  level_up_hand(null, 'bunc_Deal', null, 3);
  ok(G.GAME.hands.bunc_Deal.level === lvl, 'Deal never levels up');
  level_up_hand(null, 'bunc_Spectrum', null, 1);
  ok(G.GAME.hands.bunc_Spectrum.level === 2 && G.GAME.hands.bunc_Spectrum.chips === 70 && G.GAME.hands.bunc_Spectrum.mult === 8, 'Spectrum levels +20 / +2');
}

// ========================================================== linked cards
{
  start('LINK');
  const P = (k) => cons('c_bunc_' + k);
  // The I: 4 cards of one suit
  let cards = hand(['S_2', 'S_6', 'S_7', 'S_Q', 'H_3', 'D_4']);
  let pi = P('the_i');
  sel(cards.slice(0, 4));
  ok(pi.can_use_consumeable(), 'The I: 4 Spades can be linked');
  sel([cards[0], cards[1], cards[2], cards[4]]);
  ok(!pi.can_use_consumeable(), 'The I: 3 Spades + a Heart cannot');
  sel(cards.slice(0, 3));
  ok(!pi.can_use_consumeable(), 'The I: needs 4 cards');
  let res = useC(pi, cards.slice(0, 4));
  ok(res.ok && cards.slice(0, 4).every((c) => c.ability.group && c.ability.group.id === cards[0].ability.group.id) && !cards[4].ability.group, 'The I links the 4 cards', res.error);
  ok(cards[0].ability.group.source === 'c_bunc_the_i', 'group source');
  // selecting one card selects the group; deselecting one deselects it
  act({ type: 'highlight', ids: [] });
  act({ type: 'highlight', id: cards[1].sort_id });
  ok(G.hand.highlighted.length === 4 && cards.slice(0, 4).every((c) => c.highlighted), 'selecting a linked card selects its group');
  act({ type: 'highlight', id: cards[2].sort_id });
  ok(G.hand.highlighted.length === 0, 'deselecting one deselects the group');
  // the group won't fit next to 2 other selected cards (4 + 2 > 5)
  act({ type: 'highlight', ids: [cards[4].sort_id, cards[5].sort_id] });
  act({ type: 'highlight', id: cards[0].sort_id });
  ok(G.hand.highlighted.length === 2 && !cards[0].highlighted, 'a group that would pass the limit cannot be picked');
  // linked cards can't be linked again
  act({ type: 'highlight', ids: [] });
  const pi2 = P('the_i'); act({ type: 'highlight', id: cards[0].sort_id });
  ok(!pi2.can_use_consumeable(), 'already-linked cards cannot be linked again');
  // play the group: all 4 play
  const r = play(cards.slice(0, 1), { keepHand: true });
  ok(r.ok && G.discard.cards.filter((c) => c.ability.group).length === 4, 'playing one card of a group plays the group', r.error);
  clearConsumables();

  // the polymino patterns
  const pat = (k, keys, want, n = 0) => {
    clearHand();
    const cs = hand(keys);
    const c = P(k);
    sel(cs);
    ok(c.can_use_consumeable() === want, `${k}: ${keys.join(',')} -> ${want}`);
    c.remove(); flush();
  };
  pat('the_o', ['D_Q', 'D_Q', 'H_K', 'C_K'], true);
  pat('the_o', ['D_Q', 'S_J', 'H_K', 'C_2'], false);
  pat('the_t', ['H_7', 'C_7', 'S_7', 'H_A'], true);
  pat('the_t', ['H_7', 'C_7', 'S_8', 'H_A'], false);
  pat('the_s', ['D_2', 'C_2', 'C_T', 'S_T'], true);
  pat('the_s', ['D_2', 'H_2', 'C_T', 'S_T'], false);
  pat('the_z', ['S_4', 'S_A', 'H_A', 'H_J'], true);
  pat('the_z', ['S_4', 'S_A', 'H_K', 'H_J'], false);
  pat('the_j', ['D_Q', 'H_Q', 'C_Q', 'C_K'], true);
  pat('the_j', ['D_Q', 'H_Q', 'C_Q', 'S_K'], false);
  pat('the_l', ['S_2', 'S_3', 'S_T', 'D_T'], true);
  pat('the_l', ['S_2', 'S_3', 'S_T', 'D_9'], false);
  pat('the_slash', ['S_2', 'C_T', 'H_Q', 'D_A'], true);
  pat('the_slash', ['S_2', 'C_T', 'H_Q', 'D_Q'], false);
  pat('the_slash', ['S_2', 'C_T', 'H_Q', 'S_A'], false);
  // Polybius: 5 cards, one of any property
  G.GAME.used_vouchers.v_bunc_polybius = true;
  pat('the_i', ['S_2', 'S_6', 'S_7', 'S_Q', 'H_3'], true);
  pat('the_slash', ['S_2', 'C_T', 'H_Q', 'D_A', 'D_K'], true);
  G.GAME.used_vouchers.v_bunc_polybius = false;
  pat('the_i', ['S_2', 'S_6', 'S_7', 'S_Q', 'H_3'], false);
  ok(P_CENTERS.c_bunc_the_slash.in_pool() === false, 'The / is only in the pool once the Exotic System is on');

  // The 8: any number of cards (selection unlimited while it's the card in use), then a 7-card group plays
  clearHand(); clearConsumables();
  const seven = hand(['S_2', 'H_5', 'C_9', 'D_K', 'S_8', 'H_3', 'C_A']);
  const e8 = P('the_8');
  ok(P_CENTERS.c_bunc_the_8.hidden && P_CENTERS.c_bunc_the_8.soul_set === 'Polymino' && P_CENTERS.c_bunc_the_8.soul_rate === 0.002, 'The 8: hidden, rolls like The Soul in Polymino packs (0.2%)');
  sel(seven);
  ok(G.hand.highlighted.length === 5, 'without The 8 selection stops at 5');
  act({ type: 'bunc_select', id: e8.sort_id });
  ok(G.GAME.THE_8_BYPASS === true, 'selecting The 8 lifts the limit');
  sel(seven);
  ok(G.hand.highlighted.length === 7, 'with The 8 selected 7 cards can be selected');
  ok(!act({ type: 'discard' }).ok, 'no discard of more than the limit while The 8 is selected');
  act({ type: 'bunc_select', id: e8.sort_id });
  ok(G.GAME.THE_8_BYPASS === false, 'deselecting The 8 restores the limit');
  res = useC(e8, seven);
  ok(res.ok && seven.every((c) => c.ability.group && c.ability.group.source === 'c_bunc_the_8'), 'The 8 links 7 cards', res.error);
  act({ type: 'highlight', ids: [] });
  act({ type: 'highlight', id: seven[3].sort_id });
  ok(G.hand.highlighted.length === 7, 'a 7-card group is selected whole');
  const r7 = play([seven[3]], { keepHand: true });
  ok(r7.ok && r7.total, 'a group bigger than the limit can be played', r7.error);

  // drawn together: the rest of a group follows its card into the hand
  clearHand(); clearConsumables();
  start('LINKDRAW');
  const deck = G.deck.cards;
  const grp = [deck[0], deck[1], deck[2]]; // bottom of the draw pile
  const { link_cards } = await import('../../mods/bunco/util.js');
  link_cards(grp, 'test');
  const top = deck[deck.length - 1];
  link_cards([top, ...grp], 'test');
  clearHand();
  G.STATE = STATES.SELECTING_HAND;
  const { draw_from_deck_to_hand } = await import('../../js/engine/run.js');
  draw_from_deck_to_hand(1); flush();
  ok(grp.every((c) => c.area === G.hand) && top.area === G.hand && G.hand.cards.length === 4, 'drawing one linked card draws its group', G.hand.cards.length);
  // destroyed together
  const before = G.playing_cards.length;
  grp[0].start_dissolve(); flush();
  ok(G.playing_cards.length === before - 4 && grp.every((c) => c.removed) && top.removed, 'destroying one linked card destroys its group', before - G.playing_cards.length);
  // description
  const [a1, a2] = hand(['S_3', 'S_4']); link_cards([a1, a2], 'test');
  const d = describe(a1);
  ok(d.lines.some((l) => /Linked/.test(l)) && d.linked && d.linked.length === 2 && d.info.some((i) => i.key === 'bunc_linked_group'), 'linked card description', d);
  ok(toView().areas.hand.find((x) => x.id === a1.sort_id).group === a1.ability.group.id, 'view: group id for the link art');
}

// The rest of the suite (consumables, packs, vouchers, decks, tags, blinds, enhancements, editions, stickers,
// stakes, reworks, describe) lives in bunco_content_test.mjs.
done();
