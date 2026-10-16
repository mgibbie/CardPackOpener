// Þe Autumn Circus jokers, part B (micatro/mods/autumncircus/jokers_b.js): every joker fired through real act()
// plays / discards / round flows with the mod's exact numbers, every describe() filled, the cross-mod jokers only
// with More Fluff on, the Homestuck extinction + God Tier pool flags, and the intended-design fixes pinned.
//   node micatro/tests/mods/autumncircus_jokers_b_test.mjs
import {
  ok, near, done, start, hand, add, play, discard, winRound, nextRound, toShop, clearHand, destroy, msgs, tot, filled, flush,
  G, P_CENTERS, act, STATES, describe, describeCenter, AMM,
} from './autumncircus_helpers.mjs';
import { P_CENTER_POOLS, get_current_pool, create_card } from '../../js/engine/core.js';
import { JOKERS_B } from '../../mods/autumncircus/jokers_b.js';

void discard; void toShop; void STATES;
const J = (k) => 'j_thac_' + k;
const BOTH = { mods: ['autumncircus', 'morefluff'] };
const XMOD = [J('cartowomancer'), J('rot_cartowomancer'), J(':art:')];
const sure = () => { G.GAME.probabilities.normal = 1000; }; // every "1 in n" hits
const never = () => { G.GAME.probabilities.normal = 0; };
const gy = () => AMM.GRAVEYARD.count_cards();
const bury = (keys, center) => { for (const c of hand(keys, center)) destroy(c); };
const pool = (rarity) => get_current_pool('Joker', rarity)[0].filter((k) => k !== 'UNAVAILABLE' && P_CENTERS[k].rarity === rarity);
const inPool = (k) => (P_CENTER_POOLS.Joker || []).includes(P_CENTERS[k]);
const pet = (c, direction) => act({ type: 'amm_pet', id: c.sort_id, direction, time: 1 });
/** Move a played card (now in the discard) back into the hand. */
const back = (c) => { if (c.area) c.area.remove_card(c); G.hand.emplace(c); return c; };
const PHI = 1.618033988749894;

ok(JOKERS_B.length === 37, '37 jokers in part B', JOKERS_B.length);
ok(!P_CENTERS['j_thac_:currency_exchange:'] || !JOKERS_B.includes('j_thac_:currency_exchange:'), ':currency_exchange: skipped (pta_saka)');

// ------------------------------------------------------------------ presence / cross-mod / describe
start('ACB_POOLS');
{
  const own = JOKERS_B.filter((k) => !XMOD.includes(k));
  ok(own.every(inPool), 'TAC on: every own part-B joker is in the Joker pool', own.filter((k) => !inPool(k)));
  ok(XMOD.every((k) => !inPool(k)), 'More Fluff off: the Cartowomancers and :art: do not exist', XMOD.filter(inPool));
  ok(['j_thac_', J('nekogloop'), J('autumnmood')].every((k) => P_CENTERS[k].rarity === 'hmlt_player') &&
    ['hmlt_knightofheart', 'hmlt_witchofmind', 'hmlt_lordofvoid'].every((k) => P_CENTERS[J(k)].rarity === 'hmlt_godtier'), 'Homestuck rarities: Player / God Tier');
  ok(!P_CENTERS[J('nekogloop')].dependencies, "Homestuck jokers don't need Homelatro");
}
start('ACB_POOLS_OFF', { mods: ['morefluff'] });
ok(JOKERS_B.every((k) => !inPool(k)), 'TAC off: no part-B joker exists');
start('ACB_POOLS_MF', BOTH);
ok(JOKERS_B.every(inPool), 'TAC + More Fluff: every part-B joker exists (cross-mod too)', JOKERS_B.filter((k) => !inPool(k)));
ok(P_CENTERS[J('cartowomancer')].dependencies.includes('morefluff') && P_CENTERS[J(':art:')].dependencies.includes('morefluff'), 'cross-mod jokers depend on morefluff');
{
  let seen = false;
  for (const r of [1, 2, 3]) if (pool(r).includes(J(':art:'))) seen = true;
  ok(!seen, ':art: (yes_pool_flag "never") is never rolled');
  for (const k of JOKERS_B) {
    const c = add(k);
    const d = describe(c);
    ok(filled(d) && d.lines.length > 0, 'describe filled: ' + k, d.lines);
    ok(filled(describeCenter(k)), 'describeCenter filled: ' + k, describeCenter(k).lines);
    c.remove();
    flush();
  }
}

