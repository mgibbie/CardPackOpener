// More Fluff jokers, part B (micatro/mods/morefluff/jokers_b.js): every joker fired through real act()
// plays with the mod's exact numbers, every describe() filled, and the intended-design fixes pinned.
//   node micatro/tests/mods/morefluff_jokers_b_test.mjs
import {
  ok, done, start, hand, add, play, discard, winRound, nextRound, toShop, clearHand, clearJokers, clearConsumables,
  msgs, tot, filled, flush, G, P_CENTERS, P_CARDS, act, STATES,
} from './morefluff_helpers.mjs';
import { P_CENTER_POOLS, create_playing_card } from '../../js/engine/core.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { JOKERS_B } from '../../mods/morefluff/jokers_b.js';

const J = (k) => 'j_mf_' + k;
const sure = () => { G.GAME.probabilities.normal = 1000; }; // every "1 in n" hits
const rows = () => (G.GAME.round_eval ? G.GAME.round_eval.rows : []);
const consumables = (set) => G.consumeables.cards.filter((c) => !set || c.ability.set === set);

ok(JOKERS_B.length === 27, '27 jokers in part B (Lightning Strikes Thrice is gone in 1.9.9999)', JOKERS_B.length);
ok(!P_CENTERS.j_mf_lightningstrikesthrice, 'Lightning Strikes Thrice is not registered');

// ------------------------------------------------------------------ describe(): every #n# filled
start('MFB_DESC');
for (const k of JOKERS_B) {
  const c = add(k);
  const d = describe(c);
  ok(filled(d) && d.lines.length > 0, 'describe filled: ' + k, d.lines);
  ok(filled(describeCenter(k)), 'describeCenter filled: ' + k);
  c.remove();
}
flush();

// ------------------------------------------------------------------ Cue Ball
start('MFB_CUE');
{
  const j = add(J('cueball'));
  sure();
  G.consumeables.config.card_limit = 5;
  const stone = hand(['S_K'], 'm_stone')[0];
  const r = play([stone]);
  ok(msgs(r.events).some((m) => /Rotated Tarot/.test(m)), 'Cue Ball: +1 45 Degree Rotated Tarot Card on a rankless scored card', msgs(r.events));
  if (P_CENTER_POOLS.Rotarot) ok(consumables('Rotarot').length === 1, 'Cue Ball: a Rotarot was created', consumables().map((c) => c.ability.set));
  const r2 = play(hand(['S_K']));
  ok(consumables().length === (P_CENTER_POOLS.Rotarot ? 1 : 0) && !msgs(r2.events).some((m) => /Rotated/.test(m)), 'Cue Ball: ranked cards do nothing');
  j.remove();
}

// ------------------------------------------------------------------ Flint and Steel
start('MFB_FLINT');
{
  add(J('flintandsteel'));
  const k = hand(['S_K'], 'm_steel')[0], st = hand(['H_2'], 'm_stone')[0];
  const r = play([k, st]);
  // High Card -> level 2 (15 chips, 2 mult) before scoring; + K 10 + Stone 50
  ok(G.GAME.hands['High Card'].level === 2 && r.total.chips === 75 && r.total.mult === 2, 'Flint and Steel: Stone + Steel scored levels up the hand', tot(r));
  play(hand(['S_K'], 'm_steel'));
  ok(G.GAME.hands['High Card'].level === 2, 'Flint and Steel: Steel alone does nothing');
}

// ------------------------------------------------------------------ Gemstone Joker
if (P_CENTERS.m_mf_gemstone) {
  start('MFB_GEM');
  const j = add(J('gemstonejoker'));
  G.playing_cards[0].set_ability(P_CENTERS.m_mf_gemstone); G.playing_cards[1].set_ability(P_CENTERS.m_mf_gemstone);
  ok(describe(j).lines.join(' ').includes('$2'), 'Gemstone Joker: describe shows $2 for 2 Gemstone cards', describe(j).lines);
  winRound();
  const row = rows().find((x) => x.center === J('gemstonejoker'));
  ok(row && row.dollars === 2, 'Gemstone Joker: $1 per Gemstone card at end of round', rows());
  ok(P_CENTERS[J('gemstonejoker')].enhancement_gate === 'm_mf_gemstone', 'Gemstone Joker: gated on Gemstone cards');
} else console.log('note: m_mf_gemstone not registered yet — Gemstone Joker payout untested');

