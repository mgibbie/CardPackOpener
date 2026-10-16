// Milatro (micatro/mods/milatro): mod off -> nothing; on -> all 30 jokers fired through real
// act() plays with the mod's exact numbers (Toast's Rapture form included), every describe()
// filled, and one test per intended-design fix (each notes what the shipped Lua did instead).
//   node micatro/tests/mods/milatro_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, P_CENTER_POOLS, P_JOKER_RARITY_POOLS, add_joker, create_playing_card, create_card, poll_edition } from '../../js/engine/core.js';
import { newRun, act, STATES } from '../../js/engine/run.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { ATLASES } from '../../js/mods/registry.js';
import { JOKER_KEYS } from '../../mods/milatro/index.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();

function start(seed, { noBlind = false, mods = ['milatro'] } = {}) {
  newRun({ seed, back: 'b_red', mods });
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
const hand = (keys, center) => keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.hand));
const add = (key) => { const c = add_joker(key); flush(); return c; };
const clearJokers = () => { for (const j of G.jokers.cards.slice()) j.remove(); flush(); };
/** Play these cards without ending the round (hands_left kept >= `left` before the play). */
function play(cards, { left = 2, keepChips = false } = {}) {
  if (!keepChips) { G.GAME.chips = 0; G.GAME.blind.chips = 1e15; }
  G.GAME.current_round.hands_left = Math.max(G.GAME.current_round.hands_left, left);
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  const total = res.events.find((e) => e.type === 'hand_total');
  clearHand();
  return { res, total, events: res.events };
}
function winRound() {
  clearHand();
  G.GAME.chips = G.GAME.blind.chips;
  G.GAME.current_round.hands_left = Math.max(1, G.GAME.current_round.hands_left);
  act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) });
  return act({ type: 'play' });
}
function nextRound() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  act({ type: 'select_blind' });
  clearHand();
}
const msgs = (events) => events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);
const tot = (r) => r.total && [r.total.chips, r.total.mult, r.total.total];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ===================================================================== off
{
  start('MLOFF', { mods: [] });
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'milatro'), 'off: no Milatro joker in the joker pool');
  ok(![1, 2, 3].some((r) => P_JOKER_RARITY_POOLS[r].some((c) => c.mod === 'milatro')), 'off: rarity pools vanilla');
  // the hooks are dead too: a Spade is not a Heart, the vanilla edition poll
  const s = hand(['S_2'])[0];
  ok(!s.is_suit('Hearts') && !s.is_suit('Diamonds'), 'off: no suit rules');
}

// ====================================================================== on
start('MLON');
ok(JOKER_KEYS.length === 30, '30 jokers registered', JOKER_KEYS.length);
ok(JOKER_KEYS.every((k) => P_CENTER_POOLS.Joker.includes(P_CENTERS[k])), 'on: all 30 in the joker pool');
ok(P_JOKER_RARITY_POOLS[1].filter((c) => c.mod === 'milatro').length === 11 && P_JOKER_RARITY_POOLS[2].filter((c) => c.mod === 'milatro').length === 10
  && P_JOKER_RARITY_POOLS[3].filter((c) => c.mod === 'milatro').length === 9, 'rarities 11 common / 10 uncommon / 9 rare');
ok(ATLASES.mlnc_MilatroMod && ATLASES.mlnc_MilatroMod.px === 71 && ATLASES.mlnc_MilatroMod.src.endsWith('/milatro/assets/2x/MilatroJokers.png'), 'atlas registered');
ok(P_CENTERS.j_mlnc_humble_joker.cost === 7 && P_CENTERS.j_mlnc_circle_joker.cost === 9 && P_CENTERS.j_mlnc_multitasking.cost === 4 && P_CENTERS.j_mlnc_toast.pos.x === 6 && P_CENTERS.j_mlnc_toast.pos.y === 2, 'costs / atlas positions from the Lua');
ok(P_CENTERS.j_mlnc_lumberjack.eternal_compat === false && P_CENTERS.j_mlnc_circle_joker.perishable_compat === false && P_CENTERS.j_mlnc_betrayal.blueprint_compat === false, 'compat flags');

