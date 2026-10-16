// Þe Autumn Circus jokers, part A (micatro/mods/autumncircus/jokers_a.js): every joker fired through real act()
// plays / discards / round flows with the mod's numbers, every describe() filled, the pools, and the four
// intended-design fixes (Gift from the Void, The C.S.I., Exorcist, Gallows Humor).
//   node micatro/tests/mods/autumncircus_jokers_a_test.mjs
import {
  ok, near, done, flush, start, clearHand, hand, add, play, discard, winRound, nextRound, destroy, msgs, tot, filled,
  G, P_CENTERS, act, STATES, describe, describeCenter, AMM,
} from './autumncircus_helpers.mjs';
import { P_CENTER_POOLS, get_current_pool } from '../../js/engine/core.js';
import { centers } from '../../mods/autumncircus/jokers_a.js';
import { placeholder_jokers, smods_card } from '../../mods/autumncircus/util.js';

const SLUGS = ('standardized nonstandard gift_from_the_void lord_of_the_meek mirage_joker transfusion placeholder_joker filler_card '
  + 'test_print sans null clown_posse stellar_alignment knight_of_heart witch_of_mind lord_of_void highest_number daggerkind bladekind '
  + 'pokerkind combat_capability pseudoscratch astront torrential landlord lost_sock the_csi exorcist gallows_humor common_ground '
  + 'tombstone gem_joker discarded_vessel afterlife_archive jokermancer gaudy_bracelet').split(' ');
const KEYS = SLUGS.map((k) => 'j_thac_' + k);
const WIP = ['daggerkind', 'bladekind', 'pokerkind', 'combat_capability', 'pseudoscratch'].map((k) => 'j_thac_' + k);
const hc = (k = 'S_2') => play(hand([k]));
const bury = (keys, center) => { for (const c of hand(keys, center)) destroy(c); };
const sure = (n) => { G.GAME.probabilities.normal = n; }; // listed probabilities: n in d (d = n makes them certain)

// ------------------------------------------------------------------ off
start('THJAOFF', { mods: [] });
ok(!KEYS.some((k) => P_CENTER_POOLS.Joker.includes(P_CENTERS[k])), 'off: no part-A joker in the pool');

// ------------------------------------------------------------------ registration / describe
start('THJAON');
ok(centers.length === 36 && KEYS.every((k) => centers.some((c) => c.key === k)), '36 jokers in part A', centers.length);
ok(KEYS.every((k) => P_CENTERS[k] && P_CENTER_POOLS.Joker.includes(P_CENTERS[k])), 'on: all registered and in P_CENTER_POOLS.Joker');
ok(P_CENTERS.j_thac_knight_of_heart.rarity === 4 && P_CENTERS.j_thac_knight_of_heart.cost === 20 && P_CENTERS.j_thac_landlord.pos.x === 9
  && P_CENTERS.j_thac_placeholder_joker.eternal_compat === false && P_CENTERS.j_thac_lost_sock.rarity === 1, 'data: rarity / cost / pos / compat');
ok(WIP.every((k) => P_CENTERS[k].yes_pool_flag === 'no'), 'the WIP jokers are hidden by yes_pool_flag');
{
  const [pool] = get_current_pool('Joker', 3, null, 'thja');
  ok(WIP.every((k) => !pool.includes(k)), 'WIP jokers never roll');
  ok(pool.includes('j_thac_standardized') && !pool.includes('j_thac_the_csi') && !pool.includes('j_thac_gem_joker'), 'in_pool / enhancement_gate gate the rest');
}
for (const k of KEYS) {
  const c = add(k);
  ok(filled(describe(c)), 'describe filled: ' + k, describe(c));
  ok(filled(describeCenter(k)), 'describeCenter filled: ' + k, describeCenter(k));
  c.remove();
}
flush();
ok(describe(add('j_thac_knight_of_heart')).lines.length === 7, 'Knight of Heart: both text boxes described');
{
  const ph = placeholder_jokers();
  ok(['standardized', 'nonstandard', 'placeholder_joker', 'filler_card', 'test_print', 'sans', 'null', 'stellar_alignment', 'astront', 'torrential',
    'lost_sock', 'the_csi', 'exorcist', 'gallows_humor', 'gem_joker', 'discarded_vessel', 'gaudy_bracelet'].every((k) => ph.includes('j_thac_' + k))
    && !ph.includes('j_thac_gift_from_the_void') && !ph.includes('j_thac_knight_of_heart'), 'placeholder-art list', ph);
}

