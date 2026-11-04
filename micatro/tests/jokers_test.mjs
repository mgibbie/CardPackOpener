// Joker logic tests — node micatro/tests/jokers_test.mjs
// Builds real runs with newRun, puts exact cards in hand, drives plays with
// act(...) and checks the scored totals against values worked out by hand
// from Balatro's rules (hand base chips/mult, card chips, joker order).
import { newRun, act, G } from '../js/engine/run.js';
import { add_joker, P_CENTERS, find_joker, LOC } from '../js/engine/core.js';

// Small/Big Blind have `text: {}` in the extracted data (Lua's empty table), which
// blind.js's raw_blind_description maps over as an array. Normalise it so these
// joker tests don't depend on that (unrelated) text code.
for (const d of Object.values(LOC.descriptions.Blind || {})) if (d.text && !Array.isArray(d.text)) d.text = Object.values(d.text);

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
const eq = (got, want, name) => ok(got === want, name + ' (=' + want + ')', got);
const near = (got, want, name) => ok(Math.abs(got - want) < 1e-9, name + ' (~' + want + ')', got);

/** Fresh run: jokers added before the blind is selected (setting_blind fires). */
function fresh(jokers = [], { select = true, bigBlind = true } = {}) {
  newRun({ seed: 'TEST', back: 'b_red' });
  const js = jokers.map((k) => add_joker(k));
  if (select) {
    const r = act({ type: 'select_blind' });
    if (!r.ok) throw new Error('select_blind: ' + r.error);
    if (bigBlind) G.GAME.blind.chips = 1e15;
  }
  return js;
}
/** Put exactly these deck cards (P_CARDS keys like 'H_A', 'S_T') in hand. */
function setHand(keys) {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  const out = [];
  for (const k of keys) {
    const c = G.deck.cards.find((x) => x.config.card.key === k);
    if (!c) throw new Error('no card ' + k + ' in deck');
    G.deck.remove_card(c); G.hand.emplace(c);
    out.push(c);
  }
  return out;
}
/** Hold `held`, play `played`; returns the hand total. */
function play(played, held = [], mod) {
  const cards = setHand([...played, ...held]);
  if (mod) mod(cards);
  const ids = cards.slice(0, played.length).map((c) => c.sort_id);
  let r = act({ type: 'highlight', ids });
  if (!r.ok) throw new Error('highlight: ' + r.error);
  r = act({ type: 'play' });
  if (!r.ok) throw new Error('play: ' + r.error);
  const ev = r.events.filter((e) => e.type === 'hand_total').pop();
  if (!ev || ev.total !== G.GAME.last_hand_total) throw new Error('hand_total event mismatch');
  return G.GAME.last_hand_total;
}
function discard(keys) {
  const cards = setHand(keys);
  let r = act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  if (!r.ok) throw new Error('highlight: ' + r.error);
  r = act({ type: 'discard' });
  if (!r.ok) throw new Error('discard: ' + r.error);
  return r;
}
/** Win the round on the next hand (blind chips 1) and cash out into the shop. */
function winRound(cashOut = true) {
  G.GAME.blind.chips = 1;
  play(['H_A']);
  if (cashOut) { const r = act({ type: 'cash_out' }); if (!r.ok) throw new Error('cash_out: ' + r.error); }
}
const forceOdds = () => { G.GAME.probabilities.normal = 1e9; };
const tryIt = (name, fn) => { try { fn(); } catch (e) { fail++; console.log('FAIL ' + name + ' threw ' + (e && e.stack || e)); } };

// Base hands: High Card 5/1, Pair 10/2, Two Pair 20/2, Three 30/3, Straight 30/4,
// Flush 35/4, Four of a Kind 60/7, Straight Flush 100/8. A=11, faces=10.

