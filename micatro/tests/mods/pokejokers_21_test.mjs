// Pokermon pokejokers_21 (Elgyem -> Bisharp): all 9 jokers fired through real plays (act),
// plus every evolution.   node micatro/tests/mods/pokejokers_21_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const NAMES = ['elgyem', 'beheeyem', 'litwick', 'lampent', 'chandelure', 'golett', 'golurk', 'pawniard', 'bisharp'];
ok(NAMES.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 9 pokejokers_21 jokers ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_21.lua'] || []).length === 9, 'defs: 9 from pokejokers_21.lua');
const rounds = (n) => { for (let i = 0; i < n; i++) { winRound(); if (i < n - 1) nextRound(); } };
const close = (a, b) => Math.abs(a - b) < 1e-9;

// ------------------------------------------------------------- Elgyem / Beheeyem
{
  start('ELGYEM');
  const j = add('j_poke_elgyem');
  G.GAME.hands.Flush.level = 5;
  nextRound();
  const planets = G.consumeables.cards.filter((c) => c.ability.set === 'Planet');
  ok(planets.length === 1 && planets[0].edition && planets[0].edition.negative, 'elgyem: a Negative Planet at blind select', planets.map(key));
  ok(planets[0].ability.consumeable.hand_type && G.GAME.hands[planets[0].ability.consumeable.hand_type].visible, 'elgyem: for a visible hand', planets[0].ability.consumeable.hand_type);
  for (const k of ['c_mercury', 'c_venus', 'c_earth', 'c_mars', 'c_jupiter']) add(k);
  winRound();
  ok(key(j) === 'j_poke_beheeyem', 'elgyem -> beheeyem holding 5 different Planets', [key(j), j.ability.extra.current_planet_count]);
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  const n0 = G.consumeables.cards.length;
  act({ type: 'select_blind' }); clearHand();
  ok(G.consumeables.cards.length === n0 + 1 && G.consumeables.cards[n0].edition.negative, 'beheeyem: a Negative Planet of a top-3 hand');
  // Beheeyem: every 9th booster opened in the shop adds Telescope.
  winRound(); act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP, 'in the shop');
  G.GAME.dollars = 100;
  j.ability.extra.boosters_to_open = 2;
  let b = G.shop_booster.cards[0];
  act({ type: 'buy', id: b.sort_id });
  ok(j.ability.extra.boosters_to_open === 1, 'beheeyem: counts boosters opened', j.ability.extra.boosters_to_open);
  act({ type: 'skip_booster' });
  const v0 = G.shop_vouchers.cards.length;
  const hadTele = G.shop_vouchers.cards.some((c) => key(c) === 'v_telescope');
  b = G.shop_booster.cards[0];
  act({ type: 'buy', id: b.sort_id });
  ok(j.ability.extra.boosters_to_open === 9, 'beheeyem: resets to 9', j.ability.extra.boosters_to_open);
  ok(hadTele || (G.shop_vouchers.cards.length === v0 + 1 && G.shop_vouchers.cards.some((c) => key(c) === 'v_telescope')), 'beheeyem: Telescope added to the shop', G.shop_vouchers.cards.map(key));
  act({ type: 'skip_booster' });
}

