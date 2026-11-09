// Micatro Multiplayer stage 7b: the EXPANDED ruleset (engine/pvp_expanded.js) — the 9 Multiplayer jokers, the Asteroid, the
// reworks (Golden Ticket, Seltzer, Turtle Bean, Ouija), the bans, and the opponent's data / relayed effects as RECORDED
// actions (pvp_opp, pvp_fx) with the effects this engine sends (G.GAME.pvp.sent); resume / replay exact.
//   node micatro/tests/pvp_expanded_test.mjs
import { G, P_CENTERS, P_JOKER_RARITY_POOLS, P_CENTER_POOLS, add_joker, get_current_pool } from '../js/engine/core.js';
import { newRun, act, STATE_NAMES } from '../js/engine/run.js';
import { toView } from '../js/engine/view.js';
import { Session, viewChecksum, ReplayStepper } from '../js/engine/session.js';
import { pvpBannedKeys, RULESETS } from '../js/engine/pvp.js';
import { describe } from '../js/engine/describe.js';

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const st = () => STATE_NAMES[G.STATE];
const EXP = { lives: 4, pvpStart: 2, deathOnLoss: false, comeback: true, ruleset: 'expanded', order: true };
const flush = () => G.E_MANAGER.flush();
const keys = (pool) => pool.map((c) => c.key);
const jm = (card, extra = {}) => card.calculate_joker({ joker_main: true, cardarea: G.jokers, full_hand: [], scoring_hand: [], ...extra });

// ---- the ruleset: content, bans, reworks
{
  ok(RULESETS.includes('expanded'), 'Expanded is a ruleset');
  newRun({ seed: 'EXPAND01', pvp: EXP });
  const pool = [...keys(P_JOKER_RARITY_POOLS[1]), ...keys(P_JOKER_RARITY_POOLS[2])];
  for (const k of ['j_mp_skip_off', 'j_mp_lets_go_gambling', 'j_mp_penny_pincher', 'j_mp_taxes', 'j_mp_pizza', 'j_mp_pacifist', 'j_mp_ticket', 'j_mp_seltzer', 'j_mp_turtle_bean', 'j_mp_hanging_chad', 'j_mp_bloodstone']) ok(pool.includes(k), 'Expanded pool has ' + k);
  for (const k of ['j_mp_speedrun', 'j_mp_conjoined_joker', 'j_mp_defensive_joker', 'c_justice', 'j_ticket', 'j_selzer', 'j_turtle_bean', 'c_ouija', 'j_hanging_chad', 'j_bloodstone']) ok(G.GAME.banned_keys[k], 'Expanded bans ' + k);
  ok(pvpBannedKeys('attrition', 'expanded').includes('j_mp_speedrun') && !pvpBannedKeys('attrition', 'expanded').includes('j_selzer'), 'the lobby lists the loud bans only');
  ok(keys(P_CENTER_POOLS.Planet).includes('c_mp_asteroid') && keys(P_CENTER_POOLS.Spectral).includes('c_mp_ouija'), 'the Asteroid and the reworked Ouija are in their pools');
  ok(P_CENTERS.j_mp_ticket.rarity === 2 && P_CENTERS.j_mp_ticket.cost === 6, 'Golden Ticket: Uncommon $6');
  const sel = add_joker('j_mp_seltzer'), tb = add_joker('j_mp_turtle_bean'); flush();
  ok(sel.ability.extra === 8 && sel.ability.name === 'Seltzer', 'Seltzer: 8 hands (the vanilla card\'s rules)');
  ok(tb.ability.extra.h_size === 4, 'Turtle Bean: +4 hand size', tb.ability.extra);
  ok(G.hand.config.card_limit === 8 + 4, 'Turtle Bean adds 4 hand size', G.hand.config.card_limit);
  const pc = G.playing_cards[0];
  ok(((sel.calculate_joker({ repetition: true, cardarea: G.play, other_card: pc, scoring_hand: [pc], full_hand: [pc] }) || {}).repetitions) === 1, 'Seltzer (Expanded) retriggers played cards (the vanilla rules run)');
  const gt = add_joker('j_mp_ticket'); pc.set_ability(P_CENTERS.m_gold);
  ok(((gt.calculate_joker({ individual: true, cardarea: G.play, other_card: pc, scoring_hand: [pc], full_hand: [pc] }) || {}).dollars) === 4, 'Golden Ticket (Expanded): $4 per scored Gold card');
  ok(get_current_pool('Joker', 0)[0].includes('UNAVAILABLE') && !get_current_pool('Joker', 0)[0].includes('j_mp_penny_pincher'), 'Penny Pincher is not in the shop before the first PvP Blind');
  ok(describe(sel).badges.some((b) => b && b.text === 'Balanced'), 'a reworked card wears the Balanced badge');
  ok(describe(add_joker('j_mp_pacifist')).badges.some((b) => b && b.text === 'Multiplayer'), 'a Multiplayer card wears the Multiplayer badge');
  newRun({ seed: 'EXPAND01', pvp: { ...EXP, ruleset: 'balanced' } });
  ok(!keys(P_JOKER_RARITY_POOLS[1]).includes('j_mp_pacifist') && !G.GAME.pvp.sent, 'a Balanced match: no Multiplayer cards, no Expanded state');
}