// ------------------------------------------------------------ joker_main
tryIt('joker_main', () => {
  fresh(['j_joker']); eq(play(['S_K', 'H_K']), 30 * 6, 'Joker +4 on a pair of Kings');
  fresh(['j_jolly']); eq(play(['S_K', 'H_K']), 30 * 10, 'Jolly Joker +8 on Pair');
  fresh(['j_sly']); eq(play(['S_K', 'H_K']), 80 * 2, 'Sly Joker +50 chips on Pair');
  fresh(['j_duo']); eq(play(['S_K', 'H_K']), 30 * 4, 'The Duo X2 on Pair');
  fresh(['j_duo']); eq(play(['H_A']), 16, 'The Duo silent on High Card');
  fresh(['j_half']); eq(play(['H_A']), 16 * 21, 'Half Joker +20 (<=3 cards)');
  fresh(['j_banner']); eq(play(['H_A']), (16 + 4 * 30), 'Banner +30 chips per discard left (Red Deck 4)');
  fresh(['j_mystic_summit']); G.GAME.current_round.discards_left = 0; eq(play(['H_A']), 16 * 16, 'Mystic Summit +15 at 0 discards');
  fresh(['j_blue_joker']); eq(play(['H_A']), 16 + 2 * 51, 'Blue Joker +2 chips per card left in deck (51)');
  fresh(['j_bull']); G.GAME.dollars = 10; eq(play(['H_A']), 16 + 20, 'Bull +2 chips per $');
  fresh(['j_bootstraps']); G.GAME.dollars = 10; eq(play(['H_A']), 16 * 5, 'Bootstraps +2 mult per $5');
  fresh(['j_abstract', 'j_joker']); eq(play(['H_A']), 16 * (1 + 6 + 4), 'Abstract Joker +3 per joker');
  fresh(['j_swashbuckler', 'j_joker']); eq(play(['H_A']), 16 * (1 + 1 + 4), 'Swashbuckler = sell value of other jokers ($1)');
  fresh(['j_stencil']); eq(play(['H_A']), 16 * 5, 'Joker Stencil X(empty slots + stencils) = X5');
  fresh(['j_acrobat']); G.GAME.current_round.hands_left = 1; eq(play(['H_A']), 16 * 3, 'Acrobat X3 on final hand');
  fresh(['j_blackboard']); eq(play(['D_A'], ['S_5', 'C_9']), 16 * 3, 'Blackboard X3 when held cards are all black');
  fresh(['j_blackboard']); eq(play(['D_A'], ['S_5', 'H_9']), 16, 'Blackboard off with a red card held');
  fresh(['j_seeing_double']); eq(play(['C_K', 'H_K']), 30 * 4, 'Seeing Double X2 (Club + other suit)');
  fresh(['j_flower_pot']); eq(play(['S_A', 'H_A', 'D_A', 'C_A']), (60 + 44) * 21, 'Flower Pot X3 with all four suits');
  fresh(['j_supernova']); eq(play(['S_K', 'H_K']), 30 * 3, 'Supernova +times hand played (1)');
  fresh(['j_card_sharp']);
  eq(play(['S_K', 'H_K']), 60, 'Card Sharp silent on first Pair this round');
  eq(play(['S_Q', 'H_Q']), 30 * 6, 'Card Sharp X3 on repeated Pair');
  fresh(['j_steel_joker']);
  G.playing_cards.filter((c) => c.config.card.key === 'S_2' || c.config.card.key === 'S_3').forEach((c) => c.set_ability(P_CENTERS.m_steel));
  eq(play(['H_A']), Math.floor(16 * 1.4), 'Steel Joker X(1+0.2*2 steel cards)');
  fresh(['j_stone']);
  G.playing_cards.find((c) => c.config.card.key === 'S_2').set_ability(P_CENTERS.m_stone);
  eq(play(['H_A']), 16 + 25, 'Stone Joker +25 chips per Stone Card');
  fresh(['j_drivers_license']);
  G.playing_cards.filter((c) => c.base.suit === 'Clubs').slice(0, 13).concat(G.playing_cards.filter((c) => c.base.suit === 'Diamonds' && c.base.value !== 'Ace').slice(0, 3))
    .forEach((c) => c.set_ability(P_CENTERS.m_bonus));
  eq(play(['H_A']), 16 * 3, "Driver's License X3 with 16 enhanced cards");
  fresh(['j_gros_michel']); eq(play(['H_A']), 16 * 16, 'Gros Michel +15');
  fresh(['j_ice_cream']); const ic = find_joker('Ice Cream')[0];
  eq(play(['H_A']), 116, 'Ice Cream +100 chips'); eq(ic.ability.extra.chips, 95, 'Ice Cream melts 5 after the hand');
  fresh(['j_baseball', 'j_bull']); G.GAME.dollars = 4; eq(play(['H_A']), (16 + 8) * 1.5, 'Baseball Card X1.5 per Uncommon joker (Bull)');
  fresh(['j_loyalty_card']); G.GAME.hands_played = 5; eq(play(['H_A']), 16 * 4, 'Loyalty Card X4 every 6th hand');
  fresh(['j_loyalty_card']); eq(play(['H_A']), 16, 'Loyalty Card silent on first hand');
  fresh(['j_misprint']); const mp = play(['H_A']); ok(mp >= 16 && mp <= 16 * 24 && mp % 16 === 0, 'Misprint +0..23 mult', mp);
});