// ------------------------------------------------------------- Litwick line
{
  start('LITWICK');
  const a = add('j_joker');
  const j = add('j_poke_litwick');
  const b = add('j_joker');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 + 3 + 4, 'litwick: +3 Mult', r.total);
  const s0 = j.sell_cost;
  winRound();
  ok(a.sell_cost === 1 && b.sell_cost === 1 && j.sell_cost === s0, 'litwick: neighbours already at $1 -> nothing drained', [a.sell_cost, b.sell_cost, j.sell_cost]);
  a.ability.extra_value = 3; a.set_cost(); b.ability.extra_value = 3; b.set_cost();
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  winRound();
  ok(a.sell_cost === 3 && b.sell_cost === 3 && j.sell_cost === s0 + 2, 'litwick: drains $1 from each neighbour', [a.sell_cost, b.sell_cost, j.sell_cost]);
  nextRound();
  j.ability.extra_value = 7 - Math.max(1, Math.floor(j.cost / 2)); j.set_cost();
  r = play(hand(['S_A']));
  ok(j.sell_cost === 7 && r.total.mult === 1 + 4 + 9 + 4, 'litwick: X3 Mult (+9) at sell value $7+', [j.sell_cost, r.total]);
  j.ability.extra_value = 13; j.set_cost();
  winRound();
  ok(key(j) === 'j_poke_lampent', 'litwick -> lampent at sell value $13', key(j));
  nextRound();
  const c = add('j_joker');
  c.ability.extra_value = 2; c.set_cost();
  a.ability.extra_value = 2; a.set_cost();
  const sv = j.sell_cost;
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 + sv + 4 + 4, 'lampent: + sell value Mult', [sv, r.total]);
  const bs = b.sell_cost;
  winRound();
  ok(a.sell_cost === 2 && c.sell_cost === 2 && b.sell_cost === Math.max(1, bs - 1) && j.sell_cost === sv + 2 + (bs > 1 ? 1 : 0), 'lampent: drains $1 from every other joker', [a.sell_cost, b.sell_cost, c.sell_cost, j.sell_cost]);
  j.ability.extra.evolve = true;
  if (P_CENTERS.c_poke_duskstone && !P_CENTERS.c_poke_duskstone.unported) {
    j.ability.extra.evolve = undefined;
    act({ type: 'cash_out' });
    const it = add('c_poke_duskstone');
    act({ type: 'use', id: it.sort_id, joker_targets: [j.sort_id] });
    act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  } else nextRound();
  winRound();
  ok(key(j) === 'j_poke_chandelure', 'lampent -> chandelure with a Dusk Stone', key(j));
  nextRound();
  for (const x of [a, b, c]) x.remove();
  const k = add('j_joker'); // sell value $1
  const sv2 = j.sell_cost;
  r = play(hand(['S_A']));
  ok(close(r.total.mult, (1 + sv2 + 4) * 1.3), 'chandelure: + sell value Mult, X1.3 per $1 joker', [sv2, r.total]);
  k.ability.extra_value = 2; k.set_cost();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + sv2 + 4, 'chandelure: no XMult for jokers worth $2+', r.total);
}

// ------------------------------------------------------------- Golett / Golurk
{
  start('GOLETT');
  const j = add('j_poke_golett');
  G.GAME.probabilities.normal = 1e-9;
  hand(['S_2', 'H_3'], { center: 'm_poke_hazard' });
  hand(['D_9']);
  let r = play(hand(['S_A']));
  ok(close(r.total.mult, 1.2 * 1.2), 'golett: X1.2 per held Hazard card', r.total);
  G.GAME.probabilities.normal = 1e9;
  clearHand();
  hand(['D_9', 'C_9']);
  r = play(hand(['S_A']));
  ok(close(r.total.mult, 1.44), 'golett: 1 in 4 for other held cards (certain here)', r.total);
  G.GAME.probabilities.normal = 1;
  const h0 = G.playing_cards.filter((c) => key(c) === 'm_poke_hazard').length;
  nextRound();
  ok(G.playing_cards.filter((c) => key(c) === 'm_poke_hazard').length === h0 + 4, 'golett: 4 Hazards at blind select');
  winRound();
  rounds(4);
  ok(key(j) === 'j_poke_golurk', 'golett -> golurk after 5 rounds', key(j));
  nextRound();
  G.GAME.probabilities.normal = 1e-9;
  hand(['S_2'], { center: 'm_poke_hazard' });
  r = play(hand(['S_A']));
  ok(close(r.total.mult, 1.4), 'golurk: X1.4 per held Hazard', r.total);
}

// ------------------------------------------------------------- Pawniard / Bisharp
{
  start('PAWNIARD');
  const j = add('j_poke_pawniard');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'pawniard: X1 to start', r.total);
  const hm = add('c_hanged_man');
  const faces = hand(['S_K', 'H_Q']);
  act({ type: 'use', id: hm.sort_id, targets: faces.map((c) => c.sort_id) });
  ok(close(j.ability.extra.Xmult, 1.5), 'pawniard: +X0.25 per destroyed face card', j.ability.extra.Xmult);
  clearHand();
  r = play(hand(['S_A']));
  ok(close(r.total.mult, 1.5), 'pawniard: scores its XMult', r.total);
  j.ability.extra.Xmult = 2;
  winRound();
  ok(key(j) === 'j_poke_bisharp' && j.ability.extra.Xmult === 2, 'pawniard -> bisharp at X2 (kept)', j.ability.extra);
  nextRound();
  const [k] = hand(['S_K']);
  r = play([k]);
  ok(!G.playing_cards.includes(k), 'bisharp: a lone face card as the first hand is destroyed');
  ok(close(j.ability.extra.Xmult, 2.25) && j.ability.extra.kings_destroyed === 1, 'bisharp: gains X0.25, counts the King', j.ability.extra);
  ok(close(r.total.mult, 2), 'bisharp: scored X2 before the gain', r.total);
  const [k2] = hand(['H_K']);
  play([k2]);
  ok(G.playing_cards.includes(k2), 'bisharp: only the first hand');
  j.ability.extra.kings_destroyed = 3;
  winRound();
  ok(key(j) === 'j_poke_kingambit', 'bisharp -> kingambit after 3 Kings', key(j));
}

done();