// ---- the jokers
{
  newRun({ seed: 'EXPJOK01', pvp: EXP });
  const P = G.GAME.pvp;
  // Defensive Joker: +125 Chips per life below the Nemesis (75 at Purple Stake+)
  const dj = add_joker('j_mp_defensive_joker');
  ok(act({ type: 'pvp_opp', o: { lives: 4 } }).ok, 'pvp_opp is a legal action');
  P.lives = 2;
  ok((jm(dj) || {}).chip_mod === 250, 'Defensive Joker: 2 lives behind -> +250 Chips', jm(dj));
  G.GAME.stake = 6;
  ok((jm(dj) || {}).chip_mod === 150, 'Defensive Joker: +75 per life at Purple Stake', jm(dj));
  G.GAME.stake = 1; P.lives = 4;
  ok(!jm(dj), 'Defensive Joker: level -> nothing');
  // Pacifist: X10 outside PvP rounds only
  const pa = add_joker('j_mp_pacifist');
  ok((jm(pa) || {}).Xmult_mod === 10, 'Pacifist: X10 Mult in a normal blind');
  G.GAME.pvp_blind = true;
  ok(!jm(pa), 'Pacifist: nothing in a PvP Blind');
  // Conjoined Joker: X(1 + 0.5 per Nemesis hand left), max X3, PvP only
  const cj = add_joker('j_mp_conjoined_joker');
  act({ type: 'pvp_opp', o: { hands: 2 } });
  ok((jm(cj) || {}).Xmult_mod === 2, 'Conjoined Joker: 2 hands left -> X2', jm(cj));
  act({ type: 'pvp_opp', o: { hands: 7 } });
  ok((jm(cj) || {}).Xmult_mod === 3, 'Conjoined Joker: capped at X3');
  G.GAME.pvp_blind = undefined;
  ok(!jm(cj), 'Conjoined Joker: nothing outside a PvP Blind');
  // Taxes: +4 Mult per card the Nemesis sold this ante, on selecting a PvP Blind (antes up to pvpStart count the earlier ones)
  const tx = add_joker('j_mp_taxes');
  G.GAME.round_resets.ante = 2;
  act({ type: 'pvp_opp', o: { sells: { 1: 2, 2: 3 } } });
  tx.calculate_joker({ setting_blind: true, blind: G.GAME.blind });
  ok(tx.ability.extra.mult === 0, 'Taxes: a normal blind gains nothing');
  G.GAME.pvp_blind = true;
  tx.calculate_joker({ setting_blind: true, blind: G.GAME.blind });
  ok(tx.ability.extra.mult === 20, 'Taxes: 5 cards sold (ante 2 + ante 1 while ante <= the PvP start) -> +20 Mult', tx.ability.extra);
  ok((jm(tx) || {}).mult_mod === 20, 'Taxes: +20 Mult when scoring');
  G.GAME.round_resets.ante = 3;
  tx.calculate_joker({ setting_blind: true, blind: G.GAME.blind });
  ok(tx.ability.extra.mult === 20, 'Taxes: ante 3, nothing sold this ante -> +0');
  G.GAME.pvp_blind = undefined;
  // Skip-Off: +1 hand / +1 discard per blind skipped more than the Nemesis
  const so = add_joker('j_mp_skip_off');
  G.GAME.skips = 3; act({ type: 'pvp_opp', o: { skips: 1 } });
  const h0 = G.GAME.current_round.hands_left, d0 = G.GAME.current_round.discards_left;
  so.calculate_joker({ setting_blind: true, blind: G.GAME.blind }); flush();
  ok(G.GAME.current_round.hands_left === h0 + 2 && G.GAME.current_round.discards_left === d0 + 2, 'Skip-Off: 2 skips ahead -> +2 hands, +2 discards');
  // Let's Go Gambling: X4 + $10 (1 in 4); in a PvP Blind a misfire (1 in 4) sends the Nemesis $10
  const lg = add_joker('j_mp_lets_go_gambling');
  let hits = 0, misfires = 0;
  G.GAME.pvp_blind = true;
  for (let i = 0; i < 200; i++) { const d = G.GAME.dollars; const r = jm(lg); flush(); if (r && r.Xmult_mod === 4) { hits++; ok(G.GAME.dollars === d + 10, 'LGG: +$10 with the X4'); } }
  misfires = P.sent.filter((x) => x.k === 'lgg').length;
  ok(hits > 25 && hits < 80 && misfires > 25 && misfires < 80, 'LGG: ~1 in 4 hits and ~1 in 4 misfires in a PvP Blind', { hits, misfires });
  G.GAME.pvp_blind = undefined;
  const before = P.sent.length;
  for (let i = 0; i < 40; i++) jm(lg);
  ok(P.sent.length === before, 'LGG: no misfires outside a PvP Blind');
}

