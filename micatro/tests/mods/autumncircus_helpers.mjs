// Shared helpers for the Þe Autumn Circus / AutumnMoodMechanics suites (autumnmood_test.mjs, autumncircus_test.mjs,
// autumncircus_jokers_{a,b}_test.mjs, autumncircus_oddities_test.mjs, autumncircus_consumables_test.mjs).
// Every effect is fired through real act() plays; numbers are the mod's own.
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, add_joker, create_playing_card } from '../../js/engine/core.js';
import { newRun, act, STATES } from '../../js/engine/run.js';
import { loadMods } from '../../js/mods/index.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import * as AMM from '../../mods/autumnmood/api.js';

await loadMods(['autumncircus', 'morefluff']);

export const T = { pass: 0, fail: 0 };
export const ok = (c, m, x) => { if (c) T.pass++; else { T.fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
export const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
export const flush = () => G.E_MANAGER.flush();
export function done() { console.log(`${T.pass} passed, ${T.fail} failed`); process.exit(T.fail ? 1 : 0); }

/** A fresh run with Þe Autumn Circus on (or `mods`), the Wall forced as boss, blind selected and hand emptied. */
export function start(seed, { noBlind = false, mods = ['autumncircus'], back = 'b_red', boss = 'bl_wall', stake, modOptions } = {}) {
  newRun({ seed, back, mods, modOptions, stake });
  if (boss) { G.FORCE_BOSS = boss; G.GAME.round_resets.blind_choices.Boss = boss; }
  flush();
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
/** Put every hand card back in the deck. */
export function clearHand() {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  G.hand.highlighted.length = 0;
}
/** New playing cards in hand: keys like 'S_A', 'H_T'; optional enhancement center key. */
export const hand = (keys, center) => keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.hand));
export const add = (key, edition) => { const c = add_joker(key, edition); flush(); return c; };
export const clearJokers = () => { for (const j of G.jokers.cards.slice()) j.remove(); flush(); };
export const clearConsumables = () => { for (const c of G.consumeables.cards.slice()) c.remove(); flush(); };
/** Play these cards without ending the round (hands_left kept >= `left` before the play). */
export function play(cards, { left = 2, keepChips = false, keepHand = false } = {}) {
  if (!keepChips) { G.GAME.chips = 0; G.GAME.blind.chips = 1e15; }
  G.GAME.current_round.hands_left = Math.max(G.GAME.current_round.hands_left, left);
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  const total = res.events.find((e) => e.type === 'hand_total');
  if (!keepHand) clearHand();
  return { res, total, events: res.events, ok: res.ok };
}
/** Discard these hand cards. */
export function discard(cards) {
  G.GAME.current_round.discards_left = Math.max(G.GAME.current_round.discards_left, 1);
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  return act({ type: 'discard' });
}
/** Use a consumable on hand targets (and optional joker targets). */
export const use = (c, targets = [], joker_targets) => act({ type: 'use', id: c.sort_id, targets: targets.map((x) => x.sort_id), joker_targets: joker_targets && joker_targets.map((x) => x.sort_id) });
/** Win the current round with one played card. */
export function winRound() {
  clearHand();
  G.GAME.chips = G.GAME.blind.chips;
  G.GAME.current_round.hands_left = Math.max(1, G.GAME.current_round.hands_left);
  act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) });
  return act({ type: 'play' });
}
/** Finish this round (win), cash out, leave the shop and select the next blind. */
export function nextRound() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  act({ type: 'select_blind' });
  clearHand();
}
/** Win the round and stop in the shop. */
export function toShop() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
}
/** Destroy a playing card the way a Glass break / Hanged Man does (start_dissolve -> Card:remove -> graveyard). */
export const destroy = (c) => { c.start_dissolve(); flush(); };
export const msgs = (events) => events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);
export const tot = (r) => r.total && [r.total.chips, r.total.mult, r.total.total];
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Every #n# placeholder filled? */
export const filled = (d) => d && !(d.lines || []).some((l) => /#\d+#/.test(l)) && !(d.info || []).some((i) => (i.lines || []).some((l) => /#\d+#/.test(l)));
export { G, P_CENTERS, P_CARDS, act, STATES, describe, describeCenter, AMM };