// every description filled (live + collection)
for (const k of JOKER_KEYS) {
  clearJokers();
  const j = add(k);
  const d = describe(j), dc = describeCenter(k);
  ok(d.lines.length > 0 && !d.lines.join(' ').match(/#\d+#/) && d.name, 'describe filled: ' + k, d.lines);
  ok(dc.lines.length > 0 && !dc.lines.join(' ').match(/#\d+#/), 'describeCenter filled: ' + k, dc.lines);
}
clearJokers();

// Humble Joker: X2
{ add('j_mlnc_humble_joker'); const r = play(hand(['S_2'])); ok(same(tot(r), [7, 2, 14]), 'Humble Joker X2', tot(r)); clearJokers(); }

// Circle Joker: one-card hand gains +3 Mult / +14 Chips (before scoring)
{
  const j = add('j_mlnc_circle_joker');
  let r = play(hand(['S_2']));
  ok(same(tot(r), [21, 4, 84]) && msgs(r.events).includes('Upgrade!'), 'Circle Joker: 1-card hand -> +14 chips +3 mult', tot(r));
  r = play(hand(['S_2', 'H_2']));
  ok(same(tot(r), [10 + 4 + 14, 2 + 3, 28 * 5]) && j.ability.extra.mult === 3, 'Circle Joker: 2-card hand does not grow', tot(r));
  clearJokers();
}

// Bad Omen: X0.5 per unique Spectral used
{
  add('j_mlnc_bad_omen');
  G.GAME.consumeable_usage = { c_hex: { count: 2, order: 1, set: 'Spectral' }, c_aura: { count: 1, order: 2, set: 'Spectral' }, c_fool: { count: 1, order: 3, set: 'Tarot' } };
  const r = play(hand(['S_2']));
  ok(same(tot(r), [7, 2, 14]), 'Bad Omen: 2 unique spectrals -> X2', tot(r));
  ok(describe(G.jokers.cards[0]).lines.join(' ').includes('X2'), 'Bad Omen: current value shown');
  G.GAME.consumeable_usage = {};
  clearJokers();
}

// Red Joker: +4 chips per discard (once per discard action)
{
  const j = add('j_mlnc_red_joker');
  const d = hand(['S_3', 'H_4', 'D_9']);
  act({ type: 'highlight', ids: d.map((c) => c.sort_id) });
  const dr = act({ type: 'discard' });
  ok(j.ability.extra.chips === 4 && msgs(dr.events).includes('Upgrade!'), 'Red Joker: one discard of 3 cards -> +4', j.ability.extra.chips);
  clearHand();
  const r = play(hand(['S_2']));
  ok(same(tot(r), [11, 1, 11]), 'Red Joker: +4 chips', tot(r));
  clearJokers();
}

// Rigged Wheel: every edition equally likely (Negative included, even no_neg / guaranteed)
{
  add('j_mlnc_rigged_wheel');
  const n = { negative: 0, polychrome: 0, holo: 0, foil: 0 };
  for (let i = 0; i < 2000; i++) { const e = poll_edition('rw' + (i % 7), null, true, true); if (e) n[Object.keys(e)[0]]++; }
  ok(Object.values(n).reduce((a, b) => a + b, 0) === 2000, 'Rigged Wheel: a guaranteed poll always gives an edition', n);
  ok(Object.values(n).every((v) => v > 400 && v < 600), 'Rigged Wheel: 4 editions ~25% each (Negative too, despite no_neg)', n);
  let hits = 0;
  for (let i = 0; i < 20000; i++) if (poll_edition('rwn')) hits++;
  ok(hits > 20000 * 0.01725 * 0.75 && hits < 20000 * 0.01725 * 1.25, 'Rigged Wheel: unguaranteed chance 1.725% * edition_rate', hits);
  clearJokers();
  let negs = 0;
  for (let i = 0; i < 2000; i++) { const e = poll_edition('rw' + (i % 7), null, true, true); if (e && e.negative) negs++; }
  ok(negs === 0, 'without it: vanilla poll (no_neg respected)', negs);
}

// Brick by Brick: +3 Mult per scoring Stone card
{
  const j = add('j_mlnc_brick_by_brick');
  const r = play(hand(['S_2'], 'm_stone'));
  ok(same(tot(r), [55, 4, 220]) && j.ability.extra.mult === 3, 'Brick by Brick: Stone scores -> +3 then +3 Mult', tot(r));
  const r2 = play(hand(['S_2']));
  ok(same(tot(r2), [7, 4, 28]), 'Brick by Brick: non-stone keeps +3', tot(r2));
  clearJokers();
}

// Miner: retrigger Stone cards
{ add('j_mlnc_miner'); const r = play(hand(['S_2'], 'm_stone')); ok(same(tot(r), [105, 1, 105]) && msgs(r.events).includes('Again!'), 'Miner: Stone retriggered', tot(r)); clearJokers(); }

// Colorblindness (+ fix 1)
{
  add('j_mlnc_colorblindness');
  const r = play(hand(['C_2', 'C_5', 'D_7', 'D_9', 'C_K']));
  ok(r.total.hand === 'Flush', 'Colorblindness: Clubs + Diamonds make a Flush', r.total.hand);
  const [s, h, c, d] = hand(['S_2', 'H_3', 'C_4', 'D_5']);
  ok(c.is_suit('Diamonds') && d.is_suit('Clubs'), 'Colorblindness: Club is a Diamond and vice versa');
  // Fix 1: the Lua's `==` also merged Spades and Hearts (a Spade answered is_suit('Hearts')).
  ok(!s.is_suit('Hearts') && !h.is_suit('Spades') && !s.is_suit('Diamonds') && !h.is_suit('Clubs'), 'fix 1: Spades and Hearts stay separate');
  ok(!s.is_suit('Hearts', false, true), 'fix 1: also in flush checks');
  const r2 = play([s, h, ...hand(['S_7', 'H_9', 'S_K'])]);
  ok(r2.total.hand !== 'Flush', 'fix 1: Spades + Hearts are no Flush', r2.total.hand);
  add('j_smeared');
  const [s2] = hand(['S_2']);
  ok(s2.is_suit('Diamonds') && s2.is_suit('Hearts') && s2.is_suit('Clubs'), 'with Smeared Joker every suit is one');
  clearHand();
  clearJokers();
}

// Wild West: +30 Mult for a scoring Wild card in the leftmost position
{
  add('j_mlnc_wild_west');
  const r = play(hand(['S_2'], 'm_wild'));
  ok(same(tot(r), [7, 31, 217]) && msgs(r.events).includes('YEEE-HAW!'), 'Wild West: leftmost Wild +30 Mult', tot(r));
  const r2 = play(hand(['S_2']));
  ok(same(tot(r2), [7, 1, 7]), 'Wild West: no Wild, nothing', tot(r2));
  clearJokers();
}

// Fire Tornado: +20 Mult if the hand only has Hearts / Diamonds
{
  add('j_mlnc_fire_tornado');
  const r = play(hand(['H_2', 'D_5']));
  ok(same(tot(r), [10, 21, 210]), 'Fire Tornado: Hearts + Diamonds -> +20', tot(r));
  const r2 = play(hand(['H_2', 'S_5']));
  ok(same(tot(r2), [10, 1, 10]), 'Fire Tornado: a Spade in the hand -> nothing', tot(r2));
  const r3 = play([...hand(['H_2']), ...hand(['S_5'], 'm_wild')]);
  ok(r3.total.mult === 21, 'Fire Tornado: Wild cards are ignored', tot(r3));
  clearJokers();
}

// Symmetry Joker: retrigger 6 / 8 / 9 / Ace
{
  add('j_mlnc_symmertry_joker');
  ok(same(tot(play(hand(['S_8']))), [21, 1, 21]), 'Symmetry: 8 retriggered');
  ok(same(tot(play(hand(['S_A']))), [27, 1, 27]), 'Symmetry: Ace retriggered');
  ok(same(tot(play(hand(['S_7']))), [12, 1, 12]), 'Symmetry: 7 not retriggered');
  clearJokers();
}

// Hole in One (+ fix 4)
{
  start('MLHOLE');
  add('j_mlnc_hole_in_one');
  // Fix 4: the Lua paid for ANY played Ace — here the Ace is an unscored kicker.
  let d0 = G.GAME.dollars;
  play(hand(['S_2', 'H_2', 'S_A']));
  ok(G.GAME.dollars === d0, 'fix 4: a non-scoring Ace on the first hand pays nothing', G.GAME.dollars - d0);
  start('MLHOLE2');
  add('j_mlnc_hole_in_one');
  d0 = G.GAME.dollars;
  play(hand(['S_A']));
  ok(G.GAME.dollars === d0 + 5, 'Hole in One: first hand scoring Ace -> $5', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  play(hand(['S_A']));
  ok(G.GAME.dollars === d0, 'Hole in One: not on the second hand');
  clearJokers();
}

// Slot Machine: three scoring 7s -> 3 Negative consumables
{
  add('j_mlnc_slot_machine');
  const r = play(hand(['S_7', 'H_7', 'D_7']));
  ok(msgs(r.events).includes('JACKPOT!') && G.consumeables.cards.length === 3 && G.consumeables.cards.every((c) => c.edition && c.edition.negative), 'Slot Machine: 3 Negative consumables', G.consumeables.cards.map((c) => c.config.center.key));
  ok(G.consumeables.cards.every((c) => ['Tarot', 'Planet', 'Spectral'].includes(c.ability.set)), 'Slot Machine: Tarot / Planet / Spectral');
  play(hand(['S_7', 'H_7']));
  ok(G.consumeables.cards.length === 3, 'Slot Machine: two 7s do nothing');
  for (const c of G.consumeables.cards.slice()) c.remove();
  clearJokers();
}

// The Deal: down to 1 hand, +5 discards on blind select
{
  start('MLDEAL', { noBlind: true });
  add('j_mlnc_the_deal');
  const d0 = G.GAME.round_resets.discards;
  const r = act({ type: 'select_blind' });
  ok(G.GAME.current_round.hands_left === 1 && G.GAME.current_round.discards_left === d0 + 5 && msgs(r.events).includes('+5 Discards'), 'The Deal: 1 hand, +5 discards', [G.GAME.current_round.hands_left, G.GAME.current_round.discards_left]);
  clearHand();
}

// Loan Shark: $5 of debt, X0.5 per $1 below 0
{
  start('MLLOAN');
  const b0 = G.GAME.bankrupt_at;
  const j = add('j_mlnc_loan_shark');
  ok(G.GAME.bankrupt_at === b0 - 5, 'Loan Shark: bankrupt_at -5');
  G.GAME.dollars = -4;
  const r = play(hand(['S_2']));
  ok(same(tot(r), [7, 3, 21]), 'Loan Shark: $-4 -> X3', tot(r));
  G.GAME.dollars = 10;
  ok(same(tot(play(hand(['S_2']))), [7, 1, 7]), 'Loan Shark: X1 when not in debt');
  j.remove();
  ok(G.GAME.bankrupt_at === b0, 'Loan Shark: debt limit restored when removed');
}

// The Reaper (+ fix 2)
{
  start('MLREAP');
  add('j_mlnc_the_reaper');
  G.GAME.probabilities.normal = 2; // 2 in 2
  const held = create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool'); held.add_to_deck(); G.consumeables.emplace(held);
  play(hand(['S_5', 'H_5']));
  // Fix 2: the Lua set G.GAME.consumeable_buffer = #consumeables here and left it.
  ok(G.GAME.consumeable_buffer === 0, 'fix 2: The Reaper leaves consumeable_buffer alone', G.GAME.consumeable_buffer);
  G.GAME.chips = G.GAME.blind.chips;
  G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: hand(['S_9', 'H_9']).map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  ok(G.consumeables.cards.some((c) => c.config.center.key === 'c_death') && msgs(r.events).includes('Death comes...'), 'The Reaper: winning Pair -> Death', msgs(r.events));
  nextRound();
  held.remove(); // room for another
  G.GAME.probabilities.normal = 0;
  play(hand(['S_5', 'H_5']));
  G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: hand(['S_9', 'H_9']).map((c) => c.sort_id) });
  G.GAME.current_round.hands_left = 1;
  const r2 = act({ type: 'play' });
  ok(msgs(r2.events).includes('Death waits...') && G.consumeables.cards.filter((c) => c.config.center.key === 'c_death').length === 1, 'The Reaper: failed roll -> Death waits...');
  nextRound();
  G.GAME.probabilities.normal = 2;
  G.GAME.chips = G.GAME.blind.chips;
  G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: hand(['S_9']).map((c) => c.sort_id) });
  const r3 = act({ type: 'play' });
  ok(!msgs(r3.events).some((m) => m.startsWith('Death')), 'The Reaper: winning hand without a Pair -> nothing');
  G.GAME.probabilities.normal = 1;
  for (const c of G.consumeables.cards.slice()) c.remove();
}

// Black Kitten
{
  start('MLKIT');
  const j = add('j_mlnc_black_kitten');
  G.GAME.probabilities.normal = 0; // Lucky never triggers
  let r = play(hand(['S_2'], 'm_lucky'));
  ok(near(j.ability.extra.Xmult, 1.1) && msgs(r.events).includes('+X0.1') && near(r.total.mult, 1.1), 'Black Kitten: failed Lucky -> +X0.1 (gained while scoring, so X1.1 this hand)', [j.ability.extra.Xmult, tot(r)]);
  r = play(hand(['S_2'], 'm_lucky'));
  ok(near(j.ability.extra.Xmult, 1.2) && near(r.total.mult, 1.2), 'Black Kitten: X1.2 applied', [j.ability.extra.Xmult, tot(r)]);
  G.GAME.probabilities.normal = 1e9; // always triggers
  r = play(hand(['S_2'], 'm_lucky'));
  ok(near(j.ability.extra.Xmult, 1.1) && msgs(r.events).includes('-X0.1'), 'Black Kitten: successful Lucky -> -X0.1', j.ability.extra.Xmult);
  play(hand(['S_2'], 'm_lucky'));
  ok(near(j.ability.extra.Xmult, 1), 'Black Kitten: floors at X1', j.ability.extra.Xmult);
  G.GAME.probabilities.normal = 1;
  clearJokers();
}

// Lumberjack: sell -> remove every 3, $1 each
{
  start('MLLUMB');
  const j = add('j_mlnc_lumberjack');
  ok(describe(j).lines.join(' ').includes('4'), 'Lumberjack: shows 4 cards to remove');
  const d0 = G.GAME.dollars;
  ok(act({ type: 'sell', id: j.sort_id }).ok, 'sell Lumberjack');
  ok(!G.playing_cards.some((c) => c.get_id() === 3) && G.playing_cards.length === 48, 'Lumberjack: all four 3s removed', G.playing_cards.length);
  ok(G.GAME.dollars === d0 + 4 + j.sell_cost, 'Lumberjack: +$4 (+ sell value)', G.GAME.dollars - d0);
}

// Clown Fiesta: sell -> 2 Juggle Tags
{
  start('MLCLOWN');
  const j = add('j_mlnc_clown_fiesta');
  const t0 = G.GAME.tags.length;
  act({ type: 'sell', id: j.sort_id });
  ok(G.GAME.tags.length === t0 + 2 && G.GAME.tags.slice(-2).every((t) => t.key === 'tag_juggle'), 'Clown Fiesta: 2 Juggle Tags', G.GAME.tags.map((t) => t.key));
}

// Force of Nature: X1 per Wild 4 in the full deck
{
  start('MLFORCE');
  const j = add('j_mlnc_force_of_nature');
  for (const c of G.playing_cards.filter((c) => c.get_id() === 4).slice(0, 2)) c.set_ability(P_CENTERS.m_wild);
  const r = play(hand(['S_2']));
  ok(same(tot(r), [7, 3, 21]) && describe(j).lines.join(' ').includes('X3'), 'Force of Nature: two Wild 4s -> X3', tot(r));
  clearJokers();
}

// Multitasking: even hand +5 Mult, odd +60 Chips, final hand $2
{
  start('MLMULTI');
  add('j_mlnc_multitasking');
  G.GAME.current_round.hands_left = 2;
  ok(same(tot(play(hand(['S_2']))), [7, 6, 42]), 'Multitasking: 2nd-to-last hand (even) +5 Mult');
  G.GAME.current_round.hands_left = 3;
  ok(same(tot(play(hand(['S_2']), { left: 3 })), [67, 1, 67]), 'Multitasking: odd hand +60 Chips');
  G.GAME.current_round.hands_left = 1;
  const d0 = G.GAME.dollars;
  G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  const t = r.events.find((e) => e.type === 'hand_total');
  ok(t.mult === 1 && t.chips === 7 && G.GAME.dollars === d0 + 2, 'Multitasking: final hand $2', [t.chips, t.mult, G.GAME.dollars - d0]);
}

// The Toilet: 1 in 2 to level a random Flush hand
{
  start('MLTOIL');
  add('j_mlnc_the_toilet');
  const FL = ['Flush Five', 'Flush House', 'Straight Flush', 'Flush'];
  const lv = () => FL.reduce((a, h) => a + G.GAME.hands[h].level, 0);
  G.GAME.probabilities.normal = 2;
  for (let i = 0; i < 4; i++) play(hand(['S_2']));
  ok(lv() === 8, 'The Toilet: 4 hands at 2-in-2 -> 4 flush-hand levels', lv());
  ok(G.GAME.hands['High Card'].level === 1, 'The Toilet: the played hand is not levelled');
  G.GAME.probabilities.normal = 0;
  play(hand(['S_2']));
  ok(lv() === 8, 'The Toilet: failed roll does nothing');
  G.GAME.probabilities.normal = 1;
  let n = 0; const before = lv();
  for (let i = 0; i < 40; i++) play(hand(['S_2']));
  n = lv() - before;
  ok(n > 8 && n < 32, 'The Toilet: ~1 in 2', n);
}

// Magic Hat (+ fix 2)
{
  start('MLHAT');
  add('j_mlnc_magic_hat');
  const [b] = hand(['S_2']); b.set_seal('Blue', true);
  play([b]);
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].config.center.key === 'c_pluto', 'Magic Hat: played Blue seal -> the hand\'s Planet', G.consumeables.cards.map((c) => c.config.center.key));
  ok(G.GAME.consumeable_buffer === 0, 'fix 2: Magic Hat resets consumeable_buffer (the Lua left it at #consumeables + 1)', G.GAME.consumeable_buffer);
  const [p] = hand(['S_2']); p.set_seal('Purple', true);
  play([p]);
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards[1].ability.set === 'Tarot', 'Magic Hat: played Purple seal -> a Tarot');
  // a vanilla creator still works afterwards (Purple seal discard): the starved-buffer bug
  const [p2] = hand(['S_3']); p2.set_seal('Purple', true);
  act({ type: 'highlight', ids: [p2.sort_id] }); act({ type: 'discard' });
  ok(G.consumeables.cards.length === 2, 'slots full (2/2): nothing more');
  G.consumeables.cards[0].remove();
  clearHand();
  const [p3] = hand(['S_4']); p3.set_seal('Purple', true);
  act({ type: 'highlight', ids: [p3.sort_id] }); act({ type: 'discard' });
  ok(G.consumeables.cards.length === 2, 'fix 2: vanilla Purple seal still creates (buffer not starved)', G.consumeables.cards.length);
  for (const c of G.consumeables.cards.slice()) c.remove();
  clearHand();
}