// ------------------------------------------------------------------ Twisted Mind (FIX 1)
start('ACB_TWISTED');
{
  bury(['S_Q'], 'm_steel');
  ok(gy() === 1, 'a Steel card is in the graveyard');
  const base = tot(play(hand(['S_2'])));
  ok(base[1] === 1, 'without Twisted Mind the graveyard Steel does nothing', base);
  const tm = add(J('twisted_mind'));
  let threw = false;
  try { tm.calculate_joker({ joker_main: true, cardarea: G.jokers }); tm.calculate_joker({ setting_blind: true }); } catch (e) { threw = true; }
  ok(!threw, 'FIX 1: Twisted Mind no longer crashes on contexts without other_card');
  const r = play(hand(['S_2']));
  ok(tot(r)[0] === 7 && near(tot(r)[1], 1.5), 'FIX 1: Twisted Mind scores the graveyard Steel as held (X1.5 Mult)', tot(r));
  add(J('twisted_mind'));
  const r2 = play(hand(['S_2']));
  ok(near(tot(r2)[1], 2.25), 'two Twisted Minds score each graveyard card twice', tot(r2));
  for (const t of G.jokers.cards) t.debuff = true;
  ok(tot(play(hand(['S_2'])))[1] === 1, 'debuffed Twisted Minds do nothing');
  for (const t of G.jokers.cards) t.debuff = false;
  ok(describe(tm).info.some((i) => i.key === 'graveyard'), 'Twisted Mind explains the graveyard');
  ok(P_CENTERS[J('twisted_mind')].in_pool(P_CENTERS[J('twisted_mind')]) === true, 'in_pool: with a graveyard card');
}
start('ACB_TWISTED_EMPTY');
ok(P_CENTERS[J('twisted_mind')].in_pool(P_CENTERS[J('twisted_mind')]) === false && P_CENTERS[J('scrapper')].in_pool() === false &&
  P_CENTERS[J('amalgamiter')].in_pool() === false && P_CENTERS[J('joke_book_of_the_dead')].in_pool() === false, 'graveyard jokers stay out of the pool with an empty graveyard');

