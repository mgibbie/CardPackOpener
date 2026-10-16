// Shared helpers for the Olympus / Inscrybed / Omerta Deck tests (not a suite: no _test suffix).
// Like poke_helpers.mjs, but without loading Pokermon.
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, add_joker, create_playing_card } from '../../js/engine/core.js';
import { newRun, act, STATES } from '../../js/engine/run.js';
import { describe } from '../../js/engine/describe.js';

export function T() {
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
  const done = () => { console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
  return { ok, done };
}
export function clearHand() {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  G.hand.highlighted.length = 0;
}
/** New run with `mods`, The Wall as boss, blind selected (unless noBlind), empty hand. */
export function start(seed, mods, { back = 'b_red', noBlind = false } = {}) {
  newRun({ seed, back, mods });
  G.FORCE_BOSS = 'bl_wall';
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  G.E_MANAGER.flush();
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
export function hand(keys, center = 'c_base') {
  return keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center] }, G.hand));
}
export function add(key, edition) { const c = add_joker(key, edition); G.E_MANAGER.flush(); return c; }
export function play(cards, { keepChips } = {}) {
  if (!keepChips) { G.GAME.chips = 0; if (G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15; }
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  return { res, total: res.events.find((e) => e.type === 'hand_total'), events: res.events };
}
export function discard(cards) {
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  return act({ type: 'discard' });
}
export function winRound() {
  G.GAME.chips = G.GAME.blind.chips;
  clearHand();
  return play(hand(['S_2']), { keepChips: true });
}
export function nextRound() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  act({ type: 'select_blind' });
  clearHand();
}
export const statusMsgs = (events) => events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);
/** describe() lines of a live card, and whether any #n# placeholder is left unfilled. */
export function descOk(card) {
  const d = describe(card);
  return { d, ok: !!d && d.lines.length > 0 && !d.lines.some((l) => /#\d+#/.test(l)) };
}
export { G, P_CENTERS, P_CARDS, act, STATES };
