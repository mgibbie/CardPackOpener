// Pokermon 3.9.1 — pokemon/zmissingno.lua (MissingNo., ptype "Bird"), 1 joker.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8.
// (The Lua's commented-out missingnocalc table — random mult/chips/money/... effects — is dead code.)
import {
  G, pseudorandom, pseudoseed, pseudorandom_element, play_sound, create_card, copy_card,
  defineJokers, poll_object,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { HANDLIST } from '../../../js/engine/run.js';

const FILE = 'pokemon/zmissingno.lua';
const mseed = 'missingno';

defineJokers({
  // MissingNo.
  missingno: {
    // (3.9.1 dropped the "Bird" type tooltip.)
    loc_vars(self, info_queue, center) {
      return { vars: [center.ability.extra.tags_created] };
    },
    calculate(self, card, context) {
      // Pokermon 3.9.1: the main end-of-round pass (main_eval); each tag is SMODS.poll_object's pick from the Tag pool
      // (its in_pool rules and weights) minus the Boss Tag — 3.2.1 drew evenly from every registered tag.
      if (context.end_of_round && context.main_eval) {
        const more = pseudorandom('bulba') > 0.90 ? 1 : 0;
        for (let i = 1; i <= card.ability.extra.tags_created + more; i++) {
          G.E_MANAGER.add_event(() => {
            const key = poll_object({ type: 'Tag', seed: mseed, filter: (pool) => pool.filter((v) => (v && typeof v === 'object' ? v.key : v) !== 'tag_boss') });
            if (!key) return;
            const tag = new Tag(key);
            if (tag.key === 'tag_orbital' && G.GAME.hands[tag.ability.orbital_hand] === undefined) {
              // (Steamodded lovely/tag.toml: an Orbital Tag with no blind's hand picks a visible hand, seed 'orbital'.)
              const _poker_hands = [];
              for (const k of HANDLIST) if (G.GAME.hands[k].visible) _poker_hands.push(k);
              tag.ability.orbital_hand = pseudorandom_element(_poker_hands, pseudoseed('orbital'))[0];
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
