// Micatro Multiplayer: the ALL MULTIPLAYER CARDS ruleset ('all') — Expanded with every Multiplayer card in the pools, the
// three Expanded bans (SPEEDRUN, Conjoined Joker, Defensive Joker) lifted; the same reworks; The Order on. The cards'
// opponent data / relayed effects work as in Expanded (recorded pvp_opp / pvp_fx); the ruleset is recorded so resume /
// replay rebuild the match exactly.
//   node micatro/tests/pvp_allmp_test.mjs
import { G, P_JOKER_RARITY_POOLS, add_joker, create_card, get_current_pool } from '../js/engine/core.js';
import { newRun, STATE_NAMES } from '../js/engine/run.js';
import { toView } from '../js/engine/view.js';
import { Session, viewChecksum, ReplayStepper } from '../js/engine/session.js';
import { pvpBannedKeys, RULESETS, RULESET_BANS, pvpConfig, pvpRecipeConfig } from '../js/engine/pvp.js';

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const st = () => STATE_NAMES[G.STATE];
const ALL = { lives: 4, pvpStart: 2, deathOnLoss: false, comeback: true, ruleset: 'all', order: true };
const EXP = { ...ALL, ruleset: 'expanded' };
const THREE = ['j_mp_speedrun', 'j_mp_conjoined_joker', 'j_mp_defensive_joker'];
const MP_JOKERS = ['j_mp_defensive_joker', 'j_mp_skip_off', 'j_mp_lets_go_gambling', 'j_mp_speedrun', 'j_mp_conjoined_joker', 'j_mp_penny_pincher', 'j_mp_taxes', 'j_mp_pizza', 'j_mp_pacifist'];
const keys = (pool) => pool.map((c) => c.key);
const flush = () => G.E_MANAGER.flush();
const jm = (card) => card.calculate_joker({ joker_main: true, cardarea: G.jokers, full_hand: [], scoring_hand: [] });
/** n shop rolls on the run's real shop stream (key_append 'sho') -> the keys made. */
const shopRolls = (n) => { const seen = new Set(); for (let i = 0; i < n; i++) { const c = create_card('Joker', G.shop_jokers, null, null, null, null, null, 'sho'); seen.add(c.config.center.key); c.remove(); } return seen; };

// ---- the ruleset: listed, validated, recorded
{
  ok(RULESETS.includes('all'), 'All Multiplayer Cards is a ruleset');
  ok(pvpConfig(ALL).ruleset === 'all', 'pvpConfig keeps it');
  newRun({ seed: 'ALLMP001', pvp: pvpConfig(ALL) });
  ok(pvpRecipeConfig(G.GAME.pvp).ruleset === 'all', 'the recipe records it');
  const lobby = pvpBannedKeys('attrition', 'all');
  ok(lobby.includes('c_justice') && !THREE.some((k) => lobby.includes(k)), 'the lobby lists Justice and none of the three', lobby.filter((k) => /justice|_mp_/.test(k)));
  ok(JSON.stringify(RULESET_BANS.all.silent) === JSON.stringify(RULESET_BANS.expanded.silent), 'the same reworks replace the same vanilla cards as Expanded');
}

// ---- every Multiplayer card is in the pools (Expanded keeps the three out)
{
  newRun({ seed: 'ALLMP001', pvp: pvpConfig(ALL) });
  const pool = [...keys(P_JOKER_RARITY_POOLS[1]), ...keys(P_JOKER_RARITY_POOLS[2])];
  for (const k of MP_JOKERS) ok(pool.includes(k), 'All: the pool has ' + k);
  for (const k of THREE) ok(!G.GAME.banned_keys[k], 'All: ' + k + ' is not banned');
  for (const k of ['c_justice', 'j_ticket', 'j_selzer', 'j_turtle_bean', 'c_ouija', 'j_hanging_chad', 'j_bloodstone']) ok(G.GAME.banned_keys[k], 'All: still bans ' + k + ' (Justice; the vanilla cards a rework replaces)');
  const cur = [...get_current_pool('Joker', 0)[0], ...get_current_pool('Joker', 0.8)[0]];
  for (const k of THREE) ok(cur.includes(k), 'All: ' + k + ' is in the current shop pool');
  ok(G.GAME.pvp.sent && Array.isArray(G.GAME.pvp.sent), 'All: the Expanded state (what this engine sends) is set up');
  // obtainable: the run's own shop stream offers each of the three (seeded: the same rolls every time)
  const seen = shopRolls(1500);
  for (const k of THREE) ok(seen.has(k), 'All: the shop offers ' + k);
  newRun({ seed: 'ALLMP001', pvp: pvpConfig(EXP) });
  const cur2 = [...get_current_pool('Joker', 0)[0], ...get_current_pool('Joker', 0.8)[0]];
  const seen2 = shopRolls(1500);
  ok(!THREE.some((k) => cur2.includes(k) || seen2.has(k)), 'Expanded (unchanged): the three are never offered', THREE.filter((k) => seen2.has(k)));
}

