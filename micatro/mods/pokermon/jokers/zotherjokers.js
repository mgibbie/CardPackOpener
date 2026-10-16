// Pokermon 3.2.1 — pokemon/zotherjokers.lua (non-Pokédex jokers), 12 jokers: Pokédex, Rotom Dex,
// Everstone, Tall Grass, Jelly Donut, Treasure Eatery, Mystery Egg, Rival, Ruins of Alph,
// Unown Swarm, Professor, A Billion Lions (only offered with the pokemon_aprilfools option —
// see index.js). Line-for-line port of the behaviour; static data comes from data.js.
//
// Everstone blocks evolution (see can_evolve); Pokédex lifts the one-per-family pool rule
// (see pokemon_in_pool / poke_family_present).
import * as BN from '../../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, play_sound, delay,
  create_card, copy_card, all_cards, juice_card_until, change_booster_limit,
  defineJokers, type_tooltip, get_type, has_type, type_sticker_applied, apply_type_sticker,
  get_probability_vars, pseudorandom_probability, create_random_poke_joker, smods_create_card, find_card,
  poke_get_adjacent_jokers, energy_increase, remove, get_gen_allowed, pokemon_in_pool, ease_poke_dollars,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';

const FILE = 'pokemon/zotherjokers.lua';

// ------------------------------------------------------------ shared bodies
/** Rotom Dex update(): the number of different types among the jokers (G.GAME.rotom_discount). */
function rotomdex_update() {
  if (!G.jokers) return;
  let type_amount = 0;
  const poketype_list = {};
  for (const v of G.jokers.cards) {
    if ((v.ability && v.ability.extra && typeof v.ability.extra === 'object' && v.ability.extra.ptype) || type_sticker_applied(v)) {
      const poketype = get_type(v);
      if (!poketype_list[poketype]) { poketype_list[poketype] = true; type_amount = type_amount + 1; }
    }
  }
  if (type_amount !== (G.GAME.rotom_discount || 0)) {
    G.GAME.rotom_discount = type_amount;
    for (const v of all_cards()) if (v.set_cost) v.set_cost();
  }
}
/** Jelly Donut / Treasure Eatery: the "eaten" / "closed" self-removal (two nested events like the Lua). */
function self_remove(card) {
  G.E_MANAGER.add_event(() => {
    play_sound('tarot1');
    card.juice_up(0.3, 0.4);
    G.E_MANAGER.add_event(() => {
      G.jokers.remove_card(card);
      card.remove();
    });
  });
}
/** zotherjokers.lua is_egg_helper: adjacent Pokémon with Flame Body / Magma Armor / Steam Engine. */
const EGG_HELPERS = ['rolycoly', 'carkol', 'coalossal', 'slugma', 'magcargo', 'camerupt', 'magby', 'magmar', 'magmortar',
  'litwick', 'lampent', 'chandelure', 'larvesta', 'volcarona', 'fletchinder', 'talonflame', 'sizzlipede', 'centiskorch',
  'moltres', 'heatran', 'charcadet'];
export function is_egg_helper(card) {
  let name = '';
  if (!card.name && card.ability.name) name = card.ability.name;
  return EGG_HELPERS.includes(name);
}

