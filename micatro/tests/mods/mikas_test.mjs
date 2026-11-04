// Mika's Mod Collection (micatro/mods/mikas): off -> nothing; on -> every joker, deck and
// consumable fired through real act() plays with exact values, perma-mult, describe() text, and
// one test per intended-design fix (each noted with what the shipped Lua did instead).
//   node micatro/tests/mods/mikas_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, P_CENTER_POOLS, P_JOKER_RARITY_POOLS, add_joker, create_playing_card, create_card, find_joker, ease_dollars } from '../../js/engine/core.js';
import { newRun, act, STATES } from '../../js/engine/run.js';
import { ACTIVE, centerActive } from '../../js/mods/registry.js';
import { describe, describeCenter, describeBack } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/mikas/index.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();

function start(seed = 'MIKA', { back = 'b_red', opts = {}, noBlind = false, mods = ['mikas'] } = {}) {
  newRun({ seed, back, mods, modOptions: { mikas: opts } });
  G.FORCE_BOSS = 'bl_wall';
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  flush();
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
function clearHand() {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  G.hand.highlighted.length = 0;
}
const hand = (keys, center = 'c_base') => keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center] }, G.hand));
const add = (key, edition) => { const c = add_joker(key, edition); flush(); return c; };
const J = (slug, edition) => add('j_mmc_' + slug, edition);
/** Play these cards; the round stays alive (blind 1e15) unless `blind` is given. */
function play(cards, { blind, keepChips } = {}) {
  if (!keepChips) G.GAME.chips = 0;
  G.GAME.blind.chips = blind !== undefined ? blind : 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  const tot = res.events.find((e) => e.type === 'hand_total') || {};
  return { res, tot, events: res.events, msgs: res.events.filter((e) => e.type === 'status' && e.message).map((e) => e.message) };
}
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); };
/** Win the round with this play (chips forced) and land in ROUND_EVAL. */
function winRound(cards, blind = 1) {
  if (!cards) { clearHand(); cards = hand(['S_2']); }
  G.GAME.chips = 1e300;
  G.GAME.blind.chips = blind;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  return act({ type: 'play' });
}
function nextRound() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  act({ type: 'select_blind' });
  clearHand();
}
const key = (c) => c.config.center.key;
const ease = (n) => { ease_dollars(n); flush(); };
const mk = (slug) => 'j_mmc_' + slug;

// ======================================================================== off
{
  start('OFF', { mods: [] });
  ok(ACTIVE.length === 0, 'off: no mods active');
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'mikas'), 'off: no Mika joker in the pools');
  ok(!P_CENTER_POOLS.Tarot.some((c) => c.mod === 'mikas') && !P_CENTER_POOLS.Spectral.some((c) => c.mod === 'mikas'), 'off: no Mika tarot/spectral in the pools');
  ok(!P_JOKER_RARITY_POOLS[4].some((c) => c.mod === 'mikas'), 'off: Dagonet / Cicero not in the Soul pool');
  ok(!centerActive(P_CENTERS.j_mmc_prime_time), 'off: centers inactive');
  newRun({ seed: 'OFF2', back: 'b_mmc_even_steven' });
  ok(G.GAME.selected_back_key === 'b_red' && G.playing_cards.length === 52, 'off: its decks fall back to Red', G.GAME.selected_back_key);
  // hooks are inert: a hand with a perma_mult card describes without the extra line
  const c = create_playing_card({ front: P_CARDS.S_5 }, G.hand); c.ability.perma_mult = 3;
  ok(!describe(c).lines.some((l) => l.includes('extra Mult')), 'off: no extra-Mult line');
}

// ========================================================================= on
{
  start('ON');
  ok(ACTIVE.join() === 'mikas', 'on: mod active');
  ok(STATUS.PORTED.filter((k) => k.startsWith('j_')).length === 60, '60 jokers registered');
  ok(STATUS.PORTED.filter((k) => k.startsWith('b_')).length === 7, '7 decks registered');
  ok(STATUS.PORTED.filter((k) => k.startsWith('c_')).length === 3, '3 consumables registered (2 Tarots + Incense)');
  ok(P_CENTER_POOLS.Joker.filter((c) => c.mod === 'mikas').length === 60, 'on: all 60 jokers pooled');
  ok(P_JOKER_RARITY_POOLS[4].filter((c) => c.mod === 'mikas').length === 2, 'on: Dagonet + Cicero are Legendary (Soul pool)');
  ok(P_CENTER_POOLS.Tarot.filter((c) => c.mod === 'mikas').length === 2 && P_CENTER_POOLS.Spectral.filter((c) => c.mod === 'mikas').length === 1, 'on: tarots + spectral pooled');
  ok(!P_CENTERS.c_mmc_king_of_cups && !P_CENTERS.c_mmc_chips, 'the "In Development, do not enable" tarots are not ported');
  ok(P_CENTERS.j_mmc_prime_time.name === 'MMC Prime Time' && P_CENTERS.j_mmc_dagonet.soul_pos && P_CENTERS.j_mmc_cicero.soul_pos, 'ability names keep the MMC prefix; legendaries have a soul layer');
  // options: every config key is a toggle, default on; off = gone
  newRun({ seed: 'OPT', mods: ['mikas'], modOptions: { mikas: { primeTimeJoker: false, incenseSpectral: false, midasDeck: false } } });
  ok(!P_CENTER_POOLS.Joker.some((c) => c.key === 'j_mmc_prime_time') && P_CENTER_POOLS.Joker.some((c) => c.key === 'j_mmc_sniper'), 'option off: that joker leaves the pool, others stay');
  ok(!P_CENTER_POOLS.Spectral.some((c) => c.key === 'c_mmc_incense'), 'option off: Incense leaves the pool');
  newRun({ seed: 'OPT2', back: 'b_mmc_midas', mods: ['mikas'], modOptions: { mikas: { midasDeck: false } } });
  ok(G.GAME.selected_back_key === 'b_red', 'option off: that deck cannot start a run');
}

