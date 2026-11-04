// A small deterministic bot that plays a Micatro run for its BOOSTER PACKS: rich (a custom deck's starting
// dollars), it buys every pack the shop offers, skips every blind it may (skip tags open packs straight from
// the blind choice) and takes the first card of each pack. Returns the recipe + where each pack opened.
// Used by overworld/tests/micatro_replay_pack_test.mjs (a replay must show the pack screen, as live play does).
// Not a test itself.
import { G } from '../js/engine/core.js';
import { STATES } from '../js/engine/run.js';
import { Session } from '../js/engine/session.js';

export const PACK_STATES = ['TAROT_PACK', 'PLANET_PACK', 'SPECTRAL_PACK', 'STANDARD_PACK', 'BUFFOON_PACK', 'MOD_PACK', 'MOD_PACK_HAND'];
export const RICH_DECK = { name: 'Rich', params: { dollars: 300, blind_scaling: 0.05 } };
const stateName = () => Object.keys(STATES).find((k) => STATES[k] === G.STATE);

/** -> {recipe, opened: [{index (actions done once it is open), via (the action), from (state), state, kind}]} */
export function packRun(startOpts, { maxSteps = 400, antes = 8 } = {}) {
  const s = new Session();
  s.start(startOpts);
  const opened = [];
  let steps = 0, rerolled = false;
  const doAct = (a) => {
    const before = stateName();
    const r = s.act(a);
    if (r.ok) {
      const after = stateName();
      if (PACK_STATES.includes(after) && !PACK_STATES.includes(before)) opened.push({ index: s.recipe.actions.length, via: a.type, from: before, state: after, kind: s.view().pack_kind || G.GAME.pack_kind });
    }
    return r.ok;
  };
  while (!s.over && steps++ < maxSteps && G.GAME.round_resets.ante <= antes) {
    const S = stateName();
    if (S === 'BLIND_SELECT') {
      if (G.GAME.blind_on_deck !== 'Boss' && doAct({ type: 'skip_blind' })) continue;
      doAct({ type: 'select_blind' });
    } else if (S === 'SELECTING_HAND') {
      doAct({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
      doAct({ type: 'play' });
    } else if (S === 'ROUND_EVAL') doAct({ type: 'cash_out' });
    else if (S === 'SHOP') {
      const c = G.shop_booster.cards.find((x) => x.cost <= G.GAME.dollars);
      if (c && doAct({ type: 'buy', id: c.sort_id })) continue;
      if (!rerolled && doAct({ type: 'reroll_shop' })) { rerolled = true; continue; }
      rerolled = false;
      doAct({ type: 'next_round' });
    } else if (PACK_STATES.includes(S)) {
      const pc = G.pack_cards.cards[0];
      if (pc) {
        const n = (pc.ability.consumeable && pc.ability.consumeable.max_highlighted) || 0;
        if (doAct({ type: 'use', id: pc.sort_id, targets: G.hand.cards.slice(0, n).map((x) => x.sort_id) })) continue;
      }
      doAct({ type: 'skip_booster' });
    } else break;
  }
  return { recipe: JSON.parse(JSON.stringify(s.recipe)), opened };
}