// ------------------------------------------------------------------ Globe
start('MFB_GLOBE');
{
  add(J('globe'));
  toShop();
  G.GAME.dollars = 100;
  const r = act({ type: 'reroll_shop' });
  ok(consumables('Planet').length === 1 && msgs(r.events).includes('+1 Planet'), 'Globe: reroll creates a Planet', consumables().map((c) => c.ability.set));
}

// ------------------------------------------------------------------ Golden Carrot
start('MFB_CARROT');
{
  const j = add(J('goldencarrot'));
  const r = play(hand(['S_2']));
  ok(j.ability.extra.gain === 9 && msgs(r.events).includes('-$1'), 'Golden Carrot: -$1 per hand played (SMODS.scale_card "-$1")', [j.ability.extra, msgs(r.events)]);
  winRound();
  const row = rows().find((x) => x.center === J('goldencarrot'));
  ok(row && row.dollars === 8, 'Golden Carrot: pays its value at end of round', rows());
  j.ability.extra.gain = 1;
  nextRound();
  play(hand(['S_2']));
  ok(!G.jokers.cards.includes(j), 'Golden Carrot: eaten at $0');
}

// ------------------------------------------------------------------ Hall of Mirrors
start('MFB_HALL');
{
  const j = add(J('hallofmirrors'));
  const lim = G.hand.config.card_limit;
  play(hand(['S_6', 'H_6']));
  ok(G.hand.config.card_limit === lim + 6 && j.ability.h_size === 6, 'Hall of Mirrors: +3 hand size per scored 6', [G.hand.config.card_limit, lim]);
  winRound();
  ok(G.hand.config.card_limit === lim && j.ability.h_size === 0, 'Hall of Mirrors: resets at end of round', G.hand.config.card_limit);
}

// ------------------------------------------------------------------ Impostor
start('MFB_IMP');
{
  add(J('impostor'));
  const r = play(hand(['H_A', 'S_A']));
  ok(r.total.chips === 32 && r.total.mult === 6, 'Impostor: X3 with exactly one red card', tot(r));
  const r2 = play(hand(['H_A', 'D_A']));
  ok(r2.total.mult === 2, 'Impostor: two red cards -> nothing', tot(r2));
}

// ------------------------------------------------------------------ Joke Merge Valley
start('MFB_MERGE');
{
  add(J('farmmerge'));
  const [a, b, c] = hand(['S_5', 'H_5', 'D_5']);
  b.set_ability(P_CENTERS.m_bonus); a.set_seal('Gold', true); a.ability.perma_bonus = 7;
  const n = G.playing_cards.length;
  const r = discard([a, b, c]);
  ok(msgs(r.events).includes('Merged!'), 'Joke Merge Valley: merged', msgs(r.events));
  ok(c.config.center.key === 'm_bonus' && c.seal === 'Gold' && c.ability.perma_bonus === 17, 'Joke Merge Valley: last card takes the enhancement, seal and perma chips (+5+5 nominal, +7)', [c.config.center.key, c.seal, c.ability.perma_bonus]);
  ok(G.playing_cards.length === n - 2 && !G.playing_cards.includes(a) && !G.playing_cards.includes(b), 'Joke Merge Valley: the other two are destroyed');
  // fix 2: the destroyed cards don't come back as zombies in the discard pile
  ok(!G.discard.cards.includes(a) && !G.discard.cards.includes(b) && !a.area && !b.area, 'fix 2: merged-away cards are gone from every area', G.discard.cards.map((x) => x.sort_id));
  ok(G.discard.cards.includes(c), 'Joke Merge Valley: the merged card is discarded');
  const [d, e] = hand(['S_9', 'H_9']);
  const r2 = discard([d, e]);
  ok(!msgs(r2.events).includes('Merged!'), 'Joke Merge Valley: only exactly 3 cards of one rank');
}