// ======================================================================= jokers
// Prime Time: each scored 2/3/5/7/A x1.2
{
  start('PRIME'); J('prime_time');
  const { tot } = play(hand(['S_7']));
  ok(tot.chips === 12 && near(tot.mult, 1.2) && tot.total === 14, 'Prime Time: 7 -> X1.2', tot);
  const r2 = play(hand(['S_7', 'H_7']));
  ok(near(r2.tot.mult, 2 * 1.2 * 1.2), 'Prime Time: pair of 7s -> X1.2 twice', r2.tot);
  const r3 = play(hand(['S_K']));
  ok(r3.tot.mult === 1, 'Prime Time: King -> nothing', r3.tot);
}
// Straight Nate: X4 on a Straight with Odd Todd + Even Steven; +1 joker slot
{
  start('NATE');
  const lim = G.jokers.config.card_limit;
  const nate = J('straight_nate');
  ok(G.jokers.config.card_limit === lim + 1, 'Straight Nate: +1 joker slot');
  let r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(r.tot.mult === 4, 'Straight Nate: no Todd/Steven -> nothing', r.tot);
  add('j_odd_todd'); add('j_even_steven');
  r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  // straight 30x4 + ranks 20 = 50 chips; Todd +31 x2 (3,5) -> 112; Steven +4 x3 (2,4,6) -> mult 16; Nate X4 -> 64
  ok(r.tot.chips === 112 && r.tot.mult === 64, 'Straight Nate: Straight + Todd + Steven -> X4', r.tot);
  nate.sell_card(); flush();
  ok(G.jokers.config.card_limit === lim, 'Straight Nate: slot returned when sold');
}
// The Fisherman: +1 hand size per discard, -1 per hand, resets at round end
{
  start('FISH'); const f = J('fisherman');
  const base = G.hand.config.card_limit;
  discard(hand(['S_2'])); flush();
  discard(hand(['S_3'])); flush();
  ok(G.hand.config.card_limit === base + 2 && f.ability.extra.current_h_size === 2, 'Fisherman: +1 hand size per discard', G.hand.config.card_limit);
  clearHand();
  play(hand(['S_4']));
  ok(G.hand.config.card_limit === base + 1, 'Fisherman: -1 per hand played', G.hand.config.card_limit);
  clearHand(); winRound();
  ok(G.hand.config.card_limit === base && f.ability.extra.current_h_size === 0, 'Fisherman: resets at end of round', G.hand.config.card_limit);
}
// Impatient Joker: +3 Mult per discarded card, resets each round
{
  start('IMPA'); const j = J('impatient');
  discard(hand(['S_2', 'S_3'])); flush(); clearHand();
  const r = play(hand(['S_9']));
  ok(j.ability.extra.current_mult === 6 && r.tot.mult === 7 && r.tot.chips === 14, 'Impatient: 2 discarded -> +6 Mult', r.tot);
  clearHand(); winRound();
  ok(j.ability.extra.current_mult === 0, 'Impatient: resets at end of round');
}
// Cultist: X1 more per hand played this round (the hand that raises it does not use it)
{
  start('CULT'); J('cultist');
  const m = [];
  for (let i = 0; i < 3; i++) { clearHand(); m.push(play(hand(['S_9'])).tot.mult); }
  ok(m.join() === '1,2,3', 'Cultist: X1, X2, X3 on hands 1-3', m);
  clearHand(); winRound();
  nextRound();
  ok(play(hand(['S_9'])).tot.mult === 1, 'Cultist: resets each round');
}
// Seal Collector: +25 Chips per sealed card in the deck
{
  start('SEAL'); const j = J('seal_collector');
  G.playing_cards[0].set_seal('Red', true); G.playing_cards[1].set_seal('Gold', true);
  const r = play(hand(['S_9']));
  ok(r.tot.chips === 5 + 9 + 50 && j.ability.extra.current_chips === 50, 'Seal Collector: 2 seals -> +50 Chips', r.tot);
  ok(describe(j).lines.join(' ').includes('+50'), 'Seal Collector: description shows the live count');
}
// Camper: discarded cards gain +4 Chips permanently
{
  start('CAMP'); J('camper');
  const [c] = hand(['S_9']); discard([c]); flush();
  ok(c.ability.perma_bonus === 4, 'Camper: discarded card +4 perma chips', c.ability.perma_bonus);
}
// Scratch Card: $1/$3/$10/$25/$50 for 1-5 scored 7s (paid once)
{
  start('SCRA'); J('scratch_card');
  let d = G.GAME.dollars;
  play(hand(['S_7', 'H_7'])); flush();
  ok(G.GAME.dollars - d === 3, 'Scratch Card: two 7s -> $3 (once)', G.GAME.dollars - d);
  clearHand(); d = G.GAME.dollars;
  play(hand(['S_7', 'H_7', 'D_7', 'C_7'])); flush();
  ok(G.GAME.dollars - d === 25, 'Scratch Card: four 7s -> $25', G.GAME.dollars - d);
  clearHand(); d = G.GAME.dollars;
  play(hand(['S_8'])); flush();
  ok(G.GAME.dollars === d, 'Scratch Card: no 7 -> nothing (tally reset after each hand)');
}
// Delayed Joker: +20 Mult, +100 Chips, X1.5 on the 4th action
{
  start('DELA'); const j = J('delayed');
  const out = [];
  for (let i = 0; i < 4; i++) { clearHand(); out.push(play(hand(['S_9'])).tot); }
  ok(out[0].mult === 1 && out[2].mult === 1, 'Delayed: charging on actions 1-3');
  ok(out[3].chips === 14 + 100 && near(out[3].mult, 21 * 1.5), 'Delayed: 4th action -> +100 Chips, +20 Mult, X1.5', out[3]);
  ok(j.ability.extra.action_tally === 1, 'Delayed: resets after the bonus');
  clearHand(); discard(hand(['S_2'])); flush();
  ok(j.ability.extra.action_tally === 2, 'Delayed: a discard is an action');
}