// Phalanx: the most frequent rank can't be debuffed
{
  start('MLPHAL');
  add('j_mlnc_phalanx');
  const ace = G.playing_cards.find((c) => c.get_id() === 14), king = G.playing_cards.find((c) => c.get_id() === 13);
  ace.set_debuff(true); king.set_debuff(true);
  ok(!ace.debuff && king.debuff, 'Phalanx: all ranks tied -> Aces (highest) protected, Kings not');
  create_playing_card({ front: P_CARDS.H_K, center: P_CENTERS.c_base }, G.deck);
  king.set_debuff(true); ace.set_debuff(true);
  ok(!king.debuff && ace.debuff, 'Phalanx: a 5th King -> Kings protected');
  clearJokers();
  ace.set_debuff(false); king.set_debuff(true);
  ok(king.debuff, 'without Phalanx: debuffable');
  king.set_debuff(false);
}

// Betrayal: $20 and destroy a random other (non-eternal) joker on blind select
{
  start('MLBETR', { noBlind: true });
  add('j_mlnc_betrayal');
  const e = add('j_joker'); e.set_eternal(true);
  add('j_greedy_joker');
  const d0 = G.GAME.dollars;
  act({ type: 'select_blind' });
  ok(G.GAME.dollars === d0 + 20, 'Betrayal: +$20', G.GAME.dollars - d0);
  ok(G.jokers.cards.length === 2 && G.jokers.cards.includes(e) && !G.jokers.cards.some((c) => c.config.center.key === 'j_greedy_joker'), 'Betrayal: destroyed the non-eternal joker', G.jokers.cards.map((c) => c.config.center.key));
  clearHand();
  clearJokers();
}