// ------------------------------------------------------------------ Standardized / Nonstandard
{
  start('THJA1'); add('j_thac_standardized');
  let r = hc(); ok(r.total.chips === 7 && near(r.total.mult, 1.7) && r.total.total === 11, 'Standardized X1.7 on High Card', tot(r));
  r = play(hand(['S_2', 'H_2', 'C_2', 'D_2', 'S_2'])); ok(r.total.mult === 12, 'Standardized: Five of a Kind is not standard', tot(r));
  start('THJA2'); add('j_thac_nonstandard');
  r = hc(); ok(r.total.mult === 1, 'Nonstandard: nothing on High Card', tot(r));
  r = play(hand(['S_2', 'H_2', 'C_2', 'D_2', 'S_2'])); ok(r.total.chips === 130 && near(r.total.mult, 38.4), 'Nonstandard X3.2 on Five of a Kind', tot(r));
}

// ------------------------------------------------------------------ Gift from the Void
{
  start('THJA3'); const gift = add('j_thac_gift_from_the_void');
  const before = new Set(G.playing_cards);
  const res = winRound(); flush();
  const added = G.playing_cards.filter((c) => !before.has(c) && c.edition && c.edition.negative);
  ok(added.length === 1 && added[0].config.center.key === 'c_base', 'Gift: one Negative base card added', added.length);
  ok(msgs(res.events).includes('Negative!'), 'Gift: "Negative!"', msgs(res.events));
  // FIX (intended design): the Lua emplaced the new card into the deck twice
  ok(added[0] && G.deck.cards.filter((c) => c === added[0]).length === 1, 'FIX Gift: the new card is in the deck exactly once',
    added[0] && G.deck.cards.filter((c) => c === added[0]).length);
  void gift;
}

// ------------------------------------------------------------------ Lord of the Meek / Mirage
{
  start('THJA4'); add('j_joker'); add('j_thac_lord_of_the_meek');
  let r = hc(); ok(r.total.mult === 9 && msgs(r.events).includes('Again!'), 'Lord of the Meek retriggers a Common joker', tot(r));
  start('THJA5'); add('j_blackboard'); add('j_thac_lord_of_the_meek');
  r = hc(); ok(r.total.mult === 3, 'Lord of the Meek ignores an Uncommon', tot(r));
  start('THJA6'); add('j_joker'); add('j_thac_mirage_joker'); sure(4);
  r = hc(); ok(r.total.mult === 9, 'Mirage (sure) retriggers each joker', tot(r));
  sure(0);
  r = hc(); ok(r.total.mult === 5, 'Mirage (never) does nothing', tot(r));
}

// ------------------------------------------------------------------ Transfusion
{
  start('THJA7'); add('j_thac_transfusion');
  let r = hc(); ok(r.total.chips === 5 && near(r.total.mult, 3.5) && r.total.total === 17, 'Transfusion: 40% of 7 Chips -> X1.25 Mult', tot(r));
  ok(msgs(r.events).includes('Converted!'), 'Transfusion "Converted!"');
  // retriggered: the second conversion takes 40% of what the first left (16 -> -6 -> -4)
  start('THJA8'); add('j_thac_transfusion'); add('j_thac_mirage_joker'); sure(4);
  r = hc('S_A'); ok(r.total.chips === 6 && near(r.total.mult, 13.5) && r.total.total === 81, 'Transfusion retrigger compounds (buffer)', tot(r));
}

// ------------------------------------------------------------------ Placeholder Joker
{
  start('THJA9'); const p = add('j_thac_placeholder_joker'); sure(0);
  hc(); ok(p.config.center.key === 'j_thac_placeholder_joker', 'Placeholder (never) stays');
  sure(3); hc();
  ok(placeholder_jokers().includes(p.config.center.key) && p.ability.name === p.config.center.key, 'Placeholder (sure) became a same-art joker', p.config.center.key);
}

