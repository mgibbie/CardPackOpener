// A small deterministic bot that plays a whole Micatro run through a Session (the live path) and
// records {view, events} after every accepted action — the ground truth a replay must reproduce.
// Shared by micatro/tests/replay_test.mjs and overworld/tests/micatro_replay_test.mjs (which uses it
// to make a multi-ante recipe for the browser viewer). Not a test itself.
import { G } from '../js/engine/core.js';
import { STATES, get_poker_hand_info } from '../js/engine/run.js';
import { Session } from '../js/engine/session.js';

function botRng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function bestHand() {
  const cards = G.hand.cards; let best = null, bs = -1; const n = Math.min(cards.length, 10);
  for (let mask = 1; mask < (1 << n); mask++) {
    let bits = 0; for (let m = mask; m; m &= m - 1) bits++;
    if (bits > 5) continue;
    const sel = cards.filter((_, i) => mask & (1 << i));
    const info = get_poker_hand_info(sel); if (info.text === 'NULL') continue;
    const h = G.GAME.hands[info.text];
    const s = (h.chips + info.scoring_hand.reduce((a, c) => a + c.get_chip_bonus(), 0)) * h.mult - bits * 0.01;
    if (s > bs) { bs = s; best = sel; }
  }
  return (best || cards.slice(0, 1)).map((c) => c.sort_id);
}

/** Play a whole run. opts: seed (bot), endless (continue after a win), maxSteps, weak (single cards),
 *  weakAfterWin (play single cards once in Endless, so the run ends soon). */
export function playRun(startOpts, { seed = 1, endless = false, maxSteps = 900, weak = false, weakAfterWin = false } = {}) {
  const r = botRng(seed);
  const s = new Session();
  const startEvents = s.start(startOpts);
  const frames = [{ view: JSON.stringify(s.view()), events: JSON.stringify(startEvents) }];
  const tried = new Set();
  const doAct = (a) => {
    const res = s.act(a);
    if (res.ok) frames.push({ view: JSON.stringify(s.view()), events: JSON.stringify(res.events) });
    return res.ok;
  };
  let steps = 0, wentEndless = false, wonAt = null;
  while (!s.over && steps++ < maxSteps) {
    const S = G.STATE;
    if (G.GAME.won && wonAt == null) wonAt = s.recipe.actions.length;
    if (G.GAME.won && !G.GAME.endless && S === STATES.ROUND_EVAL) { if (!endless) break; wentEndless = doAct({ type: 'endless' }); continue; }
    if (S === STATES.BLIND_SELECT) {
      if (G.GAME.blind_on_deck !== 'Boss' && r() < 0.1 && doAct({ type: 'skip_blind' })) continue;
      doAct({ type: 'select_blind' });
    } else if (S === STATES.SELECTING_HAND) {
      if (G.consumeables.cards.length && r() < 0.3) {
        const c = G.consumeables.cards[0];
        const n = (c.ability.consumeable && c.ability.consumeable.max_highlighted) || 0;
        const targets = G.hand.cards.slice(0, n).map((x) => x.sort_id);
        if (!doAct({ type: 'use', id: c.sort_id, targets })) doAct({ type: 'sell', id: c.sort_id });
        continue;
      }
      const ids = weak || (weakAfterWin && G.GAME.endless) ? G.hand.cards.slice(0, 1).map((c) => c.sort_id) : bestHand();
      if (!weak && !(weakAfterWin && G.GAME.endless) && G.GAME.current_round.discards_left > 0 && r() < 0.2) {
        const keep = new Set(ids);
        const toss = G.hand.cards.filter((c) => !keep.has(c.sort_id)).slice(0, 3).map((c) => c.sort_id);
        if (toss.length && doAct({ type: 'highlight', ids: toss }) && doAct({ type: 'discard' })) continue;
      }
      if (r() < 0.2) doAct({ type: 'sort_hand', by: r() < 0.5 ? 'rank' : 'suit' });
      doAct({ type: 'highlight', ids });
      doAct({ type: 'play' });
    } else if (S === STATES.ROUND_EVAL) doAct({ type: 'cash_out' });
    else if (S === STATES.SHOP) {
      const c = [...G.shop_jokers.cards, ...G.shop_booster.cards].find((x) => !tried.has(x.sort_id) && x.cost <= G.GAME.dollars &&
        (x.ability.set !== 'Joker' || G.jokers.cards.length < G.jokers.config.card_limit));
      if (c) { tried.add(c.sort_id); if (doAct({ type: 'buy', id: c.sort_id })) continue; }
      if (G.jokers.cards.length > 1 && r() < 0.1 && doAct({ type: 'reorder', area: 'jokers', ids: G.jokers.cards.map((x) => x.sort_id).reverse() })) continue;
      doAct({ type: 'next_round' });
    } else {
      const pc = G.pack_cards.cards[0];
      if (pc && r() < 0.7) {
        const n = (pc.ability.consumeable && pc.ability.consumeable.max_highlighted) || 0;
        if (doAct({ type: 'use', id: pc.sort_id, targets: G.hand.cards.slice(0, n).map((x) => x.sort_id) })) continue;
      }
      doAct({ type: 'skip_booster' });
    }
  }
  return { session: s, recipe: JSON.parse(JSON.stringify(s.recipe)), frames, finalView: s.view(), wentEndless, wonAt };
}