// ------------------------------------------------------------------ Friend Inside Me
start('MFB_FRIEND');
{
  const f = add(J('friendinsideme'));
  const jj = add('j_joker', 'holo');
  act({ type: 'sell', id: jj.sort_id });
  const made = G.jokers.cards.find((c) => c !== f);
  ok(made && made.config.center.rarity === 2 && made.edition && made.edition.holo && !f.ability.active, 'Friend Inside Me: selling a Common makes an Uncommon with its edition', made && [made.config.center.key, made.edition]);
  const jj2 = add('j_joker');
  act({ type: 'sell', id: jj2.sort_id });
  ok(G.jokers.cards.length === 2, 'Friend Inside Me: inactive until a Boss is beaten');
  nextRound(); nextRound(); // small -> big -> boss
  winRound();
  ok(f.ability.active === true, 'Friend Inside Me: re-activates after a Boss Blind');
}

// ------------------------------------------------------------------ Junk Mail
start('MFB_JUNK');
{
  add(J('junkmail'));
  toShop();
  ok(G.shop_vouchers.cards.length === 2, 'Junk Mail: an extra voucher in the shop', G.shop_vouchers.cards.length);
  const extra = G.shop_vouchers.cards[1];
  ok(extra.base_cost === P_CENTERS[extra.config.center.key].cost * 1.5 && extra.cost === Math.floor(extra.base_cost + 0.5), 'Junk Mail: its base cost X1.5', [extra.cost, extra.base_cost]);
  ok(G.shop_vouchers.cards[0].cost === G.shop_vouchers.cards[0].base_cost, 'Junk Mail: the round voucher keeps its price');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  toShop();
  ok(G.shop_vouchers.cards.length === 2, 'Junk Mail: once per shop (re-armed at the end of the round)', G.shop_vouchers.cards.length);
}

// ------------------------------------------------------------------ One Slip Too Late
start('MFB_SLIP');
{
  add(J('onesliptoolate'));
  const r1 = play(hand(['S_A']));
  ok(r1.total.mult === 1, 'One Slip Too Late: first hand, 1 scoring card -> X1', tot(r1));
  const r2 = play(hand(['S_A', 'H_A']));
  ok(r2.total.mult === 4, 'One Slip Too Late: second hand, 2 scoring cards -> X2', tot(r2));
  const r3 = play(hand(['S_K', 'H_K']));
  ok(r3.total.mult === 2, 'One Slip Too Late: third hand needs 3 scoring cards', tot(r3));
}

// ------------------------------------------------------------------ I Sip Toner Soup
start('MFB_TONER');
{
  const j = add(J('tonersoup'));
  play(hand(['S_2']));
  ok(consumables('Tarot').length === 1, 'Toner Soup: a Tarot per hand played');
  winRound();
  ok(!G.jokers.cards.includes(j), 'Toner Soup: drunk at end of round');
}

// ------------------------------------------------------------------ Unpleasant Card
start('MFB_UNPL');
{
  add(J('unpleasantcard'));
  const r = play(hand(['H_A', 'S_A']));
  ok(r.total.total === Math.floor(32 * 2.067 * 2), 'Unpleasant Card: X2.067 Chips (1.9.9999)', tot(r));
  toShop();
  G.GAME.dollars = 100;
  const pack = G.shop_booster.cards[0];
  const rb = act({ type: 'buy', id: pack.sort_id });
  ok(rb.ok && G.pack_cards.cards.length === 1 && G.GAME.pack_choices === 1, 'Unpleasant Card (1.9.9999): an opened pack holds 1 card, choose 1', [rb.ok, G.pack_cards.cards.length, G.GAME.pack_choices]);
}


// ------------------------------------------------------------------ Loaded Disk
start('MFB_DISK');
{
  const j = add(J('loadeddisk'));
  if (P_CENTERS.c_mf_pink && P_CENTERS.c_mf_yellow) {
    act({ type: 'sell', id: j.sort_id });
    ok(consumables().map((c) => c.config.center.key).join() === 'c_mf_pink,c_mf_yellow', 'Loaded Disk: sold -> Pink + Yellow', consumables().map((c) => c.config.center.key));
  } else console.log('note: Colour cards not registered yet — Loaded Disk sale untested');
}

// ------------------------------------------------------------------ Missing Joker
start('MFB_MISS', { noBlind: true });
{
  const j = add(J('missingjoker'));
  act({ type: 'select_blind' }); clearHand();
  ok(j.config.center.key !== J('missingjoker') && j.config.center.set === 'Joker' && j.config.center.perishable_compat && j.config.center.eternal_compat, 'Missing Joker: becomes a random joker for the round', j.config.center.key);
  ok(G.GAME.mf_missingjoker_revert.includes(j.sort_id), 'Missing Joker: revert kept per run (sort id)');
  winRound();
  ok(j.config.center.key === J('missingjoker'), 'Missing Joker: turns back at round evaluation', j.config.center.key);
}