// ------------------------------------------------------------ order of xmult
tryIt('xmult order', () => {
  fresh(['j_joker', 'j_cavendish']); eq(play(['S_K', 'H_K']), 30 * ((2 + 4) * 3), 'Joker then Cavendish: (2+4)*3');
  fresh(['j_cavendish', 'j_joker']); eq(play(['S_K', 'H_K']), 30 * (2 * 3 + 4), 'Cavendish then Joker: 2*3+4');
});

// ------------------------------------------------------------ individual (played)
tryIt('individual', () => {
  fresh(['j_greedy_joker']); eq(play(['D_A']), 16 * 4, 'Greedy Joker +3 per Diamond');
  fresh(['j_scary_face']); eq(play(['S_K']), 45, 'Scary Face +30 chips per face');
  fresh(['j_smiley']); eq(play(['S_K']), 15 * 6, 'Smiley Face +5 mult per face');
  fresh(['j_fibonacci']); eq(play(['H_A']), 16 * 9, 'Fibonacci +8 on Ace');
  fresh(['j_even_steven']); eq(play(['S_4', 'H_4']), 18 * 10, 'Even Steven +4 per even card');
  fresh(['j_odd_todd']); eq(play(['S_3', 'H_3']), (16 + 62) * 2, 'Odd Todd +31 chips per odd card');
  fresh(['j_scholar']); eq(play(['H_A']), 36 * 5, 'Scholar +20 chips +4 mult per Ace');
  fresh(['j_walkie_talkie']); eq(play(['S_T']), 25 * 5, 'Walkie Talkie on a 10');
  fresh(['j_arrowhead']); eq(play(['S_A']), 66, 'Arrowhead +50 chips per Spade');
  fresh(['j_onyx_agate']); eq(play(['C_A']), 16 * 8, 'Onyx Agate +7 mult per Club');
  fresh(['j_photograph']); eq(play(['S_K', 'H_K']), 30 * 4, 'Photograph X2 on first face only');
  fresh(['j_triboulet']); eq(play(['S_K', 'H_K']), 30 * 8, 'Triboulet X2 per King/Queen');
  fresh(['j_idol']); Object.assign(G.GAME.current_round.idol_card, { id: 14, rank: 'Ace', suit: 'Hearts' });
  eq(play(['H_A']), 32, 'The Idol X2 on Ace of Hearts');
  fresh(['j_ancient']); G.GAME.current_round.ancient_card.suit = 'Hearts'; eq(play(['H_A']), 24, 'Ancient Joker X1.5 on suit');
  fresh(['j_wee']); eq(play(['S_2']), 7 + 8, 'Wee Joker grows +8 on a 2 then scores');
  fresh(['j_hiker']);
  const [ha] = setHand(['H_A']); eq(play(['H_A']), 16, 'Hiker: card chips unchanged this hand');
  eq(ha.ability.perma_bonus, 5, 'Hiker: +5 permanent chips');
  fresh(['j_bloodstone']); forceOdds(); eq(play(['H_A']), 24, 'Bloodstone X1.5 (odds forced)');
  fresh(['j_lucky_cat']); forceOdds();
  eq(play(['H_A'], [], (cs) => cs[0].set_ability(P_CENTERS.m_lucky)), Math.floor(16 * (21 * 1.25)), 'Lucky Cat grows on Lucky trigger');
  fresh(['j_ticket']); const d0 = G.GAME.dollars;
  play(['H_A'], [], (cs) => cs[0].set_ability(P_CENTERS.m_gold)); eq(G.GAME.dollars - d0, 4, 'Golden Ticket +$4 per Gold card');
  fresh(['j_rough_gem']); const d1 = G.GAME.dollars; play(['D_A', 'D_K']); eq(G.GAME.dollars - d1, 1, 'Rough Gem +$1 per scoring Diamond');
  fresh(['j_business']); forceOdds(); const d2 = G.GAME.dollars; play(['S_K', 'H_K']); eq(G.GAME.dollars - d2, 4, 'Business Card +$2 per face (odds forced)');
});

