// Pokermon 3.2.1 — pokemon/zmissingno.lua (MissingNo., ptype "Bird"), 1 joker.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
// (The Lua's commented-out missingnocalc table — random mult/chips/money/... effects — is dead code.)
import {
  G, pseudorandom, pseudoseed, pseudorandom_element, play_sound, create_card, copy_card,
  defineJokers,
} from '../api.js';
import { P_TAGS } from '../../../js/engine/core.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { HANDLIST } from '../../../js/engine/run.js';
import { centerActive } from '../../../js/mods/registry.js';

const FILE = 'pokemon/zmissingno.lua';
const mseed = 'missingno';

defineJokers({
  // MissingNo.
  missingno: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'Bird' });
      return { vars: [center.ability.extra.tags_created] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && !context.individual && !context.repetition) {
        const more = pseudorandom('bulba') > 0.90 ? 1 : 0;
        for (let i = 1; i <= card.ability.extra.tags_created + more; i++) {
          G.E_MANAGER.add_event(() => {
            // Lua: pairs(G.P_TAGS) minus the Boss Tag. Micatro walks the registered tags in order and
            // leaves out tags of inactive mods / unported (inert) tags, which would do nothing.
            const tags = [];
            for (const v of Object.values(P_TAGS)) {
              if (v.key !== 'tag_boss' && centerActive(v) && !v.unported) tags.push(v);
            }
            const [temp_tag] = pseudorandom_element(tags, pseudoseed(mseed));
            const tag = new Tag(temp_tag.key);
            if (tag.key === 'tag_orbital') {
              // (pairs(G.GAME.hands) in the Lua — the fixed hand order here.)
              const _poker_hands = [];
              for (const k of HANDLIST) if (G.GAME.hands[k].visible) _poker_hands.push(k);
              tag.ability.orbital_hand = pseudorandom_element(_poker_hands, pseudoseed(mseed))[0];
            }
            add_tag(tag);
            play_sound('generic1', 0.9, 0.8);
            play_sound('holo1', 1.2, 0.4);
          });
        }
      }
      return undefined;
    },
    add_to_deck(self, card, from_debuff) {
      if (G.consumeables && G.consumeables.cards && !from_debuff) {
        let _card;
        if (G.consumeables.cards.length > 0) _card = G.consumeables.cards[0];
        else {
          _card = create_card('Item', G.consumeables, null, null, null, null, null);
          _card.add_to_deck();
          G.consumeables.emplace(_card);
        }
        const empty_con = G.consumeables.config.card_limit - G.consumeables.cards.length;
        for (let i = 1; i <= empty_con; i++) {
          const copy = copy_card(_card, null);
          copy.add_to_deck();
          G.consumeables.emplace(copy);
        }
        // Glitch by design: the joker slots fill up with copies of the consumable too.
        const empty_jokers = G.jokers.config.card_limit - G.jokers.cards.length - 1;
        for (let i = 1; i <= empty_jokers; i++) {
          const copy = copy_card(_card, null);
          copy.add_to_deck();
          G.jokers.emplace(copy);
        }
      }
    },
  },
}, FILE);