// ------------------------------------------------------------------ Passing Balatro in 5 Minutes
start('MFB_PASS', { noBlind: true });
G.GAME.round_resets.blind_tags = { Small: 'tag_d_six', Big: 'tag_d_six' }; // (1.9.9999+r2: object_weights rolls the tags; a plain one here)
{
  add(J('passando'));
  const r = act({ type: 'skip_blind' });
  ok(msgs(r.events).includes('1/2') && G.jokers.cards.length === 1, 'Passando: 1/2 after one skip', msgs(r.events));
  act({ type: 'skip_blind' });
  const cola = G.jokers.cards.find((c) => c.config.center.key === 'j_diet_cola');
  ok(cola && cola.edition && cola.edition.negative, 'Passando: 2 skips -> a Negative Diet Cola');
}

// ------------------------------------------------------------------ Fast-Growing Sapling (+ fix 1)
start('MFB_SAP');
{
  const s = add(J('sapling'));
  const r = winRound();
  ok(s.ability.extra.c_rounds === 1 && msgs(r.events).includes('1/6'), 'Sapling: counts rounds (1.9.9999: 6)', msgs(r.events));
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  s.ability.extra.c_rounds = 6;
  nextRound(); // -> boss (The Wall)
  ok(G.GAME.blind.boss && G.GAME.round_resets.ante === 1, 'Sapling: at the Boss Blind');
  const ante = G.GAME.round_resets.ante, d0 = G.GAME.dollars;
  const rs = act({ type: 'sell', id: s.sort_id });
  ok(msgs(rs.events).includes('=TREE(3)') && G.STATE === STATES.ROUND_EVAL, 'Sapling: selling it ends the round with the blind beaten', [msgs(rs.events), G.STATE]);
  // fix 1: the boss counts — the ante advances and the blind pays its reward (the Lua defeated the blind early)
  ok(G.GAME.round_resets.ante === ante + 1, 'fix 1: TREE(3) on a Boss Blind advances the ante', G.GAME.round_resets.ante);
  const b = rows().find((x) => x.name === 'blind1');
  ok(b && b.dollars === 5, 'fix 1: the Boss Blind pays its $5', rows());
  ok(G.GAME.mf_tree_three === true, 'tree_three.toml: TREE(3) shown until cash out');
  act({ type: 'cash_out' });
  ok(G.GAME.mf_tree_three === false, 'tree_three.toml: reset at cash out');
  ok(G.GAME.dollars > d0, 'Sapling: sold for money too');
}
start('MFB_SAP2');
{
  const s = add(J('sapling'));
  act({ type: 'sell', id: s.sort_id });
  ok(G.STATE === STATES.SELECTING_HAND, 'Sapling: does nothing before 6 rounds', G.STATE);
}

// ------------------------------------------------------------------ Snake
start('MFB_SNAKE');
{
  add(J('snake'));
  hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9']);
  const before = G.hand.cards.length;
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  act({ type: 'discard' });
  ok(G.hand.cards.length === before - 1 + 3, 'Snake: after a discard, draw exactly 3 (over the hand size)', G.hand.cards.length);
  add(J('snake'));
  const b2 = G.hand.cards.length;
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  act({ type: 'discard' });
  ok(G.hand.cards.length === b2 - 1 + 6, 'Snake (1.9.9999): two Snakes draw 3 + 3', G.hand.cards.length);
}

// ------------------------------------------------------------------ Big Win
start('MFB_SLOT');
{
  add(J('slotmachine'));
  sure();
  const r = play(hand(['S_7']));
  ok(r.total.chips === 5 + 7 * 8, 'Big Win: a scored 7 retriggers 7 times', tot(r));
  const r2 = play(hand(['S_8']));
  ok(r2.total.chips === 13, 'Big Win: only 7s', tot(r2));
}

// ------------------------------------------------------------------ Style Meter
start('MFB_STYLE', { noBlind: true });
G.GAME.round_resets.blind_tags = { Small: 'tag_d_six', Big: 'tag_d_six' }; // (1.9.9999+r2: object_weights rolls the tags; a plain one here)
{
  add(J('stylemeter'));
  act({ type: 'skip_blind' });
  act({ type: 'select_blind' }); clearHand();
  winRound();
  const row = rows().find((x) => x.center === J('stylemeter'));
  ok(row && row.dollars === 3, 'Style Meter: $3 per blind skipped this run', rows());
}