// ------------------------------------------------------------ held in hand
tryIt('held in hand', () => {
  fresh(['j_baron']); eq(play(['D_2'], ['S_K', 'H_K']), Math.floor(7 * 2.25), 'Baron X1.5 per held King');
  fresh(['j_shoot_the_moon']); eq(play(['D_2'], ['S_Q']), 7 * 14, 'Shoot the Moon +13 per held Queen');
  fresh(['j_raised_fist']); eq(play(['D_A'], ['S_5', 'H_9']), 16 * 11, 'Raised Fist +2x lowest held rank');
  fresh(['j_mime', 'j_shoot_the_moon']); eq(play(['D_2'], ['S_Q']), 7 * 27, 'Mime retriggers held Queen');
  fresh(['j_reserved_parking']); forceOdds(); const d = G.GAME.dollars; play(['D_2'], ['S_Q', 'S_J']); eq(G.GAME.dollars - d, 2, 'Reserved Parking $1 per held face (odds forced)');
});

// ------------------------------------------------------------ retriggers
tryIt('retriggers', () => {
  fresh(['j_hack']); eq(play(['S_2']), 9, 'Hack retriggers a 2');
  fresh(['j_hack', 'j_fibonacci']); eq(play(['S_2']), 9 * 17, 'Hack + Fibonacci: both triggers scored');
  fresh(['j_sock_and_buskin', 'j_smiley']); eq(play(['S_K']), 25 * 11, 'Sock and Buskin retriggers face');
  fresh(['j_hanging_chad']); eq(play(['H_A']), 5 + 33, 'Hanging Chad retriggers first card x2');
  fresh(['j_dusk']); eq(play(['S_K']), 15, 'Dusk idle before last hand');
  G.GAME.current_round.hands_left = 1; eq(play(['D_K']), 25, 'Dusk retriggers on last hand');
  fresh(['j_selzer']); const sz = find_joker('Seltzer')[0];
  eq(play(['H_A']), 27, 'Seltzer retriggers'); eq(sz.ability.extra, 9, 'Seltzer counts down');
});

