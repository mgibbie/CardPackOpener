/**
 * Smirkeo (Mica; old Steamodded 0.x API), rebuilt natively for Micatro.
 * Source: `Projects/Programming/Micatro/Micatro/Smirkeo/Smirkeo` (Smirkeo.lua + src/jokers.lua,
 * assets/2x/j_smirkeo_micatro.png). A Tag Team twin.
 *
 * One joker, j_smirkeo_micatro (Uncommon, $8): after a hand is played, gain a Negative Tag for
 * each Pair in the PLAYED cards — per rank floor(count / 2), Stone cards excluded. No fixes needed.
 */
import { registerMod } from '../../js/mods/registry.js';
import { G, card_eval_status_text, play_sound } from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';

/** Pairs among the played cards: sum over ranks of floor(n / 2), Stone cards skipped. */
export function count_pairs(full_hand) {
  const card_pairs = {};
  for (const c of full_hand) if (c.ability.effect !== 'Stone Card') card_pairs[c.base.value] = (card_pairs[c.base.value] || 0) + 1;
  let n = 0;
  for (const freq of Object.values(card_pairs)) n += Math.floor(freq / 2);
  return n;
}

const KEY = 'j_smirkeo_micatro';
export const SMIRKEO = registerMod({
  id: 'smirkeo',
  name: 'Smirkeo',
  prefix: 'smirkeo',
  version: '1.0',
  by: 'Mica (rebuilt for Micatro)',
  badge_colour: '#A020F0',
  description: 'A Joker that prints negative tags',
  content: {
    centers: [{
      key: KEY, set: 'Joker', name: 'smirkeo_micatro', rarity: 2, cost: 8, pos: { x: 0, y: 0 }, atlas: KEY,
      blueprint_compat: true, eternal_compat: true, perishable_compat: true, config: {},
      loc_vars: (s, iq) => { iq.push({ key: 'tag_negative', set: 'Tag' }); return { vars: [] }; },
      calculate(s, card, context) {
        if (context.cardarea === G.jokers && context.after && context.full_hand) {
          for (let i = count_pairs(context.full_hand); i > 0; i--) {
            G.E_MANAGER.add_event(() => {
              card_eval_status_text(card, 'extra', null, null, null, { message: 'Negative Tag!' });
              add_tag(new Tag('tag_negative'));
              play_sound('generic1');
              play_sound('holo1');
            });
          }
        }
      },
    }],
    atlases: { [KEY]: { src: '/micatro/mods/smirkeo/assets/2x/j_smirkeo_micatro.png', px: 71, py: 95 } },
    loc: { descriptions: { Joker: { [KEY]: { name: 'Smirkeo', text: ['Gain a {C:attention,T:tag_negative}Negative Tag', 'for each {C:attention}Pair{} contained', 'in a played hand.'] } } } },
  },
});