// ---- relayed effects (pvp_fx), Penny Pincher, Pizza, Asteroid, SPEEDRUN — played for real through a recorded session
{
  const s = new Session();
  s.start({ seed: 'EXPFX001', back: 'b_red', stake: 1, pvp: EXP, engineRev: 1 });
  const A = (a) => s.act(a);
  const P = () => G.GAME.pvp;
  const weak = () => { A({ type: 'highlight', ids: [G.hand.cards[G.hand.cards.length - 1].sort_id] }); A({ type: 'play' }); };
  const lose = () => { A({ type: 'select_blind' }); for (let i = 0; i < 9 && st() === 'SELECTING_HAND'; i++) weak(); };
  ok(!A({ type: 'pvp_fx', n: 2, k: 'lgg' }).ok, 'pvp_fx: out of order -> refused');
  ok(!A({ type: 'pvp_fx', n: 1, k: 'boom' }).ok, 'pvp_fx: unknown kind -> refused');
  const d0 = G.GAME.dollars;
  ok(A({ type: 'pvp_fx', n: 1, k: 'lgg' }).ok && G.GAME.dollars === d0 + 10 && P().fxin === 1, 'pvp_fx lgg: +$10 (the Nemesis misfired)');
  // Small: a shop with spending, Big: skipped -> the spent list, the pincher index
  lose(); A({ type: 'cash_out' });
  ok(st() === 'SHOP', 'in the shop');
  G.GAME.dollars = 50;
  A({ type: 'reroll_shop' }); A({ type: 'reroll_shop' });
  A({ type: 'next_round' });
  ok(P().spent.length === 1 && P().spent[0] === 11, 'the shop\'s spending is logged ($5 + $6 rerolls)', P().spent);
  A({ type: 'skip_blind' });
  if (/PACK/.test(st())) A({ type: 'skip_booster' });
  ok(P().spent.length === 2 && P().spent[1] === 0, 'a skip logs $0');
  // the opponent's spending reaches Penny Pincher at a cash-out (its index: -3, +1 per round end and per skip)
  A({ type: 'pvp_opp', o: { spent: [9, 0, 30, 12] } });
  // Pizza from the Nemesis: +1 discard this ante
  const disc = G.GAME.round_resets.discards;
  ok(A({ type: 'pvp_fx', n: 2, k: 'pizza' }).ok && G.GAME.round_resets.discards === disc + 1, 'pvp_fx pizza: +1 discard for the rest of the ante');
  // the Boss (ante 1), lost: ante 2 -> the Pizza discard is taken back
  lose(); A({ type: 'cash_out' }); A({ type: 'next_round' });
  ok(G.GAME.round_resets.ante === 2 && G.GAME.round_resets.discards === disc, 'a new ante takes the Pizza discard back', [G.GAME.round_resets.ante, G.GAME.round_resets.discards, disc]);
  // Asteroid: used -> stored; it flies at the next PvP Blind start; an incoming one lowers this player's best hand
  G.GAME.hands.Flush.level = 3; G.GAME.hands.Pair.level = 3;
  ok(A({ type: 'pvp_fx', n: 3, k: 'asteroid' }).ok && G.GAME.hands.Flush.level === 2 && G.GAME.hands.Pair.level === 3, 'pvp_fx asteroid: -1 level on the best hand (a tie goes to the higher hand)');
  const ast = add_joker('c_mp_asteroid');
  ok(A({ type: 'use', id: ast.sort_id }).ok && P().asteroids === 1, 'Asteroid used: stored for the next PvP Blind');
  // Penny Pincher + Pizza owned
  add_joker('j_mp_penny_pincher'); add_joker('j_mp_pizza');
  lose(); A({ type: 'cash_out' }); A({ type: 'next_round' });
  lose(); A({ type: 'cash_out' });
  const pp = G.GAME.round_eval && G.GAME.round_eval.rows.find((r) => r.card || /j_mp_penny_pincher/.test(JSON.stringify(r)));
  ok(P().pidx === 2 && pp && pp.dollars === Math.floor(0 / 3) || P().pidx === 2, 'Penny Pincher\'s index follows the rounds + the skip', P().pidx);
  A({ type: 'next_round' });
  ok(G.GAME.blind_on_deck === 'Boss', 'at the ante 2 Nemesis');
  ok(A({ type: 'pvp_start_blind' }).ok && P().asteroids === 0 && P().sent.map((x) => x.k).join() === 'asteroid' && P().pincher, 'the Nemesis starts: the Asteroid flies (sent), Penny Pincher unlocks');
  weak();
  // SPEEDRUN (the server's word): needs a SPEEDRUN joker + room
  add_joker('j_mp_speedrun');
  const nc = G.consumeables.cards.length;
  ok(A({ type: 'pvp_fx', n: 4, k: 'speedrun' }).ok && G.consumeables.cards.length === nc + 1 && G.consumeables.cards.at(-1).ability.set === 'Spectral', 'pvp_fx speedrun: each SPEEDRUN makes a Spectral');
  while (st() === 'SELECTING_HAND') weak();
  const disc2 = G.GAME.round_resets.discards;
  A({ type: 'pvp_outcome', result: 'lose', lives: 3 });
  ok(!G.jokers.cards.some((j) => j.config.center.key === 'j_mp_pizza') && G.GAME.round_resets.discards === disc2 + 2 && P().sent.map((x) => x.k).join() === 'asteroid,pizza', 'Pizza: eaten at the end of the PvP Blind: +2 discards, +1 sent to the Nemesis', [G.GAME.round_resets.discards, disc2, P().sent]);
  const v = toView().pvp;
  ok(v.sent.join() === 'asteroid,pizza' && v.fxin === 4 && v.opp.spent.length === 4, 'the view carries what is sent / received');
}
// ---- a match played only through recorded actions resumes / replays exactly
{
  const s = new Session();
  s.start({ seed: 'EXPREC01', back: 'b_red', stake: 1, pvp: EXP, engineRev: 1 });
  const A = (a) => s.act(a);
  const weak = () => { A({ type: 'highlight', ids: [G.hand.cards[G.hand.cards.length - 1].sort_id] }); A({ type: 'play' }); };
  const lose = () => { A({ type: 'select_blind' }); for (let i = 0; i < 9 && st() === 'SELECTING_HAND'; i++) weak(); A({ type: 'cash_out' }); G.GAME.dollars; A({ type: 'reroll_shop' }); A({ type: 'next_round' }); };
  A({ type: 'pvp_fx', n: 1, k: 'lgg' }); A({ type: 'pvp_opp', o: { lives: 4, skips: 1, sells: { 1: 2 }, spent: [5] } });
  lose(); A({ type: 'pvp_fx', n: 2, k: 'pizza' }); lose(); lose();
  A({ type: 'pvp_fx', n: 3, k: 'asteroid' }); lose(); lose();
  A({ type: 'pvp_start_blind' }); A({ type: 'pvp_opp', o: { hands: 3 } }); weak(); A({ type: 'pvp_outcome', result: 'win', lives: 4 });
  ok(s.recipe.actions.filter((a) => /^pvp_(opp|fx)$/.test(a.type)).length === 5, 'the opponent data and effects are recorded');
  const cs = viewChecksum(toView());
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(!r.stoppedAt && viewChecksum(toView()) === cs, 'resume rebuilds an Expanded match exactly', r.stoppedAt);
  const sc = new ReplayStepper(JSON.parse(JSON.stringify(s.recipe))).scan();
  ok(!sc.end.error && sc.end.checksum === cs, 'the replay re-simulates it exactly');
}

// ---- the reworked Ouija: destroys 3, the rest one rank, no hand-size loss
{
  newRun({ seed: 'EXPOUIJ1', pvp: EXP });
  act({ type: 'select_blind' });
  const hs = G.hand.config.card_limit, n = G.hand.cards.length, total = G.playing_cards.length;
  const o = add_joker('c_mp_ouija');
  const r = act({ type: 'use', id: o.sort_id });
  ok(r.ok, 'Ouija used', r.error);
  const ranks = new Set(G.hand.cards.map((c) => c.base.value));
  ok(G.hand.cards.length === n - 3 && G.playing_cards.length === total - 3 && ranks.size === 1 && G.hand.config.card_limit === hs, 'Ouija (Expanded): 3 destroyed, the rest one rank, hand size kept', { left: G.hand.cards.length, ranks: [...ranks], hs: G.hand.config.card_limit });
}

console.log(`pvp expanded: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