// ------------------------------------------------------------ Blueprint / Brainstorm
tryIt('copying', () => {
  fresh(['j_blueprint', 'j_joker']); eq(play(['S_K', 'H_K']), 30 * 10, 'Blueprint copies Joker');
  fresh(['j_duo', 'j_brainstorm']); eq(play(['S_K', 'H_K']), 30 * 8, 'Brainstorm copies leftmost (The Duo)');
  fresh(['j_blueprint', 'j_sock_and_buskin', 'j_smiley']); eq(play(['S_K']), 35 * 16, 'Blueprint copies Sock and Buskin retrigger');
  fresh(['j_blueprint', 'j_scary_face']); eq(play(['S_K']), 75, 'Blueprint copies Scary Face individual');
  fresh(['j_blueprint', 'j_joker', 'j_brainstorm']); eq(play(['S_K', 'H_K']), 30 * 14, 'Brainstorm -> Blueprint -> Joker chain');
  fresh(['j_brainstorm', 'j_joker']); eq(play(['S_K', 'H_K']), 30 * 6, 'Brainstorm in leftmost slot copies nothing');
  fresh(['j_blueprint', 'j_ride_the_bus']); eq(play(['H_A']), 16 * 3, 'Blueprint copies Ride the Bus scoring (not its growth)');
  fresh(['j_blueprint', 'j_mime', 'j_shoot_the_moon']); eq(play(['D_2'], ['S_Q']), 7 * 40, 'Blueprint copies Mime held retrigger');
});