// The Landlords: X4 with a Full House
{
  start('MLLAND');
  add('j_mlnc_the_landlords');
  const r = play(hand(['S_2', 'H_2', 'D_2', 'S_3', 'H_3']));
  ok(same(tot(r), [40 + 12, 16, 52 * 16]), 'The Landlords: Full House X4', tot(r));
  ok(same(tot(play(hand(['S_2', 'H_2']))), [14, 2, 28]), 'The Landlords: Pair -> nothing');
  clearJokers();
}

// Recursive Joker: +4 per hand, -20 after a Boss
{
  start('MLREC');
  const j = add('j_mlnc_recursive_joker');
  ok(same(tot(play(hand(['S_2']))), [7, 5, 35]), 'Recursive: +4 on the first hand');
  ok(same(tot(play(hand(['S_2']))), [7, 9, 63]), 'Recursive: +8 on the second');
  let g = 0; while (!G.GAME.blind.boss && g++ < 5) nextRound();
  j.ability.extra.mult = 30;
  const r = winRound();
  ok(j.ability.extra.mult === 14 && msgs(r.events).includes('Falling...'), 'Recursive: 30 +4 (winning hand) -20 after the Boss = 14', j.ability.extra.mult);
  nextRound();
  j.ability.extra.mult = 2;
  g = 0; while (!G.GAME.blind.boss && g++ < 5) nextRound();
  const m = j.ability.extra.mult;
  winRound();
  ok(j.ability.extra.mult === Math.max(0, m + 4 - 20), 'Recursive: never below 0', j.ability.extra.mult);
}

