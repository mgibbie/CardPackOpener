// Shared helpers for the Pokermon tests (not a suite itself: the runner only picks *_test.mjs).
//   import { T, start, hand, play, add, endRound, ... } from './poke_helpers.mjs';
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, add_joker, create_playing_card } from '../../js/engine/core.js';
import { newRun, act, STATES, STATE_NAMES } from '../../js/engine/run.js';
import '../../mods/pokermon/index.js';

/** Tiny assert counter: ok(cond, msg, extra?) prints FAIL lines; done() exits 1 on failure. */
export function T() {
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
  const done = () => { console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
  return { ok, done, get fails() { return fail; } };
}

/** New Pokermon run, blind selected, hand emptied (cards go back to the deck). */
export function start(seed = 'POKE', options = {}, extra = {}) {
  newRun({ seed, back: 'b_red', mods: ['pokermon', ...(extra.mods || [])], modOptions: { pokermon: options } });
  // A harmless boss (The Wall only raises the target) so later rounds don't debuff test hands.
  G.FORCE_BOSS = 'bl_wall';
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  if (extra.noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
export function clearHand() {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  G.hand.highlighted.length = 0;
}
/** Put playing cards in hand: hand(['S_A', 'H_K'], {center: 'm_glass'}). */
export function hand(keys, opts = {}) {
  return keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[opts.center || 'c_base'] }, G.hand));
}
/** Add a joker (or consumable) by key; flushes the queue so add_to_deck effects land. */
export function add(key, edition) {
  const c = add_joker(key, edition);
  G.E_MANAGER.flush();
  return c;
}
/** Play exactly these hand cards; -> {res, total:{chips,mult,total}, events}. */
export function play(cards, { keepChips } = {}) {
  // Keep the round alive: no accidental win (chips reset) and never the last hand.
  if (!keepChips) { G.GAME.chips = 0; if (G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15; }
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  const total = res.events.find((e) => e.type === 'hand_total');
  return { res, total, events: res.events };
}
/** Win the round with the next play (forces the chips) and land in ROUND_EVAL. */
export function winRound(cards) {
  G.GAME.chips = G.GAME.blind.chips;
  if (!cards) { clearHand(); cards = hand(['S_2']); }
  const r = play(cards, { keepChips: true });
  return r;
}
/** Win, cash out, go to the next blind and select it (clears the hand). */
export function nextRound() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  act({ type: 'select_blind' });
  clearHand();
}
export const state = () => STATE_NAMES[G.STATE];
export const statusMsgs = (events) => events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);
export { G, P_CENTERS, P_CARDS, act, STATES };