// ---- the three jokers work, fed by the recorded opponent data / relayed effects
{
  const s = new Session();
  s.start({ seed: 'ALLMP002', back: 'b_red', stake: 1, pvp: ALL, engineRev: 1 });
  const A = (a) => s.act(a);
  const P = () => G.GAME.pvp;
  const weak = () => { A({ type: 'highlight', ids: [G.hand.cards[G.hand.cards.length - 1].sort_id] }); A({ type: 'play' }); };
  const dj = add_joker('j_mp_defensive_joker'), cj = add_joker('j_mp_conjoined_joker'), sr = add_joker('j_mp_speedrun');
  flush();
  // Defensive Joker: +125 Chips per life below the Nemesis
  ok(A({ type: 'pvp_opp', o: { lives: 4 } }).ok, 'All: pvp_opp is legal (Expanded actions are on)');
  ok(!jm(dj), 'Defensive Joker: level on lives -> nothing');
  P().lives = 3;
  ok((jm(dj) || {}).chip_mod === 125, 'Defensive Joker: a life behind -> +125 Chips', jm(dj));
  P().lives = 4;
  // to the ante-2 Nemesis (skip everything)
  for (let i = 0; i < 6 && !(G.GAME.round_resets.ante === 2 && G.GAME.blind_on_deck === 'Boss'); i++) {
    if (st() === 'BLIND_SELECT') A({ type: 'skip_blind' });
    if (/PACK/.test(st())) A({ type: 'skip_booster' });
    if (st() === 'BLIND_SELECT' && G.GAME.blind_on_deck === 'Boss') { A({ type: 'select_blind' }); for (let k = 0; k < 9 && st() === 'SELECTING_HAND'; k++) weak(); A({ type: 'cash_out' }); A({ type: 'next_round' }); }
  }
  ok(G.GAME.round_resets.ante === 2 && G.GAME.blind_on_deck === 'Boss', 'at the ante-2 Nemesis', [G.GAME.round_resets.ante, G.GAME.blind_on_deck, st()]);
  // SPEEDRUN: the server's word (both READY within 30 s) -> a Spectral
  const nc = G.consumeables.cards.length;
  const n = (P().fxin || 0) + 1;
  ok(A({ type: 'pvp_fx', n, k: 'speedrun' }).ok && G.consumeables.cards.length === nc + 1 && G.consumeables.cards.at(-1).ability.set === 'Spectral', 'SPEEDRUN: the relayed speedrun makes a Spectral', [nc, G.consumeables.cards.length]);
  ok(A({ type: 'pvp_start_blind' }).ok && G.GAME.pvp_blind, 'in the Nemesis');
  // Conjoined Joker: X(1 + 0.5 per Nemesis hand left), in the PvP Blind
  A({ type: 'pvp_opp', o: { hands: 2 } });
  ok((jm(cj) || {}).Xmult_mod === 2, 'Conjoined Joker: the Nemesis has 2 hands left -> X2', jm(cj));
  ok(sr.config.center.key === 'j_mp_speedrun', 'SPEEDRUN held');
  weak();
  A({ type: 'pvp_outcome', result: 'lose', lives: 3 });
  ok(P().lives === 3, 'a lost Nemesis round: 3 lives');
  ok((jm(dj) || {}).chip_mod === 125, 'Defensive Joker: after losing the round (4 vs 3) -> +125 Chips', jm(dj));
}
{
  const s = new Session();
  s.start({ seed: 'ALLMP003', back: 'b_red', stake: 1, pvp: ALL, engineRev: 1 });
  const A = (a) => s.act(a);
  const weak = () => { A({ type: 'highlight', ids: [G.hand.cards[G.hand.cards.length - 1].sort_id] }); A({ type: 'play' }); };
  A({ type: 'pvp_opp', o: { lives: 4, hands: 3 } });
  A({ type: 'select_blind' }); for (let k = 0; k < 9 && st() === 'SELECTING_HAND'; k++) weak();
  A({ type: 'cash_out' }); A({ type: 'reroll_shop' }); A({ type: 'next_round' });
  A({ type: 'pvp_fx', n: 1, k: 'speedrun' });
  ok(s.recipe.pvp.ruleset === 'all' && s.recipe.pvp.order === true, 'the recipe records All Multiplayer Cards + The Order', s.recipe.pvp);
  const cs = viewChecksum(toView());
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(!r.stoppedAt && viewChecksum(toView()) === cs && G.GAME.pvp.ruleset === 'all', 'resume rebuilds an All Multiplayer Cards match exactly', r.stoppedAt);
  const sc = new ReplayStepper(JSON.parse(JSON.stringify(s.recipe))).scan();
  ok(!sc.end.error && sc.end.checksum === cs, 'the replay re-simulates it exactly');
}

console.log(`pvp all multiplayer cards: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