// ------------------------------------------------------------------ Joke Book of the Dead
start('ACB_JOKEBOOK', { noBlind: true });
{
  bury(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9', 'S_T']);
  const jb = add(J('joke_book_of_the_dead'));
  ok(describe(jb).lines.some((l) => l.includes('+2')), 'Joke Book: "(Currently: +2 Discards)" with 9 graveyard cards', describe(jb).lines);
  const d0 = G.GAME.round_resets.discards;
  const r = act({ type: 'select_blind' });
  ok(G.GAME.current_round.discards_left === d0 + 2 && msgs(r.events).includes('Hee Hee Hee'), 'Joke Book: +1 discard per 4 graveyard cards on blind select', [G.GAME.current_round.discards_left, d0, msgs(r.events)]);
}

// ------------------------------------------------------------------ Gravedigger / Triplicate Soul / Stirring Graves
start('ACB_GRAVE');
{
  add(J('gravedigger'));
  const m0 = G.GAME.dollars;
  bury(['S_K']);
  ok(G.GAME.dollars === m0 + 2, 'Gravedigger: $2 when a card is buried', G.GAME.dollars - m0);
  add(J('triplicate_soul'));
  add(J('stirring_graves'));
  const m1 = G.GAME.dollars, g0 = gy();
  bury(['H_5']);
  ok(gy() === g0 + 3, 'Triplicate Soul: 2 extra copies in the graveyard', gy() - g0);
  ok(G.GAME.dollars === m1 + 2, 'Gravedigger: the Triplicate copies are not "put into" the graveyard (one payout)', G.GAME.dollars - m1);
  const buried = AMM.GRAVEYARD.get_cards().filter((c) => c.base.value === '5');
  ok(buried.length === 3 && buried.every((c) => c.base.suit === 'Hearts' && c.graveyard), 'Triplicate Soul: the copies are the buried card');
  const orig = buried.find((c) => c.ability.perma_repetitions === 1);
  ok(!!orig, 'Stirring Graves: the buried card permanently gains 1 retrigger', buried.map((c) => c.ability.perma_repetitions));
}

// ------------------------------------------------------------------ Matchbook
start('ACB_MATCH');
{
  const mb = add(J('matchbook'));
  const n0 = G.playing_cards.length + 5, g0 = gy();
  const cards = hand(['H_2', 'H_5', 'H_7', 'H_9', 'H_K']);
  const r = play(cards);
  ok(same3(tot(r), [68, 12, 816]), 'Matchbook: X3 Mult (Flush 35+33 chips, 4 X3)', tot(r));
  ok(G.playing_cards.length === n0 - 3 && gy() === g0 + 3, 'Matchbook: the first 3 scored cards are destroyed', [G.playing_cards.length, n0, gy()]);
  ok(cards.slice(0, 3).every((c) => c.removed) && !cards[3].removed, 'Matchbook: the first three in play order');
  ok(mb.ability.extra.targets_curr === 0 && describe(mb).lines.some((l) => /Remaining: .*0/.test(l)), 'Matchbook: 0 remaining', describe(mb).lines);
  const n1 = G.playing_cards.length + 1;
  play(hand(['S_2']));
  ok(G.playing_cards.length === n1, 'Matchbook: nothing more this round');
  nextRound();
  ok(mb.ability.extra.targets_curr === 3, 'Matchbook: resets each round');
}
function same3(a, b) { return a && a.length === 3 && a.every((x, i) => near(x, b[i])); }

// ------------------------------------------------------------------ Dark Hallway
start('ACB_HALL', { noBlind: true });
{
  add(J('dark_hallway'));
  const n0 = G.playing_cards.length, g0 = gy();
  act({ type: 'select_blind' });
  ok(G.playing_cards.length === n0 - 2 && gy() === g0 + 2, 'Dark Hallway: 2 random cards of the full deck destroyed on blind select', [n0, G.playing_cards.length, gy()]);
}

// ------------------------------------------------------------------ unscored jokers
start('ACB_GRASP');
{
  add(J('grasp_of_emptiness'));
  ok(same3(tot(play(hand(['H_K', 'D_K', 'S_2']))), [30, 3, 90]), 'Grasp of Emptiness: an unscored card gives X1.5 Mult');
  ok(same3(tot(play(hand(['H_K', 'D_K']))), [30, 2, 60]), 'Grasp of Emptiness: nothing with every card scoring');
}
start('ACB_SHUTIN');
{
  add(J('shutin'));
  const two = hand(['S_2'])[0];
  const r = play([...hand(['H_K', 'D_K']), two]);
  ok(two.ability.perma_mult === 5 && msgs(r.events).includes('Upgrade!'), 'Shut-In: the unscored card permanently gains +5 Mult', two.ability.perma_mult);
  ok(same3(tot(play([back(two)])), [7, 6, 42]), 'Shut-In: ... which it gives when scored');
}
start('ACB_ACE');
{
  add(J('ace_in_the_hole'));
  const m0 = G.GAME.dollars, n0 = G.playing_cards.length + 3, g0 = gy();
  const ace = hand(['S_A'])[0];
  play([...hand(['H_K', 'D_K']), ace]);
  ok(G.GAME.dollars === m0 + 5 && ace.removed && G.playing_cards.length === n0 - 1 && gy() === g0 + 1, 'Ace in the Hole: an unscored Ace earns $5 and is destroyed', [G.GAME.dollars - m0, ace.removed, gy()]);
  const m1 = G.GAME.dollars, k = hand(['S_K'])[0];
  play([...hand(['H_A', 'D_A']), k]);
  ok(G.GAME.dollars === m1 && !k.removed, 'Ace in the Hole: other unscored ranks do nothing');
}
start('ACB_SNOW');
{
  bury(['S_3', 'S_4', 'S_5', 'H_6']);
  bury(['C_7'], 'm_stone');
  add(J('somber_snowfall'));
  ok(same3(tot(play(hand(['H_K', 'D_K', 'S_2']))), [75, 2, 150]), 'Somber Snowfall: +15 Chips per graveyard Spade for an unscored Spade');
  ok(same3(tot(play([...hand(['H_K', 'D_K']), ...hand(['C_2'], 'm_wild')])), [90, 2, 180]), 'Somber Snowfall: a Wild card shares a suit with every suited graveyard card (not Stone)');
}
start('ACB_JET');
{
  add(J('jet_worldmage'));
  ok(same3(tot(play(hand(['H_K', 'D_K', 'S_2']))), [48, 2, 96]), 'Jet Worldmage: an unscored Spade gives X1.6 Chips');
  ok(same3(tot(play(hand(['H_K', 'D_K', 'H_2']))), [30, 2, 60]), 'Jet Worldmage: not other suits');
}
start('ACB_RUBY');
{
  const rb = add(J('ruby_sunmage'));
  const r = play(hand(['S_K', 'C_K', 'H_2']));
  ok(same3(tot(r), [30, 14, 420]) && rb.ability.extra.mult_curr === 12, 'Ruby Sunmage: an unscored Heart gives it +12 Mult this round', [tot(r), rb.ability.extra.mult_curr]);
  ok(describe(rb).lines.some((l) => l.includes('+12')), 'Ruby Sunmage: (Currently +12)');
  const w = winRound();
  ok(rb.ability.extra.mult_curr === 0 && msgs(w.events).includes('Reset'), 'Ruby Sunmage: resets at end of round', [rb.ability.extra.mult_curr, msgs(w.events)]);
}
start('ACB_RUBY_BP');
{
  add('j_blueprint');
  const rb = add(J('ruby_sunmage'));
  const r = play(hand(['S_K', 'C_K', 'H_2']));
  ok(rb.ability.extra.mult_curr === 12 && same3(tot(r), [30, 26, 780]), 'FIX 3: a Blueprint copy of Ruby Sunmage copies its +Mult without scaling it twice', [rb.ability.extra.mult_curr, tot(r)]);
}
start('ACB_OPAL');
{
  add(J('opal_moonmage'));
  const cards = hand(['H_K', 'D_K', 'C_2']);
  const r = play(cards);
  ok(G.play.cards.length === 0, 'played');
  ok(same3(tot(r), [40, 2, 80]), 'Opal Moonmage: the unscored Club retriggers the card next to it', tot(r));
  ok(same3(tot(play(hand(['H_K', 'D_K', 'H_2']))), [30, 2, 60]), 'Opal Moonmage: not for other suits');
}
start('ACB_OPAL_HELD');
{
  add(J('opal_moonmage'));
  hand(['S_Q'], 'm_steel');
  const played = hand(['C_A', 'H_K', 'D_K']);
  const r = play(played, { keepHand: true });
  ok(same3(tot(r), [40, 3, 120]), 'FIX 2: Opal Moonmage retriggers the played neighbour, not the held Steel card', tot(r));
  clearHand();
}

// ------------------------------------------------------------------ final_scoring_step jokers
start('ACB_UNDERDOG');
{
  add(J('underdogs_secret'));
  const m0 = G.GAME.dollars;
  const r = play(hand(['S_K'], 'm_stone'));
  ok(G.GAME.dollars === m0 + 5 && msgs(r.events).includes('$5'), "Underdog's Secret: Chips >= 20X Mult earns $5", [G.GAME.dollars - m0, tot(r)]);
  const m1 = G.GAME.dollars;
  play(hand(['S_A', 'H_A']));
  ok(G.GAME.dollars === m1, "Underdog's Secret: 32 Chips < 2 Mult x 20: nothing");
}
start('ACB_TOPPLE');
{
  add(J('topple_the_titans'));
  play(hand(['S_K'], 'm_stone'), { keepChips: false });
  ok(G.GAME.blind.chips === 8e14, 'Topple the Titans: 55 Chips >= 50X Mult cuts the blind by 20%', G.GAME.blind.chips);
  play(hand(['S_A', 'H_A']));
  ok(G.GAME.blind.chips === 1e15, 'Topple the Titans: not below the threshold');
}
start('ACB_APOTHEOSIS');
{
  add(J('autoapotheosis'));
  const stones = hand(['S_K', 'H_K', 'D_K', 'C_K'], 'm_stone');
  const r = play(stones);
  const keys = AMM.active_aspects().map((a) => a.key);
  ok(tot(r)[0] === 205 && stones.every((c) => keys.includes(c.aspect)) && msgs(r.events).includes('God Tier!'), 'Autoapotheosis: 205 Chips >= 200X Mult: each scoring card gets a random Aspect', stones.map((c) => c.aspect));
  const ks = hand(['S_K', 'H_K']);
  play(ks);
  ok(ks.every((c) => !c.aspect), 'Autoapotheosis: nothing below the threshold');
}
start('ACB_FINAL_BP');
{
  add('j_blueprint'); add(J('underdogs_secret'));
  const m0 = G.GAME.dollars;
  play(hand(['S_K'], 'm_stone'));
  ok(G.GAME.dollars === m0 + 10, "Blueprint copies Underdog's Secret at final_scoring_step", G.GAME.dollars - m0);
}

// ------------------------------------------------------------------ Amalgamiter / Scrapper
start('ACB_AMALGAMITER', { noBlind: true });
{
  bury(['S_K', 'H_Q', 'D_5']);
  add(J('amalgamiter'));
  const n0 = G.playing_cards.length;
  act({ type: 'select_blind' });
  const big = G.hand.cards.find((c) => c.get_chip_bonus() === 25);
  ok(gy() === 0 && G.playing_cards.length === n0 + 1 && !!big && G.hand.cards.length === 9, 'Amalgamiter: the whole graveyard combined into one card in hand (10+10+5 Chips)', [gy(), G.playing_cards.length - n0, G.hand.cards.length, G.hand.cards.map((c) => c.get_chip_bonus())]);
}
start('ACB_AMALGAMITER_1', { noBlind: true });
{
  bury(['S_K']);
  add(J('amalgamiter'));
  act({ type: 'select_blind' });
  ok(gy() === 1 && G.hand.cards.length === 8, 'Amalgamiter: needs at least 2 graveyard cards');
}
start('ACB_SCRAP', { noBlind: true });
{
  bury(['S_Q'], 'm_steel');
  bury(['H_2']);
  add(J('scrapper'));
  const r = act({ type: 'select_blind' });
  const metal = G.hand.cards.filter((c) => ['m_steel', 'm_gold'].includes(c.config.center.key));
  ok(gy() === 1 && !AMM.GRAVEYARD.get_cards().some((c) => c.config.center.key === 'm_steel') && metal.length === 1 && G.hand.cards.length === 9,
    'Scrapper: a graveyard metal card is removed from the game, a random metal card joins the hand', [gy(), metal.length, G.hand.cards.length]);
  void r;
}
start('ACB_SCRAP_NONE', { noBlind: true });
{
  bury(['H_2']);
  add(J('scrapper'));
  act({ type: 'select_blind' });
  ok(gy() === 1 && G.hand.cards.length === 8, 'Scrapper: no metal card in the graveyard: nothing');
}
start('ACB_SCRAP_MF', { noBlind: true, ...BOTH });
{
  const sc = add(J('scrapper'));
  ok(describe(sc).info.some((i) => i.key === 'm_mf_brass'), 'Scrapper: with More Fluff, Brass Cards are metal too');
}

// ------------------------------------------------------------------ Grave Legion
start('ACB_LEGION');
{
  add(J('grave_legion'));
  sure();
  const n0 = G.playing_cards.length + 1, g0 = gy();
  const k = hand(['S_K'])[0];
  const r = play([k]);
  const copy = AMM.GRAVEYARD.get_cards()[g0];
  ok(gy() === g0 + 1 && G.playing_cards.length === n0 && copy && copy.base.value === 'King' && !k.removed && msgs(r.events).includes('Copied!'), 'Grave Legion: a copy of the scored card goes to the graveyard', [gy(), G.playing_cards.length - n0]);
  never();
  play(hand(['S_K']));
  ok(gy() === g0 + 1, 'Grave Legion: only on its 1 in 4');
}

// ------------------------------------------------------------------ Snecko Eye
function sneckoHand(withSnecko) {
  start('ACB_SNECKO', { noBlind: true });
  if (withSnecko) add(J('snecko_eye')); else G.hand.change_size(2);
  act({ type: 'select_blind' });
  return G.hand.cards.map((c) => ({ id: c.playing_card, suit: c.base.suit, value: c.base.value })).sort((a, b) => a.id - b.id);
}
{
  const plain = sneckoHand(false), sn = sneckoHand(true);
  ok(G.hand.config.card_limit === 10 && sn.length === 10, 'Snecko Eye: +2 hand size', G.hand.config.card_limit);
  ok(plain.map((c) => c.id + c.suit).join() === sn.map((c) => c.id + c.suit).join(), 'Snecko Eye: the same cards are drawn, suits kept');
  const changed = sn.filter((c, i) => c.value !== plain[i].value).length;
  ok(changed >= 5, 'Snecko Eye: drawn cards get a random rank', changed);
  // a later draw too
  play(G.hand.cards.slice(0, 3), { keepHand: true });
  ok(G.hand.cards.length === 10, 'Snecko Eye: redraw after a play');
}

// ------------------------------------------------------------------ Hardlyquin / Golden Ratio / Coven / :joker:
start('ACB_SMALL');
{
  const h = add(J('hardlyquin'));
  sure();
  ok(same3(tot(play(hand(['S_2']))), [7, 16, 112]), 'Hardlyquin: 1 in 3 for +15 Mult');
  never();
  const r = play(hand(['S_2']));
  ok(same3(tot(r), [7, 1, 7]) && msgs(r.events).includes('Nope!'), 'Hardlyquin: Nope!');
  h.remove(); flush();
  G.GAME.probabilities.normal = 1;
  add(J('golden_ratio'));
  const g = tot(play(hand(['S_5', 'H_5'])));
  ok(g[0] === 20 && near(g[1], 2 * PHI * PHI), 'Golden Ratio: each scored 5 gives XPhi Mult', g);
  ok(same3(tot(play(hand(['S_4', 'H_4']))), [18, 2, 36]), 'Golden Ratio: not a 4');
  for (const j of G.jokers.cards.slice()) j.remove();
  flush();
  add(J('coven'));
  ok(same3(tot(play(hand(['S_2', 'H_5', 'D_9']))), [14, 16, 224]), 'Coven: +15 Mult with 3 different ranks played');
  ok(same3(tot(play(hand(['S_K', 'H_K', 'D_9']))), [30, 2, 60]), 'Coven: not with 2 ranks');
  for (const j of G.jokers.cards.slice()) j.remove();
  flush();
  const e = add(J(':joker:'));
  ok(same3(tot(play(hand(['S_2']))), [7, 5, 35]), ':joker: +4 Mult');
  const row = e.ability.thac_emoji_row;
  ok(Number.isInteger(row) && row >= 0 && row <= 3 && P_CENTERS[J(':joker:')].get_pos(P_CENTERS[J(':joker:')], e).y === row, 'Emojiokers: a random background row 0-3 (get_pos)', row);
  ok(P_CENTERS[J(':joker:')].soul_pos.x === 1, 'Emojiokers: the emoji is the soul sprite');
}

// ------------------------------------------------------------------ Whispers of Beyond
start('ACB_WHISPERS');
{
  G.jokers.config.card_limit = 10;
  add(J('whispers_of_beyond'));
  for (let i = 0; i < 4; i++) add('j_jolly');
  ok(same3(tot(play(hand(['S_2']))), [7, 1, 7]), 'Whispers: 5 jokers, nothing');
  add('j_joker');
  const r = play(hand(['S_2']));
  ok(same3(tot(r), [7, 13, 91]), 'Whispers of Beyond: the 6th joker (+4) retriggers twice', tot(r));
}

// ------------------------------------------------------------------ Cartowomancers (More Fluff)
start('ACB_CARTO', BOTH);
{
  const cw = add(J('cartowomancer'));
  const fool = add('c_fool');
  pet(fool, 'clockwise');
  ok(fool.config.center.key === 'c_mf_rot_fool', 'Cartowomancer: petting a Tarot clockwise rotates it', fool.config.center.key);
  pet(fool, 'clockwise');
  ok(fool.config.center.key === 'c_mf_rot_fool', 'Cartowomancer: direction matters (clockwise again: nothing)');
  const r = pet(fool, 'counter-clockwise');
  ok(fool.config.center.key === 'c_fool' && msgs(r.events).includes('owo'), 'Cartowomancer: counter-clockwise turns it back (owo)', msgs(r.events));
  pet(cw, 'clockwise');
  ok(cw.config.center.key === J('rot_cartowomancer'), 'Cartowomancer: petting itself clockwise -> Cartowomancer!');
  const wheel = add('c_wheel_of_fortune');
  pet(wheel, 'clockwise');
  ok(wheel.config.center.key === 'c_mf_rot_wheel', 'Cartowomancer!: rotates Tarots as well', wheel.config.center.key);
  pet(cw, 'counter-clockwise');
  ok(cw.config.center.key === J('cartowomancer'), 'Cartowomancer!: counter-clockwise turns itself back');
  const ht = add('c_heirophant');
  pet(ht, 'clockwise');
  ok(ht.config.center.key === 'c_mf_rot_heirophant', 'Cartowomancer: The Hierophant');
  cw.remove(); flush();
  const f2 = add('c_fool');
  pet(f2, 'clockwise');
  ok(f2.config.center.key === 'c_fool', 'no Cartowomancer: petting does nothing');
}

// ------------------------------------------------------------------ the Homestuck line
start('ACB_NEKO');
{
  const h = hand(['H_A'])[0], s = hand(['S_A'])[0];
  const n = add(J('nekogloop'));
  h.set_debuff(true); s.set_debuff(true);
  ok(!h.debuff && s.debuff, "nekoGloop: Heart cards can't be debuffed");
  n.remove(); flush();
  h.set_debuff(true);
  ok(h.debuff, 'without it they can');
  const kh = add(J('hmlt_knightofheart'));
  h.set_debuff(true);
  ok(!h.debuff, "Knight of Heart: Heart cards can't be debuffed");
  kh.debuff = true;
  h.set_debuff(true);
  ok(h.debuff, 'a debuffed Knight of Heart protects nothing');
  kh.debuff = false;
  clearHand();
}
start('ACB_NEKO_HEAD', { boss: 'bl_head' });
{
  add(J('nekogloop'));
  nextRound(); nextRound();
  ok(G.GAME.blind.name === 'The Head', 'facing The Head', G.GAME.blind.name);
  const [h, s] = hand(['H_A', 'S_A']);
  G.GAME.blind.debuff_card(h); G.GAME.blind.debuff_card(s);
  ok(!h.debuff && s.debuff === false, "nekoGloop vs The Head: Hearts not debuffed", [h.debuff, s.debuff]);
  const r = play([h]);
  ok(tot(r)[0] === 16, 'nekoGloop: the Heart scores under The Head', tot(r));
}
start('ACB_EXTINCT');
{
  ok(pool('hmlt_godtier').length === 0, 'God Tiers: none can appear while every Player lives', pool('hmlt_godtier'));
  ok(pool('hmlt_player').includes(J('nekogloop')), 'nekoGloop is a Player');
  const n = add(J('nekogloop'));
  never();
  const w = winRound();
  ok(G.jokers.cards.includes(n) && msgs(w.events).includes('Safe!'), 'nekoGloop: Safe!', msgs(w.events));
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  sure();
  const w2 = winRound();
  ok(!G.jokers.cards.includes(n) && G.GAME.pool_flags.thac_nekogloop_extinct && msgs(w2.events).includes('Extinct!'), 'nekoGloop: Extinct! (1 in 4.13 at end of round)', msgs(w2.events));
  ok(!pool('hmlt_player').includes(J('nekogloop')), 'an extinct Player never comes back');
  ok(pool('hmlt_godtier').join() === J('hmlt_knightofheart'), 'Knight of Heart can appear once nekoGloop is extinct', pool('hmlt_godtier'));
  G.GAME.pool_flags.thac_autumnmood_extinct = true;
  G.GAME.pool_flags.thac__extinct = true;
  ok(pool('hmlt_godtier').length === 3, 'each God Tier needs its own Player extinct', pool('hmlt_godtier'));
}
start('ACB_EXTINCT_2');
{
  sure();
  const a = add(J('autumnmood')), u = add(J(''));
  winRound();
  ok(!G.jokers.cards.includes(a) && !G.jokers.cards.includes(u) && G.GAME.pool_flags.thac_autumnmood_extinct && G.GAME.pool_flags.thac__extinct, 'autumnMood / the third Player go extinct too');
}
start('ACB_AUTUMNMOOD');
{
  const a = add(J('autumnmood'));
  ok(same3(tot(play(hand(['S_2', 'S_5', 'S_9']))), [14, 4, 56]), 'autumnMood: +3 Mult per area with exactly 3 cards (the play area)');
  ok(describe(a).lines.some((l) => /Currently: .*\+3/.test(l)), 'autumnMood: (Currently ...)', describe(a).lines);
  ok(describeCenter(J('autumnmood')).lines.some((l) => l.includes('N/A')), 'autumnMood: N/A in the collection');
}
start('ACB_AUTUMNMOOD2');
{
  add(J('autumnmood')); add('j_jolly'); add('j_jolly');
  ok(same3(tot(play(hand(['S_2', 'S_5', 'S_9']))), [14, 7, 98]), 'autumnMood: 3 jokers + 3 played = 2 areas: +6 Mult');
}
start('ACB_WITCH');
{
  add(J('hmlt_witchofmind'));
  ok(same3(tot(play(hand(['S_2', 'S_5', 'S_9']))), [14, 4, 56]), 'Witch of Mind: X(1 + 3 per area with exactly 3 cards)');
  bury(['H_2', 'H_3', 'H_4']);
  ok(gy() === 3, 'three graveyard cards');
  // (play 3, the discard holding the last 3 played cards, and the graveyard 3: X10)
  ok(same3(tot(play(hand(['S_2', 'S_5', 'S_9']))), [14, 10, 140]), "Witch of Mind: the discard and AMM's graveyard count as card areas");
}
start('ACB_NEGATIVES');
{
  const u = add(J(''));
  add('j_jolly', 'negative'); add('j_jolly', 'negative');
  hand(['S_3'])[0].set_edition({ negative: true }, true);
  clearHand();
  ok(same3(tot(play(hand(['S_2']))), [7, 10, 70]), 'the third Player: +3 Mult per Negative joker / consumable / playing card');
  ok(describe(u).lines.some((l) => l.includes('+9')), 'the third Player: (Currently +9)', describe(u).lines);
  ok(describe(u).name !== undefined && P_CENTERS['j_thac_'].key === 'j_thac_', 'the unnamed joker: key j_thac_');
  u.remove(); flush();
  add(J('hmlt_lordofvoid'));
  ok(same3(tot(play(hand(['S_2']))), [7, 19, 133]), 'Lord of Void: +6 Mult per Negative');
}
start('ACB_LORD');
{
  const lord = add(J('hmlt_lordofvoid'));
  lord.ability.extra.numer = 666; // its own odds: always
  const lim = G.jokers.config.card_limit;
  const j = add('j_joker');
  ok(j.edition && j.edition.negative && G.jokers.config.card_limit === lim + 1, 'Lord of Void: a gained Joker without an edition becomes Negative (one slot)', [j.edition, G.jokers.config.card_limit - lim]);
  ok(!(lord.edition && lord.edition.negative), 'Lord of Void: not itself');
  const f = add('j_jolly', 'foil');
  ok(f.edition && f.edition.foil, 'Lord of Void: a Joker gained with an edition keeps it');
  const c = add('c_fool');
  ok(!c.edition, 'Lord of Void: consumables are not Jokers');
  lord.ability.extra.numer = 33;
  ok(!describe(lord).lines.some((l) => l.includes('hubris')), 'no hubris at normal odds');
  G.GAME.probabilities.normal = 10;
  ok(describe(lord).lines.some((l) => l.includes('hubris')), 'Lord of Void: "Your hubris exceeds my interest." at 1 in 1');
  lord.ability.extra.numer = 666;
  const j2 = add('j_joker');
  ok(!G.jokers.cards.includes(lord) && !G.jokers.cards.includes(j2), 'Lord of Void: with 1 in 10 guaranteed it shatters itself and the new joker');
}
start('ACB_KNIGHT');
{
  add(J('hmlt_knightofheart'));
  const n0 = G.playing_cards.length + 1, d0 = G.deck.config.card_limit;
  const h = hand(['H_7'])[0];
  const r0 = G.deck.cards.length;
  destroy(h);
  const bottom = G.deck.cards[0];
  ok(G.playing_cards.length === n0 && G.deck.cards.length === r0 + 1 && bottom.base.suit === 'Hearts' && bottom.base.value === '7' && bottom !== h && !bottom.graveyard,
    'Knight of Heart: a buried Heart is copied to the bottom of the deck', [G.playing_cards.length - n0, bottom.base]);
  ok(G.deck.config.card_limit === d0 + 1, 'deck size +1');
  const n1 = G.playing_cards.length + 1;
  destroy(hand(['S_7'])[0]);
  ok(G.playing_cards.length === n1 - 1, 'Knight of Heart: not other suits');
}

// ------------------------------------------------------------------ Amalgam Joker
start('ACB_AMALGAM');
{
  const am = add(J('amalgam_joker'));
  const s0 = am.sell_cost;
  hand(['S_K', 'H_K', 'D_K', 'C_K']);
  const n0 = G.playing_cards.length;
  const two = hand(['S_2'])[0];
  G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: [two.sort_id] });
  const r = act({ type: 'play' });
  ok(msgs(r.events).includes('Value Up!'), 'Amalgam Joker: Value Up!', msgs(r.events));
  ok(am.ability.extra_value === 2 && am.sell_cost === s0 + 2, 'Amalgam Joker: +10% of the combined card\'s Chips (20) as sell value', [am.ability.extra_value, am.sell_cost - s0]);
  ok(G.playing_cards.length === n0, 'Amalgam Joker: 2 held cards became 1', G.playing_cards.length - n0);
  ok(G.playing_cards.some((c) => c.get_chip_bonus() === 20 && c.base.value === 'King'), 'the combined King carries both Kings\' Chips');
}
start('ACB_AMALGAM_FEW');
{
  const am = add(J('amalgam_joker'));
  hand(['S_K', 'H_K']);
  const two = hand(['S_2'])[0];
  G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: [two.sort_id] });
  act({ type: 'play' });
  ok(am.ability.extra_value === 0, 'Amalgam Joker: needs more than 2 held cards');
}

// ------------------------------------------------------------------ :free: / :art:
start('ACB_FREE');
{
  toShop();
  const f = create_card('Joker', G.shop_jokers, null, null, null, null, J(':free:'));
  G.shop_jokers.emplace(f);
  const e = create_card('Joker', G.shop_jokers, null, null, null, null, J(':joker:'));
  G.shop_jokers.emplace(e);
  ok(f.cost === 0 && f.ability.couponed && e.cost > 0, ':free: costs $0 in the shop', [f.cost, e.cost]);
  G.GAME.dollars = 0;
  const r = act({ type: 'buy', id: f.sort_id });
  ok(r.ok !== false && G.jokers.cards.includes(f), ':free: can be bought with $0', r.error);
}

done();
