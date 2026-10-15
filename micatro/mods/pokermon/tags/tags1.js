// Pokermon 3.2.1 — tags/tags1.lua: Pocket Tag (a free Mega Pocket Pack), Shiny Tag (next shop
// joker is Shiny and free), Stage One Tag / Safari Tag (a free Stage 1 / Safari Pokémon in the
// shop), Jirachi Tag (Jirachi's Wish Pack; never in a pool) and Starter Tag (a free Starter Pack).
// The UI side (tag sprites, create_shop_card_ui) is the renderer's job.
import { G, P_CENTERS, P_CARDS, Card, emit, math_random, defineTags, create_random_poke_joker } from '../api.js';
import { use_card } from '../../../js/engine/run.js';
import { starter_lists } from '../boosters/packs1.js';

const FILE = 'tags/tags1.lua';

/** The tag-opened free pack (Charm / Meteor Tag style): cost 0, from_tag. */
function open_free_pack(key) {
  const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
  card.cost = 0;
  card.from_tag = true;
  use_card(card);
  emit('materialize', { card: card.sort_id });
}

/** store_joker_create: the tag's joker appears (couponed = free) once the tag pops. */
function shop_joker(tag, card, colour) {
  card.states_visible = false;
  tag.yep('+', colour, () => {
    card.states_visible = undefined;
    emit('materialize', { card: card.sort_id });
    card.ability.couponed = true;
    card.set_cost();
    return true;
  });
  tag.triggered = true;
  return card;
}

defineTags({
  pocket_tag: {
    loc_vars(self, info_queue) {
      info_queue.push({ set: 'Other', key: 'p_poke_pokepack_mega_1', specific_vars: [2, 5, 1] });
      info_queue.push(P_CENTERS.c_poke_megastone);
      return { vars: [25] };
    },
    apply(self, tag, context) {
      if (context && context.type === 'new_blind_choice') {
        tag.yep('+', 'item', () => { open_free_pack('p_poke_pokepack_mega_' + math_random(1, 2)); return true; });
        tag.triggered = true;
        return true;
      }
      return undefined;
    },
  },

  shiny_tag: {
    loc_vars(self, info_queue) { info_queue.push(P_CENTERS.e_poke_shiny); return { vars: [] }; },
    apply(self, tag, context) {
      if (context && context.type === 'store_joker_modify') {
        const c = context.card;
        if (!c.edition && !c.temp_edition && c.ability.set === 'Joker') {
          c.temp_edition = true;
          tag.yep('+', 'DARK_EDITION', () => {
            c.set_edition({ poke_shiny: true }, true);
            c.ability.couponed = true;
            c.set_cost();
            c.temp_edition = undefined;
            return true;
          });
          tag.triggered = true;
        }
      }
      // (the Lua never returns _applied, so later store_joker_modify tags still run)
      return undefined;
    },
  },

  stage_one_tag: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'stage1' }); return { vars: [] }; },
    apply(self, tag, context) {
      if (context && context.type === 'store_joker_create') return shop_joker(tag, create_random_poke_joker('stage1tag', 'One', null, context.area), 'GREEN');
      return undefined;
    },
  },

  safari_tag: {
    loc_vars() { return { vars: [] }; },
    apply(self, tag, context) {
      if (context && context.type === 'store_joker_create') return shop_joker(tag, create_random_poke_joker('safaritag', null, 'poke_safari', context.area), 'safari');
      return undefined;
    },
  },

  jirachi_tag: {
    loc_vars() { return { vars: [] }; },
    apply(self, tag, context) {
      if (context && context.type === 'new_blind_choice') {
        // check your Jirachi still exists
        const jirachi = G.jokers.cards.find((j) => (j.name || j.ability.name) === 'jirachi');
        if (jirachi) {
          G.E_MANAGER.add_event(() => {
            open_free_pack('p_poke_pokepack_wish_pack');
            for (const j of G.jokers.cards) if ((j.name || j.ability.name) === 'jirachi') { j.juice_up(0.1); break; }
          });
          G.E_MANAGER.add_event(() => { tag.remove(); });
        } else {
          tag.remove();
        }
        return true;
      }
      return undefined;
    },
    in_pool() { return false; },
  },

  starter_tag: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'p_poke_pokepack_starter_pack', specific_vars: [1, 4] }); },
    apply(self, tag, context) {
      if (context && context.type === 'new_blind_choice') {
        tag.yep('+', 'Spectral', () => { open_free_pack('p_poke_pokepack_starter_pack'); return true; });
        tag.triggered = true;
        return true;
      }
      return undefined;
    },
    in_pool() {
      const L = starter_lists();
      if (L.grass.length === 0 || L.fire.length === 0 || L.water.length === 0 || L.pseudo.length === 0 || L.pika_eevee.length === 0) return false;
      // Intended-design fix: the Lua falls off the end (nil = not in the pool), so the Starter Tag
      // could never appear; it is in the pool whenever every Starter Pack slot has a candidate.
      return true;
    },
  },
}, FILE);