// ------------------------------------------------------------------ Filler Card
{
  start('THJA10'); const f = add('j_thac_filler_card');
  let r = play(hand(['S_2', 'H_2'])); ok(near(f.ability.extra.Xchips_curr, 1.1) && near(r.total.chips, 15.4) && r.total.total === 30, 'Filler: +X0.05 per plain card', tot(r));
  const [b] = hand(['S_3'], 'm_bonus'); const [s] = hand(['S_4']); s.set_seal('Red', true); const [e] = hand(['S_5']); e.set_edition({ foil: true }, true, true);
  const [a] = hand(['S_6']); AMM.set_aspect(a, 'thac_breath', true);
  play([b]); play([s]); play([e]); play([a]);
  ok(near(f.ability.extra.Xchips_curr, 1.1), 'Filler: enhanced / sealed / editioned / aspected cards don\'t count', f.ability.extra.Xchips_curr);
}

// ------------------------------------------------------------------ Test Print / sans / null
{
  start('THJA11'); add('j_thac_test_print'); add('j_joker');
  let r = hc(); ok(near(r.total.chips, 12.6) && r.total.mult === 5 && r.total.total === 63, 'Test Print X1.8 Chips for each same-art joker (itself)', tot(r));
  start('THJA12'); add('j_thac_test_print'); add('j_thac_standardized');
  r = hc(); ok(near(r.total.chips, 7 * 1.8 * 1.8), 'Test Print: two same-art jokers', tot(r));
  start('THJA13'); add('j_thac_sans'); add('j_thac_standardized');
  r = hc(); ok(near(r.total.mult, 1.7 * 1.7) && r.total.total === 20, 'sans retriggers a same-art joker', tot(r));
  start('THJA14'); add('j_thac_sans'); add('j_joker');
  r = hc(); ok(r.total.mult === 5, 'sans ignores other jokers', tot(r));
  start('THJA15', { noBlind: true }); const n = add('j_thac_null'); const j = add('j_joker'); const lim = G.jokers.config.card_limit;
  let res = act({ type: 'select_blind' }); flush();
  ok(n.edition && n.edition.negative && !j.edition && msgs(res.events).includes('Negative!'), 'null: the only same-art joker (itself) became Negative');
  ok(G.jokers.config.card_limit === lim + 1, 'null: Negative adds a slot');
  clearHand(); nextRound();
  ok(!j.edition, 'null: nothing left to make Negative');
  start('THJA16', { noBlind: true }); add('j_thac_null'); add('j_thac_standardized');
  act({ type: 'select_blind' }); flush();
  ok(G.jokers.cards.filter((c) => c.edition && c.edition.negative).length === 1, 'null: exactly one of two candidates');
}

// ------------------------------------------------------------------ Clown Posse
{
  start('THJA17'); const cp = add('j_thac_clown_posse');
  ok(cp.ability.extra.Xmult_curr === 1, 'Clown Posse: gaining itself doesn\'t count');
  add('j_joker');
  ok(near(cp.ability.extra.Xmult_curr, 1.1), 'Clown Posse +X0.1 when a joker is gained', cp.ability.extra.Xmult_curr);
  smods_card({ set: 'Tarot', key: 'c_fool', area: G.consumeables }, true); flush();
  hand(['S_9']);
  ok(near(cp.ability.extra.Xmult_curr, 1.1), 'Clown Posse: consumables / playing cards don\'t count');
  const r = play([hand(['S_2'])[0]]); ok(r.total.chips === 7 && near(r.total.mult, 1.1 + 4) && r.total.total === 35, 'Clown Posse X1.1 (before the Joker)', tot(r));
}

// ------------------------------------------------------------------ Stellar Alignment
{
  start('THJA18'); add('j_thac_stellar_alignment');
  let r = play(hand(['H_5'], 'm_thac_star'));
  ok(msgs(r.events).filter((m) => m === 'Again!').length === 1, 'Stellar: a Star card retriggers once at suit level 1', msgs(r.events));
  AMM.level_up_suit(null, 'Hearts', true, 2);
  r = play(hand(['H_5'], 'm_thac_star'));
  ok(msgs(r.events).filter((m) => m === 'Again!').length === 3, 'Stellar: x suit level (3)', msgs(r.events));
  r = play(hand(['H_5'])); ok(!msgs(r.events).includes('Again!'), 'Stellar: plain cards don\'t');
}