// Butterfly Effect: Wild cards also get this round's enhancement
{
  start('MLBUTT');
  const ENH = ['Lucky Card', 'Glass Card', 'Mult Card', 'Bonus Card', 'Stone Card', 'Steel Card', 'Gold Card'];
  ok(ENH.includes(G.GAME.current_round.butterfly_card.enhancement), 'Butterfly: a round enhancement rolled at run start', G.GAME.current_round.butterfly_card);
  const j = add('j_mlnc_butterfly_effect');
  const setB = (e) => { G.GAME.current_round.butterfly_card.enhancement = e; };
  setB('Mult Card');
  ok(describe(j).lines.join(' ').includes('Mult Cards'), 'Butterfly: text names the enhancement');
  ok(same(tot(play(hand(['S_2'], 'm_wild'))), [7, 5, 35]), 'Butterfly: Mult -> +4 Mult');
  setB('Bonus Card'); ok(same(tot(play(hand(['S_2'], 'm_wild'))), [37, 1, 37]), 'Butterfly: Bonus -> +30 Chips');
  setB('Glass Card'); ok(same(tot(play(hand(['S_2'], 'm_wild'))), [7, 2, 14]), 'Butterfly: Glass -> X2');
  setB('Stone Card'); ok(same(tot(play(hand(['S_2'], 'm_wild'))), [57, 1, 57]), 'Butterfly: Stone -> +50 Chips');
  ok(same(tot(play(hand(['S_2']))), [7, 1, 7]), 'Butterfly: a non-Wild card gets nothing');
  setB('Lucky Card');
  G.GAME.probabilities.normal = 0;
  let d0 = G.GAME.dollars;
  ok(same(tot(play(hand(['S_2'], 'm_wild'))), [7, 1, 7]) && G.GAME.dollars === d0, 'Butterfly: Lucky rolls (none hit at 0 in 5)');
  G.GAME.probabilities.normal = 1e9;
  d0 = G.GAME.dollars;
  ok(same(tot(play(hand(['S_2'], 'm_wild'))), [7, 21, 147]) && G.GAME.dollars === d0 + 20, 'Butterfly: Lucky hits -> +20 Mult, $20', G.GAME.dollars - d0);
  G.GAME.probabilities.normal = 1;
  setB('Steel Card');
  const [held] = hand(['H_9'], 'm_wild');
  const r = play(hand(['S_2']));
  ok(same(tot(r), [7, 1.5, 10]), 'Butterfly: Steel -> held Wild X1.5', tot(r));
  void held;
  setB('Gold Card');
  const seen = new Set();
  for (let i = 0; i < 6; i++) { nextRound(); seen.add(G.GAME.current_round.butterfly_card.enhancement); }
  ok(seen.size >= 2 && [...seen].every((e) => ENH.includes(e)), 'Butterfly: changes at the end of each round', [...seen]);
}