// The Show-Off: +X0.25 when a blind is finished with > X2 its chips
{
  start('SHOW'); const j = J('showoff');
  play(hand(['S_9']), { blind: 5 }); // 14 > 2 x 5
  ok(j.ability.extra.current_Xmult === 1.25 && j.ability.extra.total_chips === 0, 'Show-Off: finished with 14 vs blind 5 -> X1.25', j.ability.extra);
  nextRound();
  ok(play(hand(['S_9'])).tot.mult === 1.25, 'Show-Off: applies X1.25');
  clearHand();
  play(hand(['S_9']), { blind: 20, keepChips: true }); // round total 28 < 40
  ok(j.ability.extra.current_Xmult === 1.25, 'Show-Off: not X2 -> no gain');
}
// The Sniper: +X2 when finished within 10% of the exact requirement
{
  start('SNIP'); const j = J('sniper');
  play(hand(['S_9']), { blind: 13 }); // 14 <= 14.3
  ok(j.ability.extra.current_Xmult === 3, 'Sniper: 14 vs 13 -> X3', j.ability.extra.current_Xmult);
  nextRound();
  ok(play(hand(['S_9'])).tot.mult === 3, 'Sniper: applies X3');
  nextRound();
  play(hand(['S_9']), { blind: 10 }); // 14 x3 = 42 > 11
  ok(j.ability.extra.current_Xmult === 3, 'Sniper: overshoot -> no gain', j.ability.extra.current_Xmult);
}
// Blackjack Joker: X3 at exactly 21, X0.5 less per point below (Aces 1 or 11)
{
  start('BJ'); J('blackjack');
  ok(play(hand(['S_A', 'H_K'])).tot.mult === 3, 'Blackjack: A + K = 21 -> X3');
  clearHand();
  ok(play(hand(['S_A', 'H_9'])).tot.mult === 2.5, 'Blackjack: A + 9 = 20 -> X2.5');
  clearHand();
  ok(play(hand(['S_K', 'H_Q', 'D_5'])).tot.mult === 1, 'Blackjack: 25 (bust) -> nothing');
  clearHand();
  ok(play(hand(['S_A', 'H_A', 'D_9'])).tot.mult === 2 * 3, 'Blackjack: A + A + 9 = 21 (11+1+9) -> X3 (on a Pair)');
}
// Batman: +mult_mod per non-lethal hand; mult_mod = 1 + jokers named "...Joker..."
{
  start('BAT'); const j = J('batman');
  ok(play(hand(['S_9'])).tot.mult === 2, 'Batman: starts at +1 Mult');
  clearHand();
  ok(play(hand(['S_9'])).tot.mult === 3, 'Batman: +1 after a non-lethal hand');
  add('j_joker'); clearHand();
  play(hand(['S_9']));
  ok(j.ability.extra.current_mult === 5 && j.ability.extra.mult_mod === 2, 'Batman: "Joker" in a name -> gains +2', j.ability.extra);
  clearHand();
  play(hand(['S_9']), { blind: 5 }); // lethal: no gain
  ok(j.ability.extra.current_mult === 5, 'Batman: lethal hand -> no gain', j.ability.extra.current_mult);
}
// Bomb: +15 Mult, +15 per round, destroyed after 3 rounds
{
  start('BOMB'); const j = J('bomb');
  ok(play(hand(['S_9'])).tot.mult === 16, 'Bomb: +15 Mult');
  clearHand(); winRound();
  ok(j.ability.extra.current_mult === 30 && j.ability.extra._every === 2, 'Bomb: tick -> +30');
  nextRound(); winRound();
  ok(j.ability.extra.current_mult === 45 && G.jokers.cards.includes(j), 'Bomb: tick -> +45');
  nextRound(); winRound(); flush();
  ok(!G.jokers.cards.includes(j), 'Bomb: explodes after the 3rd round');
}
// Eye Chart: +20 Chips per letter in your jokers' names; letter rolls while unowned
{
  start('EYE'); const j = J('eye_chart');
  j.ability.extra.letter = 'O';
  add('j_joker');
  const r = play(hand(['S_9']));
  ok(r.tot.chips === 14 + 20 && r.tot.mult === 5, 'Eye Chart: "Joker" has one O -> +20 Chips', r.tot);
  j.ability.extra.letter = 'E';
  clearHand();
  ok(play(hand(['S_9'])).tot.chips === 14 + 40 + 20, 'Eye Chart: E in "eye chart" (x2) and "joker" -> +60 (MMC prefix stripped)');
  const shop = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_mmc_eye_chart');
  ok(/^[A-Zé]$/.test(shop.ability.extra.letter), 'Eye Chart: a new copy rolls its letter (set_cost)', shop.ability.extra.letter);
}
// Grudgeful Joker: excess chips of last round lower the next blind (cap 25%)
{
  start('GRUD'); const j = J('grudgeful');
  play(hand(['S_9']), { blind: 10 }); // excess 4, cap 2.5 -> ceil 3
  ok(j.ability.extra.current_chips === 3, 'Grudgeful: excess 4, capped at 25% of 10 -> 3', j.ability.extra);
  nextRound();
  play(hand(['S_9']), { blind: 100 });
  ok(G.GAME.blind.chips === 97 && j.ability.extra.current_chips === 0, 'Grudgeful: next blind lowered by 3 (once)', G.GAME.blind.chips);
  clearHand();
  play(hand(['S_9']), { blind: 14, keepChips: true }); // round total 28 vs 14 -> ceil(min(3.5, 14)) = 4
  ok(j.ability.extra.current_chips === 4, 'Grudgeful: round 2 -> 4', j.ability.extra.current_chips);
  nextRound();
  play(hand(['S_9']), { blind: 18 }); // lowered to 14, scores exactly 14
  // fix 3: the Lua never reset total_chips (56 by now -> excess 42 -> 4 again); this round's excess is 0
  ok(G.STATE === STATES.ROUND_EVAL && j.ability.extra.current_chips === 0, 'fix 3 Grudgeful: excess counts this round only', j.ability.extra);
}
// Finishing Blow: blind finished with a High Card -> its (unenhanced) scored cards get a random Enhancement
{
  start('FINI'); J('finishing_blow');
  const [early] = hand(['S_9']);
  play([early]);
  clearHand();
  const [last] = hand(['H_5']);
  play([last], { blind: 5 });
  ok(last.ability.set === 'Enhanced', 'Finishing Blow: finishing High Card card enhanced', last.config.center.key);
  // fix 6: the Lua kept every High Card hand's cards of the round and enhanced them all
  ok(early.config.center.key === 'c_base', 'fix 6 Finishing Blow: an earlier hand of the round stays unenhanced', early.config.center.key);
  start('FINI2'); J('finishing_blow');
  const [p1, p2] = hand(['H_5', 'S_5']);
  play([p1, p2], { blind: 5 });
  ok(p1.config.center.key === 'c_base' && p2.config.center.key === 'c_base', 'Finishing Blow: a Pair finish -> nothing');
}
// Aurora Borealis: a held Blue Seal also makes a Negative Planet
{
  start('AURO'); J('aurora_borealis');
  const [held] = hand(['H_K']); held.set_seal('Blue', true);
  const [p] = hand(['S_2']);
  winRound([p]); flush();
  const planets = G.consumeables.cards.filter((c) => c.ability.set === 'Planet');
  ok(planets.length === 2 && planets.filter((c) => c.edition && c.edition.negative).length === 1 && planets.every((c) => key(c) === 'c_pluto'),
    'Aurora Borealis: Blue Seal -> Pluto + Negative Pluto', planets.map((c) => [key(c), c.edition]));
}
// Historical Joker: same ranks in the same order as last hand -> blind lowered by last hand's score (cap 25%)
{
  start('HIST'); J('historical');
  play(hand(['S_9', 'H_9']), { blind: 1000 }); // pair: (10 + 18) x 2 = 56
  clearHand();
  play(hand(['D_9', 'C_9']), { blind: 1000 });
  ok(G.GAME.blind.chips === 944, 'Historical: repeat 9-9 -> blind 1000 lowered by 56', G.GAME.blind.chips);
  clearHand();
  play(hand(['D_8', 'C_8']), { blind: 1000 });
  ok(G.GAME.blind.chips === 1000, 'Historical: different ranks -> nothing');
  clearHand();
  play(hand(['S_8', 'H_8']), { blind: 200 }); // the last 8-8 scored 52 (cap: 25% of the then-blind 1000)
  ok(G.GAME.blind.chips === 148, 'Historical: lowered by the previous score', G.GAME.blind.chips);
}
// Suit Alley: Diamonds/Clubs +12 Chips, Hearts/Spades +3 Mult
{
  start('SUIT'); J('suit_alley');
  let r = play(hand(['H_2']));
  ok(r.tot.chips === 7 && r.tot.mult === 4, 'Suit Alley: Heart -> +3 Mult', r.tot);
  clearHand(); r = play(hand(['D_2']));
  ok(r.tot.chips === 19 && r.tot.mult === 1, 'Suit Alley: Diamond -> +12 Chips', r.tot);
  clearHand(); r = play(hand(['D_2'], 'm_wild'));
  ok(r.tot.chips === 19 && r.tot.mult === 4, 'Suit Alley: Wild -> both', r.tot);
}
// The Printer: a hand scoring >= the blind duplicates the played cards into the deck
{
  start('PRIN'); J('printer');
  let n = G.playing_cards.length;
  play(hand(['S_9', 'H_9']), { blind: 1000 });
  ok(G.playing_cards.length === n + 2, 'Printer: below the blind -> nothing (the 2 new hand cards only)', G.playing_cards.length - n);
  clearHand(); n = G.playing_cards.length;
  const pair = hand(['S_9', 'H_9']);
  play(pair, { blind: 56 }); flush();
  const copies = G.deck.cards.filter((c) => !pair.includes(c) && (c.config.card.key === 'S_9' || c.config.card.key === 'H_9'));
  ok(G.playing_cards.length === n + 4 && copies.length >= 4, 'Printer: score >= blind -> both cards duplicated into the deck', [G.playing_cards.length - n, copies.length]);
}
// Training Wheels: +X0.1 per 10 scored cards
{
  start('TRAI'); const j = J('training_wheels');
  play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  clearHand();
  const r = play(hand(['H_2', 'H_4', 'H_6', 'H_8', 'H_T']));
  ok(near(j.ability.extra.current_Xmult, 1.1) && near(r.tot.mult, 4 * 1.1), 'Training Wheels: 10 cards -> X1.1', r.tot);
}
// Horseshoe: retrigger Lucky cards
{
  start('HORS'); J('horseshoe');
  G.GAME.probabilities.normal = 1000;
  const r = play(hand(['S_9'], 'm_lucky'));
  ok(r.tot.mult === 1 + 20 + 20, 'Horseshoe: Lucky card scores twice', r.tot);
}
// Incomplete Joker: +100 Chips with 3 or fewer cards
{
  start('INCO'); J('incomplete');
  ok(play(hand(['S_9', 'H_9', 'D_2'])).tot.chips === 128, 'Incomplete: 3 cards -> +100 Chips');
  clearHand();
  ok(play(hand(['S_9', 'H_9', 'D_2', 'C_3'])).tot.chips === 28, 'Incomplete: 4 cards -> nothing');
}
// Abbey Road: X4 once 5 poker hands share a play count (checked after each hand)
{
  start('ABBE'); J('abbey_road');
  for (const h of ['Pair', 'Flush', 'Straight', 'Full House', 'Three of a Kind']) G.GAME.hands[h].played = 1;
  ok(play(hand(['S_9'])).tot.mult === 1, 'Abbey Road: not yet');
  clearHand();
  G.GAME.hands['High Card'].played = 0; // keep High Card at 1 after this hand
  ok(play(hand(['S_9'])).tot.mult === 4, 'Abbey Road: 6 hands played once -> X4');
}
// Fishing License: copies scored Enhanced cards
{
  start('FISL'); J('fishing_license');
  let r = play(hand(['S_9'], 'm_bonus'));
  ok(r.tot.chips === 5 + 9 + 30 + 30, 'Fishing License: Bonus card +30 again', r.tot);
  clearHand(); r = play(hand(['S_9'], 'm_mult'));
  ok(r.tot.mult === 1 + 4 + 4, 'Fishing License: Mult card +4 again', r.tot);
  clearHand(); r = play(hand(['S_9'], 'm_glass'));
  // fix 8: the Lua returned `Xmult` (unread per card) — Glass got nothing extra
  ok(r.tot.mult === 4, 'fix 8 Fishing License: Glass card X2 again', r.tot);
  clearHand(); r = play(hand(['S_9'], 'm_stone'));
  ok(r.tot.chips === 5 + 50 + 50, 'Fishing License: Stone card +50 again', r.tot);
}
// Gold Bar: $2 per Gold card and Gold Seal in the deck at end of round
{
  start('GOLD'); J('gold_bar');
  G.playing_cards[0].set_ability(P_CENTERS.m_gold); G.playing_cards[1].set_seal('Gold', true);
  const d = G.GAME.dollars;
  winRound(); flush();
  ok(G.GAME.dollars - d === 4, 'Gold Bar: 1 Gold card + 1 Gold Seal -> $4', G.GAME.dollars - d);
}
// Rigged Joker: a Lucky card that doesn't trigger -> +1 to all probabilities (once per hand), reset each round
{
  start('RIGG'); const j = J('rigged');
  G.GAME.probabilities.normal = 0; // Lucky cards never trigger
  play(hand(['S_9'], 'm_lucky'));
  ok(G.GAME.probabilities.normal === 1 && j.ability.extra.probability === 1, 'Rigged: Lucky miss -> +1 probability', G.GAME.probabilities);
  clearHand(); play(hand(['S_9', 'H_9'], 'm_lucky'));
  ok(G.GAME.probabilities.normal === 1 || G.GAME.probabilities.normal === 2, 'Rigged: at most once per hand', G.GAME.probabilities.normal);
  const before = j.ability.extra.probability;
  clearHand(); winRound();
  ok(G.GAME.probabilities.normal === 0 && before > 0 && j.ability.extra.probability === 0, 'Rigged: reset at end of round', G.GAME.probabilities.normal);
  nextRound();
  G.GAME.probabilities.normal = 0;
  play(hand(['S_9'], 'm_lucky'));
  j.sell_card(); flush();
  ok(G.GAME.probabilities.normal === 0, 'Rigged: selling it takes its bonus back', G.GAME.probabilities.normal);
}
// The Commander: first hand of a single card -> random Enhancement, Seal and Edition
{
  start('COMM'); J('commander');
  const [c] = hand(['S_9']);
  play([c]); flush();
  ok(c.ability.set === 'Enhanced' && !!c.seal && !!c.edition, 'Commander: single-card first hand gets all three', [key(c), c.seal, c.edition]);
  clearHand();
  const [c2] = hand(['H_9']);
  play([c2]); flush();
  ok(key(c2) === 'c_base' && !c2.seal && !c2.edition, 'Commander: second hand -> nothing');
  nextRound();
  const [c3] = hand(['D_9']); c3.set_seal('Purple', true);
  play([c3]); flush();
  // fix 9: the Lua tested card.ability.seal (always nil) and replaced the Purple seal
  ok(c3.seal === 'Purple' && !!c3.edition && c3.ability.set === 'Enhanced', 'fix 9 Commander: an existing seal is kept', c3.seal);
  nextRound();
  const two = hand(['D_9', 'C_9']);
  play(two); flush();
  ok(two.every((x) => key(x) === 'c_base' && !x.seal), 'Commander: 2 cards -> nothing');
}
// Blue Moon: 3 Lucky triggers in one hand -> a random Negative Joker
{
  start('BLUE'); J('blue_moon');
  G.GAME.probabilities.normal = 1000;
  const r = play(hand(['S_9', 'H_9', 'D_9'], 'm_lucky')); flush();
  const neg = G.jokers.cards.filter((c) => c.edition && c.edition.negative);
  ok(G.jokers.cards.length === 2 && neg.length === 1, 'Blue Moon: 3 Lucky triggers -> Negative Joker', G.jokers.cards.map(key));
  clearHand();
  G.GAME.probabilities.normal = 0;
  const r2 = play(hand(['S_9', 'H_9', 'D_9'], 'm_lucky')); flush();
  ok(G.jokers.cards.length === 2 && r2.msgs.includes('Nope!'), 'Blue Moon: no triggers -> Nope!', r2.msgs);
}
// Dagonet: doubles other jokers' base values; fix 4: its blacklist applies
{
  start('DAGO');
  const jk = add('j_joker');
  const cc = add('j_credit_card');
  const bank = G.GAME.bankrupt_at;
  const dg = J('dagonet');
  const r = play(hand(['S_9']));
  ok(jk.ability.mult === 8 && r.tot.mult === 9, 'Dagonet: Joker +4 -> +8', r.tot);
  // fix 4: the Lua's blacklist was an array indexed by name (never matched): Credit Card's 20 became 40
  ok(cc.ability.extra === 20 && G.GAME.bankrupt_at === bank, 'fix 4 Dagonet: Credit Card (blacklisted) untouched', cc.ability.extra);
  dg.sell_card(); flush();
  ok(jk.ability.mult === 4, 'Dagonet: selling it restores the base values', jk.ability.mult);
  clearHand();
  ok(play(hand(['S_9'])).tot.mult === 5, 'Dagonet: gone -> +4 again');
}
// Glue: Half Joker + Incomplete Joker -> +2 joker slots and X5
{
  start('GLUE');
  const lim = G.jokers.config.card_limit;
  const h1 = add('j_half'); J('incomplete'); const g = J('glue');
  ok(G.jokers.config.card_limit === lim + 2 && g.ability.extra.triggered, 'Glue: +2 joker slots');
  const r = play(hand(['S_9']));
  ok(r.tot.chips === 114 && r.tot.mult === 105, 'Glue: (1 + 20 Half) X5, +100 Incomplete', r.tot);
  // fix 10: the Lua added the 2 slots again for a second Half Joker, and dropped them when either left
  const h2 = add('j_half');
  ok(G.jokers.config.card_limit === lim + 2, 'fix 10 Glue: a second Half Joker adds no slots', G.jokers.config.card_limit - lim);
  h1.sell_card(); flush();
  ok(G.jokers.config.card_limit === lim + 2 && g.ability.extra.half, 'fix 10 Glue: still +2 while one Half remains', G.jokers.config.card_limit - lim);
  h2.sell_card(); flush();
  ok(G.jokers.config.card_limit === lim && !g.ability.extra.half, 'Glue: no Half left -> slots gone', G.jokers.config.card_limit - lim);
}
// Harp Seal: doubles Seals (Gold +$3, Red retrigger, Purple Tarot, Blue Planet)
{
  start('HARP'); J('harp_seal');
  const [g] = hand(['S_9']); g.set_seal('Gold', true);
  const d = G.GAME.dollars;
  play([g]); flush();
  // fix 2: the Lua paid the extra $3 twice (+$9 with the seal's own $3)
  ok(G.GAME.dollars - d === 6, 'fix 2 Harp Seal: Gold Seal pays $3 + $3', G.GAME.dollars - d);
  clearHand();
  const [rd] = hand(['S_9']); rd.set_seal('Red', true);
  ok(play([rd]).tot.chips === 5 + 9 * 3, 'Harp Seal: Red Seal retriggers twice');
  clearHand();
  const [pu] = hand(['S_9']); pu.set_seal('Purple', true);
  discard([pu]); flush();
  ok(G.consumeables.cards.filter((c) => c.ability.set === 'Tarot').length === 2, 'Harp Seal: Purple Seal discard -> 2 Tarots');
  start('HARP2'); J('harp_seal');
  const [bl] = hand(['H_K']); bl.set_seal('Blue', true);
  winRound([hand(['S_2'])[0]]); flush();
  ok(G.consumeables.cards.filter((c) => c.ability.set === 'Planet').length === 2, 'Harp Seal: held Blue Seal -> 2 Planets');
}
// Football Card: Common jokers each give +50 Chips
{
  start('FOOT'); J('football_card'); add('j_joker');
  const r = play(hand(['S_9']));
  ok(r.tot.chips === 64 && r.tot.mult === 5, 'Football Card: Joker (Common) -> +50 Chips', r.tot);
}
// Special Edition Joker: +2 Mult / Seal, +10 Chips / Enhancement, X0.1 / Edition in the deck
{
  start('SPEC'); J('special_edition');
  G.playing_cards[0].set_seal('Red', true); G.playing_cards[1].set_ability(P_CENTERS.m_bonus); G.playing_cards[2].set_edition({ foil: true }, true, true);
  const r = play(hand(['S_9']));
  ok(r.tot.chips === 24 && near(r.tot.mult, 3 * 1.1), 'Special Edition: +10 Chips, +2 Mult, X1.1', r.tot);
}
// The Stockpiler: +1 hand size per 4 cards above 52 (capped at the Ante)
{
  start('STOC'); const j = J('stockpiler');
  const base = G.hand.config.card_limit;
  for (let i = 0; i < 8; i++) create_playing_card({ front: P_CARDS.S_2 }, G.deck);
  play(hand(['S_9'])); // 61 cards: floor(9/4) = 2, capped at Ante 1
  ok(G.hand.config.card_limit === base + 1 && j.ability.extra.current_h_size === 1, 'Stockpiler: +1 (Ante cap)', G.hand.config.card_limit - base);
  j.sell_card(); flush();
  ok(G.hand.config.card_limit === base, 'Stockpiler: sold -> hand size back');
}
// Student Loans: debt to -$100, -1 discard per -$25 (from the first -$1)
{
  start('LOAN'); const j = J('student_loans');
  ok(G.GAME.bankrupt_at === -100, 'Student Loans: can go to -$100', G.GAME.bankrupt_at);
  const rd = G.GAME.round_resets.discards;
  ease(-G.GAME.dollars - 1);
  ok(G.GAME.round_resets.discards === rd - 1 && j.ability.extra.discards === -1, 'Student Loans: -$1 -> -1 discard', G.GAME.round_resets.discards);
  ease(-75); // -$76 -> floor(-76/25) = -4
  ok(G.GAME.round_resets.discards === rd - 4, 'Student Loans: -$76 -> -4 discards', G.GAME.round_resets.discards);
  ease(-G.GAME.dollars + 5);
  // fix 5: the Lua gave back only 1 of the 4 (ease_discard(1))
  ok(G.GAME.round_resets.discards === rd && j.ability.extra.discards === 0, 'fix 5 Student Loans: back in the black -> all discards back', G.GAME.round_resets.discards);
  j.sell_card(); flush();
  ok(G.GAME.bankrupt_at === 0, 'Student Loans: sold -> no debt allowed');
}
// Broke Joker (+1 Mult per -$2) / Go For Broke (+4 Chips per -$1) / Street Fighter (X4 at -$20)
{
  start('BROK'); J('broke'); J('go_for_broke'); J('street_fighter');
  ease(-G.GAME.dollars - 4);
  let r = play(hand(['S_9']));
  ok(r.tot.chips === 14 + 16 && r.tot.mult === 3, 'Broke / Go For Broke: -$4 -> +2 Mult, +16 Chips', r.tot);
  ease(-16); clearHand();
  r = play(hand(['S_9']));
  ok(r.tot.chips === 14 + 80 && r.tot.mult === (1 + 10) * 4, 'Street Fighter: -$20 -> X4 (with +10 Mult, +80 Chips)', r.tot);
  ease(-G.GAME.dollars + 3); clearHand();
  r = play(hand(['S_9']));
  ok(r.tot.chips === 14 && r.tot.mult === 1, 'Broke / Go For Broke: back in the black -> nothing', r.tot);
}
// Checklist: playing its hand levels it up; the hand changes at end of round
{
  start('CHEK'); const j = J('checklist');
  ok(typeof j.ability.extra.poker_hand === 'string' && G.GAME.hands[j.ability.extra.poker_hand].visible, 'Checklist: picks a visible hand', j.ability.extra.poker_hand);
  j.ability.extra.poker_hand = 'Pair';
  const r = play(hand(['S_9', 'H_9']));
  ok(G.GAME.hands.Pair.level === 2 && r.tot.chips === 25 + 18 && r.tot.mult === 3, 'Checklist: Pair played -> levelled first', r.tot);
  clearHand(); winRound();
  ok(j.ability.extra.poker_hand !== 'Pair', 'Checklist: new hand at end of round', j.ability.extra.poker_hand);
}
// One Of Us: 5 Enhanced cards played -> a random Joker gets an Edition
{
  start('ONEU'); J('one_of_us'); const jk = add('j_joker');
  play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T'], 'm_bonus')); flush();
  ok(!!jk.edition || !!G.jokers.cards[0].edition, 'One Of Us: 5 Enhanced -> an Edition', G.jokers.cards.map((c) => c.edition));
}
// The Investor: $5 at end of round, 1 in 4: -$5
{
  start('INVE'); J('investor');
  G.GAME.probabilities.normal = 0;
  let d = G.GAME.dollars; winRound(); flush();
  ok(G.GAME.dollars - d === 5, 'Investor: +$5', G.GAME.dollars - d);
  nextRound();
  G.GAME.probabilities.normal = 1000;
  d = G.GAME.dollars; winRound(); flush();
  ok(G.GAME.dollars - d === -5, 'Investor: the bad roll -> -$5', G.GAME.dollars - d);
}
// Mountain Climber: scored cards gain +1 Mult permanently (perma_mult)
{
  start('MOUN'); J('mountain_climber');
  const [c] = hand(['S_9']);
  ok(play([c]).tot.mult === 1 && c.ability.perma_mult === 1, 'Mountain Climber: +1 perma Mult after scoring');
  G.discard.remove_card(c); G.hand.emplace(c);
  ok(play([c]).tot.mult === 2 && c.ability.perma_mult === 2, 'Mountain Climber: the card now scores +1 Mult');
  ok(describe(c).lines.some((l) => l === '{C:mult}+2{} extra Mult'), 'perma-mult: "+2 extra Mult" line (lovely patch)', describe(c).lines);
  const m = create_playing_card({ front: P_CARDS.S_5, center: P_CENTERS.m_mult }, G.hand); m.ability.perma_mult = 2;
  ok(describe(m).lines.some((l) => l.includes('+6')), 'perma-mult: a Mult Card shows its total (+6)', describe(m).lines);
}
// fix 11: perma-mult respects debuffs and the Lucky roll (the Lua override skipped both)
{
  start('PERM');
  const [d] = hand(['S_9']); d.ability.perma_mult = 5; d.debuff = true;
  ok(d.get_chip_mult() === 0, 'fix 11 perma-mult: a debuffed card scores no Mult');
  const [l] = hand(['S_9'], 'm_lucky'); l.ability.perma_mult = 3;
  G.GAME.probabilities.normal = 0;
  ok(l.get_chip_mult() === 3, 'fix 11 perma-mult: a Lucky card that misses still gets its perma Mult only (the Lua: always +20)');
  ok(describe(l).lines.some((x) => x === '{C:mult}+3{} extra Mult'), 'perma-mult: Lucky card shows "+3 extra Mult"');
}
// Shackles: +1 hand, +1 discard, +1 hand size; destroyed by a hand of more than 4 cards
{
  start('SHAC');
  const h = G.GAME.round_resets.hands, dsc = G.GAME.round_resets.discards, hs = G.hand.config.card_limit, hl = G.GAME.current_round.hands_left;
  const j = J('shackles');
  ok(G.GAME.round_resets.hands === h + 1 && G.GAME.round_resets.discards === dsc + 1 && G.hand.config.card_limit === hs + 1 && G.GAME.current_round.hands_left === hl + 1,
    'Shackles: +1 hand, +1 discard, +1 hand size');
  play(hand(['S_2', 'S_4', 'S_6', 'S_8']));
  ok(G.jokers.cards.includes(j), 'Shackles: 4 cards -> fine');
  clearHand(); play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T'])); flush();
  ok(!G.jokers.cards.includes(j) && G.GAME.round_resets.hands === h && G.hand.config.card_limit === hs, 'Shackles: 5 cards -> destroyed, bonuses gone');
}
// Buy One Get One: 1 in 4 to get an extra card of what you buy
{
  start('BOGO'); J('buy_one_get_one');
  winRound(); act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP, 'BOGO: in the shop');
  G.GAME.dollars = 100; G.GAME.probabilities.normal = 1000;
  const jk = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker'); G.shop_jokers.emplace(jk);
  act({ type: 'buy', id: jk.sort_id }); flush();
  ok(G.jokers.cards.length === 3, 'BOGO: bought a Joker -> an extra Joker', G.jokers.cards.map(key));
  const t = create_card('Tarot', G.shop_jokers, null, null, null, null, 'c_fool'); G.shop_jokers.emplace(t);
  act({ type: 'buy', id: t.sort_id }); flush();
  ok(G.consumeables.cards.length === 2, 'BOGO: bought a Tarot -> an extra Tarot', G.consumeables.cards.map(key));
  const n = G.playing_cards.length;
  const pc = create_card('Base', G.shop_jokers, null, null, null, null, null, 'x'); G.shop_jokers.emplace(pc);
  act({ type: 'buy', id: pc.sort_id }); flush();
  ok(G.playing_cards.length === n + 2, 'BOGO: bought a playing card -> an extra one', G.playing_cards.length - n);
  G.GAME.probabilities.normal = 0;
  const jk2 = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker'); G.shop_jokers.emplace(jk2);
  const r = act({ type: 'buy', id: jk2.sort_id }); flush();
  ok(r.events.some((e) => e.type === 'status' && e.message === 'Nope!'), 'BOGO: the miss says Nope!');
}
// Pack A Punch: blind selected -> -$20, leftmost joker gets a random Edition
{
  start('PUNC', { noBlind: true });
  const jk = add('j_joker'); J('pack_a_punch');
  const d = G.GAME.dollars;
  act({ type: 'select_blind' }); flush();
  ok(G.GAME.dollars - d === -20 && !!jk.edition, 'Pack A Punch: -$20, leftmost joker gets an Edition', [G.GAME.dollars - d, jk.edition]);
}
// Seal Steal: scored Purple / Blue seals trigger
{
  start('STEA'); J('seal_steal');
  const [p] = hand(['S_9']); p.set_seal('Purple', true);
  play([p]); flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Tarot', 'Seal Steal: scored Purple Seal -> Tarot');
  clearHand();
  const [b] = hand(['S_9']); b.set_seal('Blue', true);
  play([b]); flush();
  ok(G.consumeables.cards.length === 2 && key(G.consumeables.cards[1]) === 'c_pluto', 'Seal Steal: scored Blue Seal -> Planet of the hand', G.consumeables.cards.map(key));
}
// Tax Collector: $1 / $2 / $4 per Uncommon / Rare / Legendary joker at end of round
{
  start('TAXC'); J('tax_collector'); J('impatient'); J('cultist'); J('cicero');
  const d = G.GAME.dollars; winRound(); flush();
  ok(G.GAME.dollars - d === 1 + 2 + 4, 'Tax Collector: Uncommon + Rare + Legendary -> $7', G.GAME.dollars - d);
}
// Glass Cannon: Glass cards retrigger, then always break
{
  start('GLAS'); J('glass_cannon');
  const [g] = hand(['S_9'], 'm_glass');
  const r = play([g]); flush();
  ok(r.tot.mult === 4 && r.tot.chips === 5 + 18, 'Glass Cannon: Glass retriggered (X2 X2)', r.tot);
  ok(!G.playing_cards.includes(g), 'Glass Cannon: the Glass card broke');
}
// Scoring Test: a hand scoring under 1% of the blind is destroyed; fix 7: debuffed hands too
{
  start('SCOR'); J('scoring_test');
  const [a] = hand(['S_9']);
  play([a], { blind: 100 }); flush();
  ok(G.playing_cards.includes(a), 'Scoring Test: 14 >= 1% of 100 -> kept');
  clearHand();
  const [b] = hand(['H_5']);
  const deb = G.GAME.blind.debuff_hand; G.GAME.blind.debuff_hand = () => true;
  play([b], { blind: 100 }); flush();
  G.GAME.blind.debuff_hand = deb;
  // the Lua recorded the hand at joker_main (skipped when debuffed) and destroyed the PREVIOUS hand (a)
  ok(!G.playing_cards.includes(b) && G.playing_cards.includes(a), 'fix 7 Scoring Test: the debuffed hand itself is destroyed, not the last one');
  clearHand();
  const [c] = hand(['D_5']);
  play([c]); flush();
  ok(!G.playing_cards.includes(c), 'Scoring Test: 7 < 1% of 1e15 -> destroyed');
}
// Cicero: jokers without Mult/Chips/retriggers come Negative while you own it
{
  start('CICE'); J('cicero');
  const sup = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_mmc_aurora_borealis');
  ok(sup.edition && sup.edition.negative, 'Cicero: a support joker is created Negative');
  const notsup = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_mmc_impatient');
  ok(!(notsup.edition && notsup.edition.negative), 'Cicero: a Mult joker is not');
  const bones = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_mr_bones');
  ok(bones.edition && bones.edition.negative, 'Cicero: Mr. Bones is whitelisted');
  const sup2 = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_mmc_seal_steal');
  sup2.set_edition({ foil: true });
  ok(sup2.edition && sup2.edition.negative, 'Cicero: a later Foil on a support joker becomes Negative');
}
// Dawn: retrigger played cards in the first hand of the round
{
  start('DAWN'); J('dawn');
  ok(play(hand(['S_9'])).tot.chips === 23, 'Dawn: first hand retriggered');
  clearHand();
  ok(play(hand(['S_9'])).tot.chips === 14, 'Dawn: second hand normal');
}
// Savings: +5 Mult per round, reset when buying a card
{
  start('SAVI'); const j = J('savings');
  winRound();
  ok(j.ability.extra.current_mult === 5, 'Savings: +5 at end of round');
  act({ type: 'cash_out' });
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(play(hand(['S_9'])).tot.mult === 6, 'Savings: +5 Mult');
  clearHand(); winRound(); act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  const jk = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker'); G.shop_jokers.emplace(jk);
  act({ type: 'buy', id: jk.sort_id }); flush();
  ok(j.ability.extra.current_mult === 0, 'Savings: buying a card resets it');
}
// Monopolist: +X0.5 at $10, requirement doubles (and halves back when the money drops)
{
  start('MONO'); const j = J('monopolist');
  ease(10 - G.GAME.dollars);
  ok(j.ability.extra.current_Xmult === 1.5 && j.ability.extra._req === 20, 'Monopolist: $10 -> X1.5', j.ability.extra);
  ease(40);
  ok(j.ability.extra.current_Xmult === 2.5 && j.ability.extra._req === 80, 'Monopolist: $50 -> X2.5 (every doubling it passes)', j.ability.extra);
  ok(play(hand(['S_9'])).tot.mult === 2.5, 'Monopolist: X2.5');
  ease(9 - G.GAME.dollars);
  ok(j.ability.extra.current_Xmult === 1 && j.ability.extra._req === 10, 'Monopolist: back to $9 -> X1', j.ability.extra);
}
// Nebula: +Mult = poker hand levels above 1
{
  start('NEBU'); J('nebula');
  G.GAME.hands.Pair.level = 3; G.GAME.hands.Flush.level = 2;
  ok(play(hand(['S_9'])).tot.mult === 1 + 3, 'Nebula: levels 3 + 2 -> +3 Mult');
}
// Cheapskate: skipping a Booster Pack refunds half its cost
{
  start('CHEA'); J('cheapskate');
  winRound(); act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  const pack = G.shop_booster.cards[0];
  const cost = pack.cost;
  act({ type: 'buy', id: pack.sort_id }); flush();
  const d = G.GAME.dollars;
  act({ type: 'skip_booster' }); flush();
  ok(G.GAME.dollars - d === Math.floor(cost / 2), 'Cheapskate: skipped pack -> half its cost back', [cost, G.GAME.dollars - d]);
}
// Psychic Joker: +150 Chips, destroyed by a hand of fewer than 5 cards
{
  start('PSYC'); const j = J('psychic');
  const r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  ok(r.tot.chips === 35 + 30 + 150, 'Psychic: 5 cards -> +150 Chips', r.tot);
  clearHand(); play(hand(['S_9'])); flush();
  ok(!G.jokers.cards.includes(j), 'Psychic: 1 card -> destroyed');
}
// Cheat: a hand containing a Straight retriggers all cards
{
  start('CHET'); J('cheat');
  ok(play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6'])).tot.chips === 30 + 40, 'Cheat: Straight -> every card twice');
  clearHand();
  ok(play(hand(['S_9', 'H_9'])).tot.chips === 28, 'Cheat: Pair -> nothing');
}
// Plus One: scored cards of the first hand go up a rank
{
  start('PLUS'); J('plus_one');
  const [a] = hand(['S_9']);
  play([a]); flush();
  ok(a.base.value === '10' && a.base.id === 10, 'Plus One: 9 -> 10', a.base.value);
  clearHand();
  const [b] = hand(['S_9']);
  play([b]); flush();
  ok(b.base.id === 9, 'Plus One: second hand -> nothing');
  nextRound();
  const [c] = hand(['H_A']);
  play([c]); flush();
  ok(c.base.id === 2, 'Plus One: Ace wraps to 2', c.base.value);
}

// =================================================================== fix 1 (Blueprint)
{
  start('BPRT');
  add('j_blueprint'); J('fisherman');
  const base = G.hand.config.card_limit;
  discard(hand(['S_2'])); flush();
  // the Lua: Blueprint copied the Fisherman's pre_discard too (+2 per discard)
  ok(G.hand.config.card_limit === base + 1, 'fix 1 Blueprint: a blueprint-incompatible joker is not copied (Fisherman +1 only)', G.hand.config.card_limit - base);
  start('BPRT2');
  add('j_blueprint'); J('prime_time');
  ok(near(play(hand(['S_7'])).tot.mult, 1.2 * 1.2), 'Blueprint still copies a compatible joker (Prime Time)');
}

// ================================================================== consumables
{
  start('ACE');
  G.GAME.dollars = 10; G.GAME.probabilities.normal = 0;
  let c = add('c_mmc_ace_of_pentacles');
  act({ type: 'use', id: c.sort_id }); flush();
  ok(G.GAME.dollars === 20, 'Ace Of Pentacles: double your money', G.GAME.dollars);
  G.GAME.probabilities.normal = 1000;
  c = add('c_mmc_ace_of_pentacles');
  act({ type: 'use', id: c.sort_id }); flush();
  ok(G.GAME.dollars === 0, 'Ace Of Pentacles: 1 in 4 -> $0', G.GAME.dollars);
  G.GAME.dollars = 7;
  c = add('c_mmc_page_of_pentacles');
  act({ type: 'use', id: c.sort_id }); flush();
  ok(G.GAME.dollars === -7, 'Page Of Pentacles: money x -1', G.GAME.dollars);
  const jk = add('j_joker');
  G.GAME.dollars = 10;
  c = add('c_mmc_incense');
  ok(c.can_use_consumeable(), 'Incense: usable with an editionless joker');
  act({ type: 'use', id: c.sort_id }); flush();
  ok(jk.edition && jk.edition.negative && G.GAME.dollars === -40 && G.GAME.mmc_incense_cost === 75, 'Incense: Negative joker, -$50 (no spending limit), next costs $75', [G.GAME.dollars, G.GAME.mmc_incense_cost]);
  c = add('c_mmc_incense');
  ok(!c.can_use_consumeable(), 'Incense: no editionless joker -> unusable');
  ok(describe(c).lines.some((l) => l.includes('$75')), 'Incense: shows the current price');
}

// ======================================================================== decks
{
  const deck = (back) => { newRun({ seed: 'DECK' + back, back, mods: ['mikas'] }); flush(); return G; };
  const ids = () => [...new Set(G.playing_cards.map((c) => c.get_id()))].sort((a, b) => a - b).join();
  deck('b_mmc_even_steven');
  ok(G.playing_cards.length === 20 && ids() === '2,4,6,8,10' && find_joker('Even Steven').length === 1 && G.GAME.starting_deck_size === 20, "Even Steven's Deck", ids());
  deck('b_mmc_odd_todd');
  ok(G.playing_cards.length === 20 && ids() === '3,5,7,9,14' && find_joker('Odd Todd').length === 1, "Odd Todd's Deck", ids());
  deck('b_mmc_fibonacci');
  ok(G.playing_cards.length === 20 && ids() === '2,3,5,8,14' && find_joker('Fibonacci').length === 1, 'Fibonacci Deck', ids());
  deck('b_mmc_prime');
  ok(G.playing_cards.length === 20 && ids() === '2,3,5,7,14' && find_joker('MMC Prime Time').length === 1, 'Prime Deck', ids());
  deck('b_mmc_midas');
  ok(G.playing_cards.length === 12 && ids() === '11,12,13' && G.playing_cards.every((c) => c.ability.name === 'Gold Card') && find_joker('Midas Mask').length === 1 && G.GAME.starting_deck_size === 12, "Midas's Deck");
  ok(!G.jokers.cards[0].edition, 'deck jokers come without an edition');
  deck('b_mmc_perfect_precision');
  const sn = G.jokers.cards[0];
  ok(G.GAME.round_resets.hands === 5 && G.GAME.round_resets.discards === 4 && G.hand.config.card_limit === 9 && G.GAME.starting_params.ante_scaling === 1.5 &&
    sn && key(sn) === 'j_mmc_sniper' && sn.edition && sn.edition.negative, 'Perfect Precision: +1 hand/discard/hand size, X1.5 ante scaling, Negative Sniper');
  deck('b_mmc_jokers_for_hire');
  ok(G.jokers.config.card_limit === 1, 'Jokers for Hire: 1 joker slot to start');
  const shop0 = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker');
  ok(shop0.cost === 2, 'Jokers for Hire: price x1 with no jokers', shop0.cost);
  add('j_joker'); add('j_joker');
  ok(G.jokers.config.card_limit === 3, 'Jokers for Hire: each joker +1 slot', G.jokers.config.card_limit);
  const shop2 = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker');
  ok(shop2.cost === 2 * 3, 'Jokers for Hire: price x3 with 2 jokers', shop2.cost);
  const buff = new (G.jokers.cards[0].constructor)(P_CARDS.empty, P_CENTERS.p_buffoon_normal_1);
  ok(buff.cost === P_CENTERS.p_buffoon_normal_1.cost * 3, 'Jokers for Hire: Buffoon Packs too', buff.cost);
  const rr = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_riff_raff');
  ok(rr.cost === 1000000000, 'Jokers for Hire: Riff-raff "no fun allowed"');
  G.jokers.cards[0].sell_card(); flush();
  ok(G.jokers.config.card_limit === 2 && G.GAME.mmc_for_hire_counter === 2, 'Jokers for Hire: selling gives the slot back');
  for (const k of ['b_mmc_even_steven', 'b_mmc_odd_todd', 'b_mmc_fibonacci', 'b_mmc_prime', 'b_mmc_midas', 'b_mmc_jokers_for_hire', 'b_mmc_perfect_precision']) {
    const d = describeBack(k);
    ok(d && d.lines.length > 0 && !d.lines.some((l) => /#\d+#/.test(l)), 'deck text: ' + k, d);
  }
}

// ===================================================================== describe
{
  start('DESC');
  let bad = 0;
  for (const k of STATUS.PORTED) {
    const d = describeCenter(k);
    if (!d || !d.lines.length || d.lines.some((l) => /#\d+#/.test(l))) { bad++; console.log('  collection text', k, d && d.lines); }
  }
  ok(bad === 0, 'describeCenter: every Mika card has filled text');
  bad = 0;
  for (const k of STATUS.PORTED.filter((x) => !x.startsWith('b_'))) {
    const c = add(k);
    const d = describe(c);
    if (!d.lines.length || d.lines.some((l) => /#\d+#/.test(l)) || !d.badges.some((b) => b.key === 'mod')) { bad++; console.log('  live text', k, d.lines); }
    c.remove();
  }
  ok(bad === 0, 'describe: every live Mika card has filled text + the mod badge');
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