// ------------------------------------------------------------------ Knight of Heart
{
  start('THJA19'); const k = add('j_thac_knight_of_heart');
  const cards = hand(['S_2', 'C_3', 'D_4', 'H_5', 'S_6']);
  const r = play(cards);
  const e = k.ability.extra;
  ok(e.curr_chips === 20 && e.curr_mult === 3 && e.curr_money === 0.5 && e.curr_Xmult === 1, 'Knight: Spades +10 Chips, Clubs +3 Mult, Diamonds +$0.5', e);
  ok(cards.every((c) => c.base.suit === 'Hearts'), 'Knight: played cards became Hearts');
  ok(r.total.chips === 70 && r.total.mult === 7 && r.total.total === 490 && msgs(r.events).includes('Hearts'), 'Knight scores its gains the same hand', tot(r));
  e.curr_chips = 10; e.curr_mult = 3; e.curr_Xmult = 2;
  const r2 = hc('H_2'); ok(r2.total.chips === 17 && r2.total.mult === 8 && r2.total.total === 136, 'Knight: chips, mult and Xmult', tot(r2));
  ok(k.calculate_dollar_bonus() === undefined, 'Knight: $0.5 pays nothing yet');
  e.curr_money = 1.5; ok(k.calculate_dollar_bonus() === 1, 'Knight: floor($1.5) at end of round');
  const st = hand(['S_7'], 'm_stone'); play(st); ok(st[0].base.suit === 'Spades' && e.curr_chips === 10, 'Knight: suitless (Stone) cards are left alone');
}

// ------------------------------------------------------------------ Witch of Mind
{
  start('THJA20'); add('j_joker'); add('j_thac_witch_of_mind');
  let r = hc(); ok(r.total.mult === 9 && r.total.total === 63 && msgs(r.events).includes('Again!'), 'Witch: rescore each scoring joker', tot(r));
  start('THJA21'); add('j_joker'); add('j_thac_standardized'); add('j_thac_witch_of_mind');
  r = hc(); ok(near(r.total.mult, ((1 + 4) * 1.7 + 4) * 1.7) && r.total.total === 148, 'Witch: rescored in order', tot(r));
  start('THJA22'); add('j_joker'); add('j_thac_witch_of_mind'); add('j_thac_witch_of_mind');
  r = hc(); ok(r.total.mult === 13, 'Witch: two Witches each rescore once (no loop)', tot(r));
  start('THJA23'); add('j_thac_transfusion'); add('j_thac_witch_of_mind');
  // 7 -> 5 chips, 3.5 mult; rescored: 40% of 5 = 2 -> 3 chips, 6 mult
  r = hc(); ok(r.total.chips === 3 && near(r.total.mult, 6), 'Witch: a rescored joker sees the running score', tot(r));
}

// ------------------------------------------------------------------ Lord of Void
{
  start('THJA24'); const lv = add('j_thac_lord_of_void');
  let r = hc(); ok(r.total.mult === 1, 'Lord of Void: no vouchers, nothing', tot(r));
  G.GAME.used_vouchers.v_grabber = true; G.GAME.used_vouchers.v_wasteful = true;
  ok(describe(lv).lines.at(-1).includes('X1.26') && describe(lv).lines.at(-1).includes('2{C:inactive} retriggers'), 'Lord of Void describes X1.26, 2 retriggers', describe(lv).lines);
  r = hc(); ok(near(r.total.mult, 1.26 ** 3) && r.total.total === 14, 'Lord of Void X1.26, retriggered once per empty consumable slot (2)', tot(r));
  smods_card({ set: 'Tarot', key: 'c_fool', area: G.consumeables }, true); flush();
  r = hc(); ok(near(r.total.mult, 1.26 ** 2), 'Lord of Void: one empty slot', tot(r));
}

// ------------------------------------------------------------------ The Highest Number
{
  start('THJA25'); const h = add('j_thac_highest_number');
  let r = hc('S_9'); flush();
  ok(G.GAME.blind.chips === Math.floor(1e15 * 0.91) && msgs(r.events).includes('Blind -9%'), 'Highest Number: a 9 lowers the Blind 9%', [G.GAME.blind.chips, msgs(r.events)]);
  r = hc('S_8'); flush(); ok(G.GAME.blind.chips === 1e15, 'Highest Number: other ranks don\'t');
  nextRound(); ok(h.ability.extra.reduction === 0.09, 'Highest Number: no level up on a small blind');
  nextRound(); ok(G.GAME.blind.boss, 'boss blind');
  const res = winRound(); flush();
  ok(h.ability.extra.reduction === 0.12 && near(h.ability.extra.level_factor, 0.413 * 0.612) && msgs(res.events).includes('LV Up'), 'Highest Number improves after a Boss', h.ability.extra);
}