defineJokers({
  // Pokédex: counts as Showman for Pokémon families (pokemon_in_pool / poke_family_present).
  pokedex: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
  },
  // Rotom Dex: Booster Packs cost $1 less per different type among your jokers (systems/rules.js set_cost).
  rotomdex: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [(G.GAME && G.GAME.rotom_discount) || 0] };
    },
    update(self, card) { rotomdex_update(); },
    add_to_deck(self, card) {
      G.E_MANAGER.add_event(() => {
        // (Lua's per-frame update has already counted the types by now; Micatro counts them here.)
        rotomdex_update();
        for (const v of all_cards()) if (v.set_cost) v.set_cost();
      });
    },
    remove_from_deck(self, card) {
      G.E_MANAGER.add_event(() => { for (const v of all_cards()) if (v.set_cost) v.set_cost(); });
    },
  },
  // Everstone: Basic/Baby jokers give xMult; no joker can evolve (except by level countdown, which still ticks).
  everstone: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'basic' });
      info_queue.push({ set: 'Other', key: 'baby' });
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.other_joker && context.other_joker.config && (context.other_joker.config.center.stage === 'Basic' || context.other_joker.config.center.stage === 'Baby')) {
        G.E_MANAGER.add_event(() => context.other_joker.juice_up(0.5, 0.5));
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_multi] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi };
      }
      return undefined;
    },
  },
  // Tall Grass
  tall_grass: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'tall_grass');
      return { vars: [num, dem] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && (G.jokers.cards.length + G.GAME.joker_buffer) < G.jokers.config.card_limit) {
          let has_wild = false;
          for (const v of context.scoring_hand) if (v.ability.name === 'Wild Card') { has_wild = true; break; }
          if (has_wild || pseudorandom_probability(card, 'tall_grass', card.ability.extra.num, card.ability.extra.dem, 'tall_grass')) {
            G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
            G.E_MANAGER.add_event(() => {
              G.GAME.joker_buffer = 0;
              play_sound('timpani');
              const _card = create_random_poke_joker('tallgrass', null, 'common');
              _card.add_to_deck();
              G.jokers.emplace(_card);
            });
            delay(0.6);
          }
        }
      }
      return undefined;
    },
  },
  // Jelly Donut: a Colorless Energy each blind for 4 blinds.
  jelly_donut: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) {
        card.ability.extra.rounds = card.ability.extra.rounds - 1;
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          const _card = create_card('Energy', G.pack_cards, null, null, true, true, 'c_poke_colorless_energy', null);
          _card.add_to_deck();
          G.consumeables.emplace(_card);
          G.GAME.consumeable_buffer = 0;
          card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Energy!', colour: 'pink' });
        } else {
          card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'No Room!', colour: 'MULT' });
        }
        if (card.ability.extra.rounds <= 0) {
          self_remove(card);
          return { message: localize('k_eaten_ex'), colour: 'RED' };
        }
      }
      return undefined;
    },
  },
  // Treasure Eatery: each blind, the leftmost joker takes the rightmost joker's type (4 blinds).
  treasure_eatery: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'typechangerother', vars: ['Type'] });
      return { vars: [center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) {
        card.ability.extra.rounds = card.ability.extra.rounds - 1;
        if (G.jokers && G.jokers.cards && G.jokers.cards.length > 1) {
          const last = G.jokers.cards[G.jokers.cards.length - 1];
          if (has_type(last)) {
            apply_type_sticker(G.jokers.cards[0], get_type(last));
            card.juice_up();
            card_eval_status_text(G.jokers.cards[0], 'extra', null, null, null, { message: localize('poke_tera_ex'), colour: 'Spectral' });
          }
        }
        if (card.ability.extra.rounds <= 0) {
          self_remove(card);
          return { message: localize('poke_closed_ex'), colour: 'RED' };
        }
      }
      return undefined;
    },
  },
  // Mystery Egg: hatches into a random Basic/Baby Pokémon (energized) after some rounds.
  mystery_egg: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'poke_egg_tip' });
      info_queue.push({ set: 'Other', key: 'basic' });
      info_queue.push({ set: 'Other', key: 'baby' });
      info_queue.push({ set: 'Other', key: 'energize' });
      return { vars: [center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && !context.repetition && !context.individual && !context.blueprint) {
        let adjacent = 0;
        const adjacent_jokers = poke_get_adjacent_jokers(card);
        for (let i = 0; i < adjacent_jokers.length; i++) if (is_egg_helper(adjacent_jokers[i])) adjacent = adjacent + 1;
        card.ability.extra.rounds = card.ability.extra.rounds - 1;
        const fire = find_card('c_poke_fire_energy').length;
        if ((adjacent + fire) > 0 && pseudorandom('egg') < (adjacent + fire) / 4) {
          card.ability.extra.rounds = card.ability.extra.rounds - 1;
        }
        card.ability.extra.rounds = card.ability.extra.rounds - adjacent / 4;
        if (card.ability.extra.rounds <= 1) juice_card_until(card, (c) => !c.removed, true);
        if (card.ability.extra.rounds <= 0) {
          card.ability.extra.rounds = 99;
          G.E_MANAGER.add_event(() => {
            // if edition is nil, it'll try again for an edition
            const _card = smods_create_card({ set: 'Joker', area: G.jokers, key: card.ability.extra.key, edition: card.edition || undefined });
            energy_increase(_card, 'Trans');
            _card.add_to_deck();
            if (card.edition && card.edition.poke_shiny) change_booster_limit(-1);
            remove(self, card, context);
            // (Lua: G.jokers:emplace(_card, loc) — a numeric location isn't 'front', so it is appended.)
            G.jokers.emplace(_card);
          });
          return { message: localize('poke_crack_ex') };
        }
        return { message: localize('poke_shake_ex') };
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) {
        const prefix_config = 'j_' + (card.config.center.poke_custom_prefix ? card.config.center.poke_custom_prefix : 'poke') + '_';
        const poke_keys = [];
        // (Lua: pairs(G.P_CENTERS); Micatro walks the registration order. Unported (inert) Pokémon are skipped.)
        for (const v of Object.values(P_CENTERS)) {
          if (v.key.startsWith(prefix_config) && get_gen_allowed(v) && !v.aux_poke && !v.unported && pokemon_in_pool(v) && v.stage && typeof v.rarity === 'number') {
            if ((v.stage === 'Baby' || v.stage === 'Basic') && v.rarity !== 4) poke_keys.push({ key: v.key, rarity: v.rarity });
          }
        }
        let poke_key = { key: 'j_poke_rhyhorn', rarity: 2 };
        if (poke_keys.length > 0) poke_key = pseudorandom_element(poke_keys, pseudoseed('egg'))[0];
        // common hatches in 2 turns, uncommon in 2 or 3, rare in 3
        if (poke_key.rarity === 1) card.ability.extra.rounds = 2;
        else if (poke_key.rarity === 2) {
          card.ability.extra.rounds = 2;
          if (pseudorandom('regg') > 0.50) card.ability.extra.rounds = card.ability.extra.rounds + 1;
        } else if (poke_key.rarity === 3) card.ability.extra.rounds = 3;
        card.ability.extra.key = poke_key.key;
      }
    },
  },
  // Rival (-> Bitter Rival -> Champion as G.GAME.rival_losses grows)
  rival: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      let mult = card.ability.extra.mult;
      let money = 5;
      let alt_key;
      if (card.ability.extra.form === 1) {
        alt_key = 'j_poke_bitter_rival';
        mult = card.ability.extra.mult * 2;
        money = 10;
      } else if (card.ability.extra.form > 1) {
        alt_key = 'j_poke_champion';
        mult = card.ability.extra.Xmult;
        money = 25;
      }
      const percent = (2 ** card.ability.extra.form) + 1;
      return { vars: [mult, money, percent], key: alt_key };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          if (card.ability.extra.form > 1) {
            return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
          }
          const mult = card.ability.extra.mult * (card.ability.extra.form === 0 ? 1 : 2);
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [mult] }), colour: 'MULT', mult_mod: mult };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
        let beaten = false;
        if (!G.GAME.chips || !G.GAME.blind.chips || card.ability.extra.form === undefined) return undefined;
        if (BN.gte(BN.div(G.GAME.chips, G.GAME.blind.chips), (2 ** card.ability.extra.form) + 1)) beaten = true;
        if (beaten) {
          G.GAME.rival_losses = G.GAME.rival_losses + 1;
          let money = 5;
          if (card.ability.extra.form === 1) money = 10;
          else if (card.ability.extra.form > 1) money = 25;
          ease_poke_dollars(card, 'rival', money);
          G.E_MANAGER.add_event(() => { remove(self, card, context, true); });
          return { message: localize('poke_smell_ya') };
        }
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) {
        G.GAME.rival_losses = G.GAME.rival_losses || 0;
        card.ability.extra.form = G.GAME.rival_losses;
      }
    },
  },
  // Ruins of Alph: 3 Negative Unown each blind; merges triggered Unown; sell for a reward.
  ruins_of_alph: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const info = center.ability.extra;
      info_queue.push({ set: 'Other', key: 'merge' });
      info_queue.push({ set: 'Other', key: 'rewards_ruins_of_alph', vars: [info.quest1, info.quest2, info.quest3, info.quest4] });
      return { vars: [info.mult_mod, info.merged, info.mult] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          if (card.ability.extra.mult > 0) {
            return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
          }
        }
        if (context.after) {
          const unowns = find_card('j_poke_unown');
          let added = false;
          for (const v of unowns) {
            if (v.ability.extra.triggered && !v.ability.extra.merged) {
              card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
              card.ability.extra.merged = card.ability.extra.merged + 1;
              v.ability.extra.merged = true;
              // (the Lua {} comes out of data.js as an object: it is a list of Unown forms)
              if (!Array.isArray(card.ability.extra.forms)) card.ability.extra.forms = Object.values(card.ability.extra.forms || {});
              card.ability.extra.forms.push(v.ability.extra.form);
              added = true;
            }
          }
          if (added) card.ability.extra.forms.sort();
        }
      }
      if (context.setting_blind && !context.blueprint) {
        for (let i = 1; i <= 3; i++) {
          G.E_MANAGER.add_event(() => {
            const new_card = smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_poke_unown' });
            new_card.set_edition({ negative: true }, true);
            new_card.cost = 0;
            new_card.sell_cost = 0;
            new_card.add_to_deck();
            G.jokers.emplace(new_card);
            new_card.start_materialize();
          });
        }
      }
      if (context.selling_self && !context.blueprint) {
        let reward_card = null;
        if (card.ability.extra.merged >= 28) {
          reward_card = smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_poke_unown_swarm' });
          const _card = create_card('Spectral', G.consumeables, null, null, null, null, 'c_soul');
          _card.add_to_deck();
          G.consumeables.emplace(_card);
          card_eval_status_text(_card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
        } else if (card.ability.extra.merged >= 20) {
          reward_card = smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_brainstorm' });
        } else if (card.ability.extra.merged >= 10) {
          const jokers = [];
          for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] !== card) jokers.push(G.jokers.cards[i]);
          if (jokers.length > 0) {
            // (SMODS's pseudorandom_element turns the string seed into pseudoseed('alph').)
            const [chosen_joker] = pseudorandom_element(jokers, pseudoseed('alph'));
            reward_card = copy_card(chosen_joker, null, null, null, !!(chosen_joker.edition && chosen_joker.edition.negative));
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_duplicated_ex') });
          } else {
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_no_other_jokers') });
          }
        } else if (card.ability.extra.merged >= 5) {
          reward_card = create_random_poke_joker('alph', null, 'poke_safari', G.jokers);
        }
        if (reward_card) {
          reward_card.add_to_deck();
          G.jokers.emplace(reward_card);
          reward_card.start_materialize();
        }
      }
      return undefined;
    },
  },
  // Unown Swarm (Ruins of Alph's 28-Unown reward): Legendary jokers each give +28 Mult and X2.8 Mult.
  unown_swarm: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.other_joker && (context.other_joker.config.center.rarity === 4 || context.other_joker.config.center.rarity === 'Legendary')) {
        G.E_MANAGER.add_event(() => context.other_joker.juice_up(0.5, 0.5));
        return { message: localize('poke_hidden_power_ex'), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi, mult_mod: card.ability.extra.mult };
      }
      return undefined;
    },
    // (Lua's update / set_sprites / soul draw only animate the sprite — the renderer's job.)
  },
  // Professor: after 2 rounds, sell for a Starter Tag.
  // (Its Lua in_pool is never used: load_pokemon replaces it with pokemon_in_pool, as here.)
  professor: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.rounds_total, center.ability.extra.rounds_current] };
    },
    calculate(self, card, context) {
      if (context.selling_self && (card.ability.extra.rounds_current >= card.ability.extra.rounds_total) && !context.blueprint) {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_poke_starter_tag'));
          play_sound('generic1', 0.9, 0.8);
          play_sound('holo1', 1.2, 0.4);
        });
      }
      if (context.end_of_round && context.game_over === false && context.main_eval && !context.blueprint) {
        card.ability.extra.rounds_current = card.ability.extra.rounds_current + 1;
        if (card.ability.extra.rounds_current === card.ability.extra.rounds_total) juice_card_until(card, (c) => !c.removed, true);
        return {
          message: (card.ability.extra.rounds_current < card.ability.extra.rounds_total)
            ? (card.ability.extra.rounds_current + '/' + card.ability.extra.rounds_total) : localize('k_active_ex'),
          colour: 'FILTER',
        };
      }
      return undefined;
    },
  },
  // A Billion Lions (April Fools)
  billion_lions: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.lions] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && !card.getting_sliced) {
        let destroyed = 0;
        for (const v of G.jokers.cards.slice()) {
          if (v !== card && has_type(v) && !v.ability.eternal) {
            destroyed = destroyed + 1;
            v.getting_sliced = true;
            G.E_MANAGER.add_event(() => {
              (context.blueprint_card || card).juice_up(0.8, 0.8);
              v.start_dissolve();
            });
          }
        }
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod * destroyed;
        card.ability.extra.lions = card.ability.extra.lions - destroyed;
        if (card.ability.extra.lions <= 0) {
          card_eval_status_text(card, 'extra', null, null, null, { message: 'They lose!', colour: 'RED' });
          card.start_dissolve();
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      return undefined;
    },
  },
}, FILE);