// ------------------------------------------------------------ scaling (before)
tryIt('scaling', () => {
  fresh(['j_ride_the_bus']); const rb = find_joker('Ride the Bus')[0];
  eq(play(['H_A']), 32, 'Ride the Bus +1'); eq(play(['D_A']), 48, 'Ride the Bus +2');
  eq(play(['S_K']), 15, 'Ride the Bus resets on face'); eq(rb.ability.mult, 0, 'Ride the Bus mult 0');
  fresh(['j_green_joker']); const gj = find_joker('Green Joker')[0];
  eq(play(['H_A']), 32, 'Green Joker +1 per hand'); discard(['S_2', 'S_3']); eq(gj.ability.mult, 0, 'Green Joker -1 per discard');
  eq(play(['D_A']), 32, 'Green Joker regrows');
  fresh(['j_runner']); eq(play(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']), (50 + 15) * 4, 'Runner +15 on Straight');
  fresh(['j_square']); eq(play(['S_K', 'H_K', 'S_Q', 'H_Q']), 64 * 2, 'Square Joker +4 on 4-card hand');
  fresh(['j_trousers']); eq(play(['S_K', 'H_K', 'S_Q', 'H_Q']), 60 * 4, 'Spare Trousers +2 on Two Pair');
  fresh(['j_obelisk']); eq(play(['H_A']), 16, 'Obelisk no bonus on most played');
  eq(play(['S_K', 'H_K']), Math.floor(30 * 2 * 1.2), 'Obelisk X1.2 on a non-most-played hand');
  fresh(['j_vampire']); eq(play(['H_A'], [], (cs) => cs[0].set_ability(P_CENTERS.m_bonus)), Math.floor(16 * 1.1), 'Vampire eats enhancement, X1.1');
  fresh(['j_midas_mask']); const [mk] = setHand(['S_K']); play(['S_K']); eq(mk.ability.name, 'Gold Card', 'Midas Mask turns faces Gold');
  fresh(['j_space']); forceOdds(); eq(play(['H_A']), 26 * 2, 'Space Joker levels up High Card first');
  fresh(['j_todo_list']); const td = find_joker('To Do List')[0]; td.ability.to_do_poker_hand = 'High Card';
  const d = G.GAME.dollars; play(['H_A']); eq(G.GAME.dollars - d, 4, 'To Do List +$4');
  fresh(['j_dna', 'j_hologram']); eq(play(['H_A']), 20, 'DNA copies first single card -> Hologram X1.25');
  eq(G.playing_cards.length, 53, 'DNA added a playing card');
  fresh(['j_constellation']); const pl = add_joker('c_pluto');
  ok(act({ type: 'use', id: pl.sort_id }).ok, 'use Pluto');
  near(find_joker('Constellation')[0].ability.x_mult, 1.1, 'Constellation +0.1 per Planet');
  eq(play(['H_A']), Math.floor(26 * 2 * 1.1), 'Constellation scores after Pluto level-up');
});

// ------------------------------------------------------------ discards
tryIt('discards', () => {
  fresh(['j_faceless']); const d0 = G.GAME.dollars; discard(['S_K', 'S_Q', 'S_J']); eq(G.GAME.dollars - d0, 5, 'Faceless Joker +$5 for 3 faces');
  fresh(['j_mail']); G.GAME.current_round.mail_card.id = 13; const d1 = G.GAME.dollars;
  discard(['S_K', 'H_K', 'S_2']); eq(G.GAME.dollars - d1, 10, 'Mail-In Rebate +$5 per discarded King');
  fresh(['j_castle']); G.GAME.current_round.castle_card.suit = 'Spades';
  discard(['S_2', 'S_3', 'H_4']); eq(find_joker('Castle')[0].ability.extra.chips, 6, 'Castle +3 chips per Spade discarded');
  eq(play(['H_A']), 22, 'Castle chips scored');
  fresh(['j_trading']); const d2 = G.GAME.dollars; const n0 = G.playing_cards.length;
  discard(['S_2']); eq(G.GAME.dollars - d2, 3, 'Trading Card +$3'); eq(G.playing_cards.length, n0 - 1, 'Trading Card destroys the card');
  fresh(['j_hit_the_road']); discard(['S_J', 'H_J']); eq(play(['H_A']), 32, 'Hit the Road X0.5 per Jack discarded');
  fresh(['j_ramen']); discard(['S_2']); eq(play(['H_A']), Math.floor(16 * 1.99), 'Ramen loses X0.01 per discard');
  fresh(['j_burnt']); discard(['S_2', 'H_2']); eq(G.GAME.hands.Pair.level, 2, 'Burnt Joker levels first discarded hand');
  fresh(['j_yorick']); const yk = find_joker('Yorick')[0]; yk.ability.yorick_discards = 1;
  discard(['S_2']); eq(yk.ability.x_mult, 2, 'Yorick X1 more after 23 discards');
});

// ------------------------------------------------------------ setting_blind / first hand
tryIt('setting_blind', () => {
  fresh(['j_ceremonial', 'j_joker']);
  eq(G.jokers.cards.length, 1, 'Ceremonial Dagger destroys joker to its right');
  eq(find_joker('Ceremonial Dagger')[0].ability.mult, 2, 'Ceremonial Dagger gains 2x sell value');
  eq(play(['H_A']), 16 * 3, 'Ceremonial Dagger scores');
  fresh(['j_madness', 'j_joker']);
  eq(G.jokers.cards.length, 1, 'Madness destroys a joker'); eq(play(['H_A']), 24, 'Madness X1.5');
  fresh(['j_riff_raff']);
  eq(G.jokers.cards.length, 3, 'Riff-raff creates 2 jokers');
  ok(G.jokers.cards.slice(1).every((c) => c.config.center.rarity === 1), 'Riff-raff jokers are Common');
  eq(G.GAME.joker_buffer, 0, 'joker_buffer cleared');
  fresh(['j_cartomancer']); eq(G.consumeables.cards.length, 1, 'Cartomancer creates a card');
  eq(G.consumeables.cards[0].ability.set, 'Tarot', 'Cartomancer card is a Tarot');
  eq(G.GAME.consumeable_buffer, 0, 'consumeable_buffer cleared');
  fresh(['j_marble']); eq(G.playing_cards.length, 53, 'Marble adds a card');
  ok(G.deck.cards.some((c) => c.ability.name === 'Stone Card') || G.hand.cards.some((c) => c.ability.name === 'Stone Card'), 'Marble card is Stone');
  fresh(['j_burglar']); eq(G.GAME.current_round.hands_left, 7, 'Burglar +3 hands'); eq(G.GAME.current_round.discards_left, 0, 'Burglar no discards');
  fresh(['j_certificate']); eq(G.hand.cards.length, 9, 'Certificate adds a card to hand');
  ok(G.hand.cards.some((c) => c.seal), 'Certificate card has a seal'); eq(G.playing_cards.length, 53, 'Certificate card in deck list');
  fresh(['j_chicot'], { select: false }); G.GAME.round_resets.blind_states = { Small: 'Skipped', Big: 'Skipped', Boss: 'Select' };
  G.GAME.blind_on_deck = 'Boss'; ok(act({ type: 'select_blind' }).ok, 'select boss');
  ok(G.GAME.blind.disabled, 'Chicot disables the boss');
});

// ------------------------------------------------------------ creation during play
tryIt('creation', () => {
  fresh(['j_8_ball']); forceOdds(); play(['S_8']); eq(G.consumeables.cards.length, 1, '8 Ball creates a Tarot');
  fresh(['j_superposition']); play(['S_A', 'H_2', 'D_3', 'C_4', 'S_5']); eq(G.consumeables.cards.length, 1, 'Superposition: Ace + Straight -> Tarot');
  fresh(['j_seance']); play(['S_9', 'S_T', 'S_J', 'S_Q', 'S_K']); eq(G.consumeables.cards[0] && G.consumeables.cards[0].ability.set, 'Spectral', 'Seance: Straight Flush -> Spectral');
  fresh(['j_vagabond']); G.GAME.dollars = 4; play(['H_A']); eq(G.consumeables.cards.length, 1, 'Vagabond: <= $4 -> Tarot');
  fresh(['j_sixth_sense']); const n = G.playing_cards.length; play(['S_6']);
  eq(G.playing_cards.length, n - 1, 'Sixth Sense destroys the 6'); eq(G.consumeables.cards[0] && G.consumeables.cards[0].ability.set, 'Spectral', 'Sixth Sense -> Spectral');
  fresh(['j_cartomancer', 'j_8_ball']); forceOdds();
  play(['S_8', 'H_8']); eq(G.consumeables.cards.length, 2, '8 Ball respects consumeable slots (2)');
});

// ------------------------------------------------------------ end of round
tryIt('end_of_round', () => {
  fresh(['j_popcorn', 'j_egg', 'j_turtle_bean', 'j_invisible', 'j_gift']);
  const pc = find_joker('Popcorn')[0], egg = find_joker('Egg')[0], tb = find_joker('Turtle Bean')[0], inv = find_joker('Invisible Joker')[0];
  const eggSell = egg.sell_cost;
  winRound(false);
  eq(pc.ability.mult, 16, 'Popcorn -4 per round');
  eq(egg.sell_cost, eggSell + 3 + 1, 'Egg +$3 sell value (+1 Gift Card)');
  eq(tb.ability.extra.h_size, 4, 'Turtle Bean -1 hand size');
  eq(inv.ability.invis_rounds, 1, 'Invisible Joker counts rounds');
  fresh(['j_gros_michel']); forceOdds(); winRound(false);
  eq(find_joker('Gros Michel').length, 0, 'Gros Michel goes extinct'); eq(G.GAME.pool_flags.gros_michel_extinct, true, 'gros_michel_extinct flag');
  fresh(['j_ice_cream']); find_joker('Ice Cream')[0].ability.extra.chips = 5; winRound(false);
  eq(find_joker('Ice Cream').length, 0, 'Ice Cream melts away');
  fresh(['j_hit_the_road']); discard(['S_J']); winRound(false); eq(find_joker('Hit the Road')[0].ability.x_mult, 1, 'Hit the Road resets');
  fresh(['j_mr_bones']); G.GAME.current_round.hands_left = 1; G.GAME.blind.chips = 40; play(['H_A']);
  ok(!G.GAME.over, 'Mr. Bones saves the run'); eq(find_joker('Mr. Bones').length, 0, 'Mr. Bones is consumed');
  fresh(['j_todo_list']); const td = find_joker('To Do List')[0]; const before = td.ability.to_do_poker_hand;
  winRound(false); ok(td.ability.to_do_poker_hand && td.ability.to_do_poker_hand !== before, 'To Do List rerolls its hand');
});

// ------------------------------------------------------------ shop / sell / skip
tryIt('shop', () => {
  fresh(['j_campfire', 'j_joker']); const cf = find_joker('Campfire')[0];
  const jk = find_joker('Joker')[0]; ok(act({ type: 'sell', id: jk.sort_id }).ok, 'sell Joker');
  near(cf.ability.x_mult, 1.25, 'Campfire +X0.25 per card sold');
  fresh(['j_flash']); winRound(); G.GAME.dollars = 100; ok(act({ type: 'reroll_shop' }).ok, 'reroll');
  eq(find_joker('Flash Card')[0].ability.mult, 2, 'Flash Card +2 per reroll');
  fresh(['j_perkeo']); const pl = add_joker('c_pluto'); winRound(); ok(act({ type: 'next_round' }).ok, 'leave shop');
  eq(G.consumeables.cards.length, 2, 'Perkeo duplicates a consumable');
  ok(G.consumeables.cards[1].edition && G.consumeables.cards[1].edition.negative, 'Perkeo copy is Negative');
  fresh(['j_throwback'], { select: false }); ok(act({ type: 'skip_blind' }).ok, 'skip blind');
  { const tb = find_joker('Throwback')[0]; tb.update_joker(); near(tb.ability.x_mult, 1.25, 'Throwback X0.25 per skip'); }
  fresh(['j_diet_cola'], { select: false }); const dc = find_joker('Diet Cola')[0]; const ntags = G.GAME.tags.length;
  ok(act({ type: 'sell', id: dc.sort_id }).ok, 'sell Diet Cola'); eq(G.GAME.tags.length, ntags + 1, 'Diet Cola creates a Double Tag');
  ok(G.GAME.tags.some((t) => t.key === 'tag_double'), 'tag is tag_double');
  fresh(['j_invisible', 'j_joker']); const iv = find_joker('Invisible Joker')[0]; iv.ability.invis_rounds = 2;
  ok(act({ type: 'sell', id: iv.sort_id }).ok, 'sell Invisible Joker');
  eq(G.jokers.cards.filter((c) => c.ability.name === 'Joker').length, 2, 'Invisible Joker duplicates a joker');
  fresh(['j_hologram']); const hg = find_joker('Hologram')[0];
  // playing_card_added from a Standard pack pick / shop buy: drive the context exactly as run.js does
  for (const j of G.jokers.cards.slice()) j.calculate_joker({ playing_card_added: true, cards: [G.deck.cards[0], G.deck.cards[1]] });
  near(hg.ability.x_mult, 1.5, 'Hologram +X0.25 per card added');
  fresh(['j_red_card']); const rc = find_joker('Red Card')[0];
  for (const j of G.jokers.cards.slice()) j.calculate_joker({ skipping_booster: true });
  G.E_MANAGER.flush(); eq(rc.ability.mult, 3, 'Red Card +3 per skipped pack');
  fresh(['j_hallucination']); forceOdds();
  for (const j of G.jokers.cards.slice()) j.calculate_joker({ open_booster: true });
  G.E_MANAGER.flush(); eq(G.consumeables.cards.length, 1, 'Hallucination creates a Tarot on pack open');
  fresh(['j_glass']); const gl = find_joker('Glass Joker')[0]; forceOdds();
  play(['H_A'], [], (cs) => cs[0].set_ability(P_CENTERS.m_glass)); near(gl.ability.x_mult, 1.75, 'Glass Joker +X0.75 per shattered Glass card');
  fresh(['j_caino']); const ca = find_joker('Caino')[0]; forceOdds();
  play(['S_K', 'H_K'], [], (cs) => cs.forEach((c) => c.set_ability(P_CENTERS.m_glass))); eq(ca.ability.caino_xmult, 3, 'Caino +X1 per destroyed face');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