// ------------------------------------------------------------------ WIP jokers
{
  start('THJA26'); for (const k of WIP) add(k);
  const r = hc(); ok(r.total.chips === 7 && r.total.mult === 1, 'WIP jokers do nothing', tot(r));
}

// ------------------------------------------------------------------ Astron't / Torrential / Landlord
{
  start('THJA27'); add('j_thac_astront'); sure(4);
  let r = hc('S_2'); ok(G.GAME.amm_data.suit_levels.Spades.level === 2 && msgs(r.events).includes('Level Up!'), 'Astron\'t (sure) levels the first scoring card\'s suit', msgs(r.events));
  play(hand(['S_7'], 'm_stone')); ok(G.GAME.amm_data.suit_levels.Spades.level === 2, 'Astron\'t: suitless first card, nothing');
  sure(0); hc('H_2'); ok(G.GAME.amm_data.suit_levels.Hearts.level === 1, 'Astron\'t (never)');
  start('THJA28'); add('j_thac_torrential');
  let d = discard(hand(['S_T', 'D_2', 'D_4', 'D_6', 'D_8'])); ok(G.GAME.amm_data.suit_levels.Diamonds.level === 1, 'Torrential: no Flush, nothing');
  d = discard(hand(['D_2', 'D_4', 'D_6', 'D_8', 'D_T'])); flush();
  ok(G.GAME.amm_data.suit_levels.Diamonds.level === 2 && msgs(d.events).includes('Level Up!'), 'Torrential: a discarded Flush levels its suit');
  start('THJA29'); add('j_thac_landlord'); const $0 = G.GAME.dollars;
  d = discard(hand(['S_3', 'H_3', 'C_3', 'S_5', 'H_5'])); flush();
  ok(G.GAME.dollars === $0 + 8 && msgs(d.events).includes('$8'), 'Landlord: $8 for a discarded Full House', [G.GAME.dollars - $0, msgs(d.events)]);
  discard(hand(['S_3', 'H_3', 'C_3', 'S_5', 'H_6'])); flush(); ok(G.GAME.dollars === $0 + 8, 'Landlord: not for Three of a Kind');
}

// ------------------------------------------------------------------ Lost Sock / Gaudy Bracelet / Gem Joker
{
  start('THJA30'); const ls = add('j_thac_lost_sock');
  let r = play(hand(['S_2', 'H_2', 'C_9'])); ok(ls.ability.extra.chips_curr === 13 && r.total.chips === 27 && r.total.total === 54, 'Lost Sock: exactly one unscored card -> +13', tot(r));
  r = play(hand(['S_2', 'H_2', 'C_9', 'D_8'])); ok(ls.ability.extra.chips_curr === 13 && r.total.chips === 27, 'Lost Sock: two unscored, no gain', tot(r));
  start('THJA31'); const jw0 = play(hand(['S_A'], 'm_thac_jewel')).total.chips;
  const gb = add('j_thac_gaudy_bracelet');
  r = play(hand(['S_A'], 'm_thac_jewel')); ok(gb.ability.extra.chips_curr === 11 && r.total.chips === jw0 + 11, 'Gaudy Bracelet +11 per scored Jewel card', [jw0, tot(r)]);
  r = hc(); ok(r.total.chips === 7 + 11, 'Gaudy Bracelet keeps its chips', tot(r));
  start('THJA32'); add('j_thac_gem_joker'); hand(['S_A', 'H_K'], 'm_thac_jewel');
  r = play([hand(['S_2'])[0]]); ok(near(r.total.chips, 7 * 1.5 * 1.5) && r.total.total === 15, 'Gem Joker: X1.5 Chips per held Jewel card', tot(r));
}

