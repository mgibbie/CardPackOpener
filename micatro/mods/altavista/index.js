/**
 * AltaVista (Mica; old Steamodded 0.x API), rebuilt natively for Micatro.
 * Source: `Projects/Programming/Micatro/Micatro/balatro-altavista-joker-master/AltaVista`
 * (AltaVista.lua + src/jokers.lua, assets/2x/j_micatro_altavista.png). A Tag Team twin.
 *
 * One joker, j_micatro_altavista (Uncommon, $8): after a hand is played, create a Tarot card
 * (key_append 'vag', like Vagabond) for each Pair in the PLAYED cards — per rank floor(count / 2),
 * Stone cards excluded.
 *
 * INTENDED-DESIGN FIXES (pinned in micatro/tests/mods/mica_jokers_test.mjs):
 *  1. The Lua created the Tarot with no room check, so it overflowed the consumable slots (and
 *     zeroed G.GAME.consumeable_buffer under any other pending creator). Its code is Vagabond's
 *     Tarot creation, which only creates when #consumeables + buffer < limit: that check is back.
 *  2. Text: the loc string "{C:attention,'Tarot'}Tarot Card" is malformed markup; it is
 *     "{C:tarot}Tarot Card{}", Balatro's Tarot colour.
 */
import { registerMod } from '../../js/mods/registry.js';
import { G, create_card, card_eval_status_text, play_sound } from '../../js/engine/core.js';

/** Pairs among the played cards: sum over ranks of floor(n / 2), Stone cards skipped. */
export function count_pairs(full_hand) {
  const card_pairs = {};
  for (const c of full_hand) if (c.ability.effect !== 'Stone Card') card_pairs[c.base.value] = (card_pairs[c.base.value] || 0) + 1;
  let n = 0;
  for (const freq of Object.values(card_pairs)) n += Math.floor(freq / 2);
  return n;
}

const KEY = 'j_micatro_altavista';
export const ALTAVISTA = registerMod({
  id: 'altavista',
  name: 'AltaVista',
  prefix: 'micatro',
  version: '1.0',
  by: 'Mica (rebuilt for Micatro)',
  badge_colour: '#A020F0',
  description: 'A Joker that does give you a Tarot card for each Pair played.',
  content: {
    centers: [{
      key: KEY, set: 'Joker', name: 'micatro_altavista', rarity: 2, cost: 8, pos: { x: 0, y: 0 }, atlas: KEY,
      blueprint_compat: true, eternal_compat: true, perishable_compat: true, config: {},
      loc_vars: () => ({ vars: [] }),
      calculate(s, card, context) {
        if (context.cardarea === G.jokers && context.after && context.full_hand) {
          for (let i = count_pairs(context.full_hand); i > 0; i--) {
            // Fix 1: Vagabond's room check (the Lua created past the slot limit).
            if (G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit) break;
            G.GAME.consumeable_buffer += 1;
            G.E_MANAGER.add_event(() => {
              card_eval_status_text(card, 'extra', null, null, null, { message: 'Tarot Card!' });
              const c = create_card('Tarot', G.consumeables, null, null, null, null, null, 'vag');
              c.add_to_deck();
              G.consumeables.emplace(c);
              G.GAME.consumeable_buffer = 0;
              play_sound('generic1');
              play_sound('holo1');
            });
          }
        }
      },
    }],
    atlases: { [KEY]: { src: '/micatro/mods/altavista/assets/2x/j_micatro_altavista.png', px: 71, py: 95 } },
    loc: { descriptions: { Joker: { [KEY]: { name: 'AltaVista', text: ['Gain a {C:tarot}Tarot Card{}', 'for each {C:attention}Pair{} contained', 'in a played hand.'] } } } },
  },
});