// ------------------------------------------------------------------ Stone Joker Joker
start('MFB_SJJ');
{
  add(J('stonejokerjoker'));
  toShop();
  act({ type: 'next_round' });
  const m = G.jokers.cards.find((c) => c.config.center.key === 'j_marble');
  ok(m && m.edition && m.edition.negative && m.ability.eternal, 'Stone Joker Joker: a Negative Eternal Marble Joker when leaving the shop');
}

// ------------------------------------------------------------------ Sudoku
start('MFB_SUDOKU');
{
  const j = add(J('sudoku'));
  const r1 = play(hand(['S_A', 'H_2', 'S_3', 'D_4', 'C_5']));
  ok(msgs(r1.events).filter((m) => m === 'Noted!').length === 5, 'Sudoku: notes A-5', msgs(r1.events));
  play(hand(['S_5', 'H_6', 'S_7', 'D_8', 'C_9']));
  ok(j.ability.extra.every((v) => v === 1), 'Sudoku: every 1-9 noted', j.ability.extra);
  const r3 = play(hand(['S_K']));
  ok(r3.total.mult === 5, 'Sudoku: X5 once complete', tot(r3));
  nextRound(); nextRound(); winRound();
  ok(j.ability.extra.every((v) => v === 0), 'Sudoku: resets after a Boss Blind');
}

// ------------------------------------------------------------------ Tall Joker
start('MFB_TALL');
{
  add(J('talljoker'));
  const r = play(hand(['S_A']));
  ok(r.total.mult === 45, 'Tall Joker: +44 Mult', tot(r));
}

// ------------------------------------------------------------------ Teacup
start('MFB_TEA');
{
  const j = add(J('teacup'));
  const r = play(hand(['S_A']));
  ok(G.GAME.hands['High Card'].level === 2 && r.total.mult === 2 && j.ability.extra === 4, 'Teacup: levels up the played hand, 4 left', [tot(r), j.ability.extra]);
  j.ability.extra = 1;
  play(hand(['S_A']));
  ok(!G.jokers.cards.includes(j) && G.GAME.hands['High Card'].level === 3, 'Teacup: drunk after its last level up');
}

// ------------------------------------------------------------------ Teal Joker
if (P_CENTERS.m_mf_teal) {
  start('MFB_TEAL');
  const j = add(J('tealjoker'));
  G.playing_cards[0].set_ability(P_CENTERS.m_mf_teal); G.playing_cards[1].set_ability(P_CENTERS.m_mf_teal);
  const r = play(hand(['S_A']));
  ok(Math.abs(r.total.chips - 16 * 1.4) < 1e-9, 'Teal Joker: X0.2 Chips per Teal card (X1.4)', tot(r));
  ok(describe(j).lines.join(' ').includes('1.4'), 'Teal Joker: describe shows X1.4');
} else console.log('note: m_mf_teal not registered yet — Teal Joker untested');

// ------------------------------------------------------------------ the way home
start('MFB_HOME', { noBlind: true });
{
  add(J('thewayhome'));
  sure();
  const h0 = G.GAME.round_resets.hands;
  const r = act({ type: 'select_blind' });
  ok(G.GAME.current_round.hands_left === h0 + 4 && msgs(r.events).includes('Correct!'), 'the way home: +4 hands this round', G.GAME.current_round.hands_left);
}

// ------------------------------------------------------------------ Paint Can (registered; charging in colours)
{
  start('MFB_PAINT');
  const j = add(J('paintcan'));
  ok(describe(j).lines.join(' ').includes('1 in 2'), 'Paint Can: 1 in 2', describe(j).lines);
}

// ------------------------------------------------------------------ off: none of it
start('MFB_OFF', { mods: [] });
ok(!P_CENTER_POOLS.Joker.some((c) => JOKERS_B.includes(c.key)), 'off: no part-B joker in the pool');
{
  const before = G.hand.cards.length;
  hand(['S_2', 'S_3']);
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  act({ type: 'discard' });
  ok(G.hand.cards.length <= 8, 'off: no Snake draw rule', [before, G.hand.cards.length]);
}

done();