// How Hungry (+ fix 3)
{
  start('MLHUNG');
  add('j_mlnc_how_hungry');
  const n0 = G.playing_cards.length, d0 = G.GAME.dollars;
  const cards = hand(['S_7', 'H_7', 'S_9', 'H_9']);
  play(cards);
  ok(G.playing_cards.length === n0 + 4 - 2 && cards[2].removed && cards[3].removed && !cards[0].removed, 'How Hungry: both scoring 9s destroyed', G.playing_cards.length - n0);
  ok(G.GAME.dollars === d0 + 6, 'How Hungry: $6 once', G.GAME.dollars - d0);
  // Fix 3: the Lua never cleared contains7 — this 7-less Pair of 9s was eaten too.
  const nines = hand(['S_9', 'D_9']);
  const d1 = G.GAME.dollars;
  play(nines);
  ok(!nines[0].removed && !nines[1].removed && G.GAME.dollars === d1, 'fix 3: no 7 this hand -> the 9s survive');
  clearJokers();
}

// Toast -> Rapture
{
  start('MLTOAST');
  ok(describeCenter('j_mlnc_toast').name === 'Toast', 'Toast: collection shows Toast');
  const j = add('j_mlnc_toast');
  const e = j.ability.extra;
  ok(e.actual_rounds >= 3 && e.actual_rounds <= 6 && e.count === 0, 'Toast: 3..6 rounds rolled on add', e);
  const d = describe(j);
  ok(d.name === 'Toast' && d.lines.join(' ').includes('Does nothing'), 'Toast: does nothing yet', d);
  ok(same(tot(play(hand(['S_2']))), [7, 1, 7]), 'Toast: no effect yet');
  let blessed = false;
  for (let i = 0; i < e.actual_rounds; i++) {
    G.GAME.chips = G.GAME.blind.chips;
    const r = winRound();
    if (msgs(r.events).includes('Blessed!')) blessed = i === e.actual_rounds - 1;
    if (i < e.actual_rounds - 1) { act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); }
  }
  ok(blessed && e.count === e.actual_rounds, 'Toast: Blessed! on its last round', e);
  const d2 = describe(j);
  ok(d2.name === 'Rapture' && d2.lines.join(' ').includes('The Holy Toast') && d2.lines.join(' ').includes('X5'), 'Rapture: the alternate form', d2);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(same(tot(play(hand(['S_2']))), [7, 5, 35]), 'Rapture: X5');
  winRound();
  ok(e.count === e.actual_rounds, 'Rapture: stays blessed');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