// ------------------------------------------------------------------ graveyard jokers
{
  start('THJA33'); add('j_thac_the_csi');
  let r = hc(); ok(r.total.chips === 7, 'C.S.I.: empty graveyard');
  bury(['S_K']);
  // FIX (intended design): one face card in the graveyard counts (the Lua needed 2+ graveyard cards)
  r = hc(); ok(r.total.chips === 17, 'FIX C.S.I.: +10 with a single face card in the graveyard', tot(r));
  bury(['H_Q', 'S_4']);
  r = hc(); ok(r.total.chips === 27, 'C.S.I.: +10 per face card', tot(r));
  ok(P_CENTERS.j_thac_the_csi.in_pool(P_CENTERS.j_thac_the_csi), 'C.S.I. in_pool with faces buried');

  start('THJA34', { noBlind: true }); const ex = add('j_thac_exorcist');
  bury(['S_5']);
  act({ type: 'select_blind' }); flush(); clearHand();
  // FIX (intended design): a one-card graveyard is exorcised too (the Lua needed 2+)
  ok(G.graveyard.length === 0 && ex.ability.extra.Xmult_curr === 1.25, 'FIX Exorcist: removes a lone graveyard card', [G.graveyard.length, ex.ability.extra.Xmult_curr]);
  r = hc(); ok(r.total.mult === 1.25, 'Exorcist X1.25', tot(r));
  bury(['S_5', 'S_6', 'S_7']); nextRound();
  ok(G.graveyard.length === 1 && ex.ability.extra.Xmult_curr === 1.75, 'Exorcist: two removed from three, +X0.5', [G.graveyard.length, ex.ability.extra.Xmult_curr]);

  start('THJA35'); add('j_thac_gallows_humor');
  bury(Array(14).fill('S_5'));
  r = hc(); ok(r.total.mult === 1, 'Gallows Humor: 14 cards, nothing', tot(r));
  bury(['S_5']);
  // FIX (intended design): "15 or more" (the Lua tested > 15)
  r = hc(); ok(r.total.mult === 3, 'FIX Gallows Humor: X3 at exactly 15 graveyard cards', tot(r));

  start('THJA36', { noBlind: true }); add('j_thac_common_ground');
  bury(['S_5', 'H_5', 'C_9', 'D_K']);
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length === 8 + 3, 'Common Ground: +1 card per different graveyard rank (3)', G.hand.cards.length);
  discard(G.hand.cards.slice(0, 2)); flush(); ok(G.hand.cards.length === 9, 'Common Ground: only the first hand (no extra draw after a discard)', G.hand.cards.length);

  start('THJA37'); add('j_thac_tombstone');
  bury(['S_5', 'H_6'], 'm_stone'); bury(['C_9']);
  r = hc(); ok(near(r.total.chips, 7 * 1.8) && r.total.total === 12, 'Tombstone X1.8 Chips (2 Stones buried)', tot(r));

  start('THJA38'); const aa = add('j_thac_afterlife_archive');
  ok(aa.calculate_dollar_bonus() === 0, 'Afterlife: $0 with no 4s / 9s');
  bury(['S_4', 'H_9', 'C_9', 'D_K']);
  ok(aa.calculate_dollar_bonus() === 3, 'Afterlife: $1 per buried 4 or 9');
  const $0 = G.GAME.dollars; winRound(); act({ type: 'cash_out' }); flush();
  ok(G.GAME.dollars - $0 >= 3 + 3, 'Afterlife pays at cash out', G.GAME.dollars - $0);

  start('THJA39'); add('j_thac_jokermancer');
  bury(['S_5', 'H_9', 'C_K', 'D_9', 'S_7'], undefined); bury(['H_3'], 'm_stone');
  r = hc('S_9'); ok(r.total.mult === 1 + 4, 'Jokermancer: +1 Mult per buried card sharing a suit or rank (4)', tot(r));
  r = play(hand(['S_A'], 'm_stone')); ok(r.total.mult === 1, 'Jokermancer: rankless + suitless, nothing', tot(r));
}

// ------------------------------------------------------------------ Discarded Vessel
{
  start('THJA40'); add('j_thac_discarded_vessel'); sure(12);
  const cs = hand(['S_2', 'S_3']); AMM.set_aspect(cs[1], 'thac_breath', true);
  discard(cs); flush();
  const keys = AMM.active_aspects().map((a) => a.key);
  ok(keys.includes(cs[0].aspect) && cs[1].aspect === 'thac_breath', 'Discarded Vessel (sure): an unaspected discard gets an Aspect', [cs[0].aspect, cs[1].aspect]);
  sure(0); const [c] = hand(['S_4']); discard([c]); flush(); ok(!c.aspect, 'Discarded Vessel (never)');
}

done();
