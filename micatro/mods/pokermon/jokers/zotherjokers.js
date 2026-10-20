// Pokermon 3.9.1 — pokemon/zotherjokers.lua (non-Pokédex jokers), 19 jokers: Pokédex, Rotom Dex,
// Everstone, Tall Grass, Jelly Donut, Rage Candy Bar, Treasure Eatery, Mystery Egg, Rival, Bitter Rival, Champion, Ruins of
// Alph, Unown Swarm, Professor, Imposter Professor, Daycare, Oologist, Repel, and A Billion Lions (only offered with the
// pokemon_aprilfools option — see index.js; 3.9.1 moved it to zzzapril_fools.lua, unchanged: jokers/zzzapril_fools.js has
// that file's three new jokers). Line-for-line port of the behaviour; static data comes from data.js + data391.js. On
// Pokermon 3.9.1 behaviour since batch 8; Unown Swarm and Ruins of Alph's Unown spawn since batch 10b (the Unown rework);
// 3.9.1's new jokers here since batch 17 (data391.js new_jokers "17"; Repel, never registered upstream, in full below).
//
// Everstone blocks evolution (see can_evolve); Pokédex lifts the one-per-family pool rule
// (see pokemon_in_pool / poke_family_present).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, play_sound, delay,
  create_card, copy_card, all_cards, juice_card_until, change_booster_limit,
  defineJokers, type_tooltip, get_type, has_type, type_sticker_applied, apply_type_sticker,
  get_probability_vars, pseudorandom_probability, smods_create_card, find_card, add_card, has_enhancement,
  poke_get_adjacent_jokers, ease_poke_dollars, scale_card, destroy_joker, poke_evolve, poll_object, POKE_POOL_RULES,
  poke_is_in_collection, poke_remove_card, precedence_key, poke_get_family_list, detailed,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { starter_lists, starterq_lists } from '../boosters/packs1.js';

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
/** zotherjokers.lua is_egg_helper: adjacent Pokémon with Flame Body / Magma Armor / Steam Engine. */
const EGG_HELPERS = ['rolycoly', 'carkol', 'coalossal', 'slugma', 'magcargo', 'camerupt', 'magby', 'magmar', 'magmortar',
  'litwick', 'lampent', 'chandelure', 'larvesta', 'volcarona', 'fletchinder', 'talonflame', 'sizzlipede', 'centiskorch',
  'moltres', 'heatran', 'charcadet'];
export function is_egg_helper(card) {
  let name = '';
  if (!card.name && card.ability.name) name = card.ability.name;
  return EGG_HELPERS.includes(name);
}

/** pokermon.get_lowest_evo (3.9.1 pokefunctions.lua): the first name of the card's family (its own name when it has none). */
export function get_lowest_evo(card) {
  const name = (card.ability && card.ability.name) || 'bulbasaur';
  const first = poke_get_family_list(name)[0];
  return (first && typeof first === 'object' ? first.key : first) || name;
}
/** Daycare (3.9.1): the adjacent Pokémon that can breed: staged, not Baby, and their line's lowest stage isn't Legendary. */
export function daycare_breedable(adjacent_jokers) {
  let breedable = 0;
  for (const adj of adjacent_jokers) {
    const st = adj.config && adj.config.center && adj.config.center.stage;
    if (!st || st === 'Other' || st === 'Baby') continue;
    const lowest_key = 'j_' + (adj.config.center.poke_custom_prefix || 'poke') + '_' + get_lowest_evo(adj);
    if (P_CENTERS[lowest_key] && P_CENTERS[lowest_key].stage !== 'Legendary') breedable = breedable + 1;
  }
  return breedable;
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
      return { vars: [center.ability.extra.Xmult_multi, center.ability.extra.Xmult_multi2] };
    },
    // Pokermon 3.9.1: Basic Pokémon give X1.5 (Xmult_multi2), Baby Pokémon X1.75 (Xmult_multi).
    calculate(self, card, context) {
      if (context.other_joker && context.other_joker.config && (context.other_joker.config.center.stage === 'Basic' || context.other_joker.config.center.stage === 'Baby')) {
        const Xmult = context.other_joker.config.center.stage === 'Basic' ? card.ability.extra.Xmult_multi2 : card.ability.extra.Xmult_multi;
        if (Xmult > 1) {
          const other = context.other_joker;
          G.E_MANAGER.add_event(() => other.juice_up(0.5, 0.5));
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'XMULT', Xmult_mod: Xmult };
        }
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
          // Pokermon 3.9.1: a Wild card counts by has_enhancement (quantum Wild too); the joker is SMODS.add_card from the
          // 'pokemon' attribute pool at Common rarity (3.2.1: get_random_poke_key's Common Pokémon).
          const has_wild = context.scoring_hand.some((c) => has_enhancement(c, 'm_wild'));
          if (has_wild || pseudorandom_probability(card, 'tall_grass', card.ability.extra.num, card.ability.extra.dem, 'tall_grass')) {
            G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
            G.E_MANAGER.add_event(() => {
              G.GAME.joker_buffer = 0;
              play_sound('timpani');
              add_card({ set: 'Joker', attributes: ['pokemon'], rarity: 1, key_append: 'tallgrass' });
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
        // Pokermon 3.9.1: Blueprint makes an Energy but doesn't eat a round; the Energy holds a consumeable_buffer slot
        // until its event; the Donut goes by SMODS.destroy_cards (an Eternal one stays).
        if (!context.blueprint) card.ability.extra.rounds = card.ability.extra.rounds - 1;
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          G.E_MANAGER.add_event(() => {
            add_card({ set: 'Energy', key: 'c_poke_colorless_energy' });
            G.GAME.consumeable_buffer = 0;
          });
          card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Energy!', colour: 'pink' });
        } else {
          card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'No Room!', colour: 'MULT' });
        }
        if (card.ability.extra.rounds <= 0) {
          destroy_joker(card);
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
      // (Pokermon 3.9.1: not Blueprint-compatible any more; it closes by SMODS.destroy_cards.)
      if (context.setting_blind && !context.blueprint) {
        card.ability.extra.rounds = card.ability.extra.rounds - 1;
        if (G.jokers && G.jokers.cards && G.jokers.cards.length > 1) {
          const last = G.jokers.cards[G.jokers.cards.length - 1];
          if (get_type(last)) {
            apply_type_sticker(G.jokers.cards[0], get_type(last));
            card.juice_up();
            card_eval_status_text(G.jokers.cards[0], 'extra', null, null, null, { message: localize('poke_tera_ex'), colour: 'Spectral' });
          }
        }
        if (card.ability.extra.rounds <= 0) {
          destroy_joker(card);
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
        // Pokermon 3.9.1: the hatch speed-ups (a Fire Energy held / a Flame Body neighbour) need an Oologist (batch 17).
        if (find_card('j_poke_oologist').length) {
          const fire = find_card('c_poke_fire_energy').length;
          if ((adjacent + fire) > 0 && pseudorandom('egg') < (adjacent + fire) / 4) {
            card.ability.extra.rounds = card.ability.extra.rounds - 1;
          }
          card.ability.extra.rounds = card.ability.extra.rounds - adjacent / 4;
        }
        if (card.ability.extra.rounds <= 1) juice_card_until(card, (c) => c.ability.extra.rounds !== undefined && c.ability.extra.rounds <= 1, true);
        // Pokermon 3.9.1: it hatches IN PLACE — pokermon.evolve(card, key, nil, "Crack!", transformation, 1 Energy) keeps its
        // slot, edition and stickers (3.2.1 made a new card at the end of the row) and energizes it once.
        if (card.ability.extra.rounds <= 0) {
          poke_evolve(card, card.ability.extra.key, null, localize('poke_crack_ex'), true, 1);
          return undefined;
        }
        return { message: localize('poke_shake_ex') };
      }
      return undefined;
    },
    // Pokermon 3.9.1: the hatchling is SMODS.poll_object over the 'stage_baby' / 'stage_basic' attribute pools (union, any
    // rarity, seed 'egg'), keeping Common / Uncommon / Rare ones (3.2.1: an even draw over the registered Basics / Babies).
    set_ability(self, card, initial) {
      if (initial && G.playing_cards && !poke_is_in_collection(card)) {
        const VANILLA = { Common: 1, Uncommon: 2, Rare: 3, Legendary: 4 };
        const poke_key = poll_object({
          type: 'Joker', attributes: ['stage_baby', 'stage_basic'], union: true, rarity: false, key_append: 'egg', append: 'egg',
          filter: (pool) => {
            for (const v of pool) {
              const center = P_CENTERS[v.key] || {};
              const rarity = VANILLA[center.rarity] || center.rarity;
              if (!(rarity === 1 || rarity === 2 || rarity === 3)) v.key = 'UNAVAILABLE';
            }
            return pool;
          },
        });
        const center = P_CENTERS[poke_key] || P_CENTERS.j_poke_rhyhorn;
        // common hatches in 2 turns, uncommon in 2 or 3, rare in 3
        if (center.rarity === 1) card.ability.extra.rounds = 2;
        else if (center.rarity === 2) {
          card.ability.extra.rounds = 2;
          if (pseudorandom('regg') > 0.50) card.ability.extra.rounds = card.ability.extra.rounds + 1;
        } else card.ability.extra.rounds = 3;
        card.ability.extra.key = center.key;
      }
    },
  },
  // Rival (Pokermon 3.6.0+ rework): no Mult; each skipped Blind raises the payout by $money_mod; when a Boss Blind is
  // beaten it self-destructs and pays $money, and never comes back to the pool (G.GAME.poke_rival_defeated). 3.9.1 then
  // offers Bitter Rival, then Champion (batch 17, below; the pool rules at the end of this file).
  rival: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.money, card.ability.extra.money_mod] };
    },
    calculate(self, card, context) {
      if (context.skip_blind) scale_card(card, { ref_value: 'money', scalar_value: 'money_mod', message_colour: 'MONEY' });
      if (context.end_of_round && context.game_over === false && context.main_eval && context.beat_boss) {
        G.GAME.poke_rival_defeated = true;
        ease_poke_dollars(card, 'rival', card.ability.extra.money);
        destroy_joker(card);
        return { message: localize('poke_smell_ya') };
      }
      return undefined;
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
              scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', no_message: true });
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
        // Pokermon 3.9.1 (batch 10b): three Negative Unown by SMODS.add_card. Their cost is no longer zeroed; they still
        // sell for $0 — the Unown set_cost rule (3.9.1 lovely/poke_utils.toml, here rules.js set_cost), so selling the
        // three each blind pays nothing.
        G.E_MANAGER.add_event(() => {
          for (let i = 1; i <= 3; i++) add_card({ set: 'Joker', key: 'j_poke_unown', edition: 'e_negative' });
        });
      }
      if (context.selling_self && !context.blueprint) {
        if (card.ability.extra.merged >= 28) {
          add_card({ set: 'Joker', key: 'j_poke_unown_swarm' });
          const soul = add_card({ set: 'Spectral', key: 'c_soul' });
          card_eval_status_text(soul, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
        } else if (card.ability.extra.merged >= 20) {
          add_card({ set: 'Joker', key: 'j_brainstorm' });
        } else if (card.ability.extra.merged >= 10) {
          const jokers = [];
          for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] !== card) jokers.push(G.jokers.cards[i]);
          if (jokers.length > 0) {
            // (3.9.1: the "Duplicated!" message first, then the copy, like Invisible Joker.)
            return {
              message: localize('k_duplicated_ex'),
              func() {
                // (SMODS's pseudorandom_element turns the string seed into pseudoseed('alph').)
                const [chosen_joker] = pseudorandom_element(jokers, pseudoseed('alph'));
                const copy = copy_card(chosen_joker, null, null, null, !!(chosen_joker.edition && chosen_joker.edition.negative));
                copy.add_to_deck();
                G.jokers.emplace(copy);
              },
            };
          }
          return { message: localize('k_no_other_jokers') };
        } else if (card.ability.extra.merged >= 5) {
          // Pokermon 3.9.1: a random Safari joker from the Joker pool (SMODS.add_card; 3.2.1: get_random_poke_key).
          add_card({ set: 'Joker', rarity: 'poke_safari', key_append: 'alph' });
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
        // (3.9.1 drops the XMULT colour for sound 'multhit2'; the engine plays no per-effect sound, so the colour stays)
        return { message: localize('poke_hidden_power_ex'), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi, mult_mod: card.ability.extra.mult, sound: 'multhit2' };
      }
      return undefined;
    },
    // Pokermon 3.9.1 (batch 10b): never in a pool (in_pool false: only Ruins of Alph's 28-Unown reward makes it) —
    // POKE_POOL_RULES below. Its sprite (3.9.1 atlas + soul_atlas strips, display_size 290/3 x 285/3, set_alignment)
    // is the renderer's: index.js SWARM_STRIPS. Not ported (cosmetic): the glued playing-card front 3.9.1 draws beside
    // it (its draw() makes a random Base card with SMODS.create_card — a pseudorandom draw from the run's seed inside the
    // renderer, which a deterministic replay can't have) and the stickers drawn on that front (pokedraw.lua).
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
  // ---------------------------------------------------------------- Pokermon 3.9.1's new non-Pokédex jokers (batch 17)
  // Rage Candy Bar: the first hand of each round destroys the top 2 cards of the deck; eaten after 3 hands.
  // (3.9.1 has no art for it: placeholder_joker. Ours is composed: data391.js sprite_extra.)
  rage_candy_bar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hands] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES, true);
      }
      if (context.joker_main && G.GAME.current_round.hands_played === 0 && !context.blueprint) {
        card.ability.extra.hands = card.ability.extra.hands - 1;
        // SMODS.destroy_cards{G.deck.cards[#G.deck.cards], G.deck.cards[#G.deck.cards - 1]}: the top two cards of the deck
        const n = G.deck.cards.length;
        for (const c of [G.deck.cards[n - 1], G.deck.cards[n - 2]]) if (c) poke_remove_card(c, card);
        if (card.ability.extra.hands <= 0) {
          destroy_joker(card);
          return { message: localize('k_eaten_ex'), colour: 'RED' };
        }
      }
      return undefined;
    },
  },
  // Bitter Rival (the Rival chain): offered once the Rival is beaten; as the Rival, with a bigger payout.
  bitter_rival: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.money, card.ability.extra.money_mod] };
    },
    calculate(self, card, context) {
      if (context.skip_blind) scale_card(card, { ref_value: 'money', scalar_value: 'money_mod', message_colour: 'MONEY' });
      if (context.end_of_round && context.game_over === false && context.main_eval && context.beat_boss) {
        G.GAME.poke_bitter_rival_defeated = true;
        ease_poke_dollars(card, 'bitter_rival', card.ability.extra.money);
        destroy_joker(card);
        return { message: localize('poke_smell_ya') };
      }
      return undefined;
    },
  },
  // Champion (the end of the Rival chain): X(1 + 0.2 per Blind skipped this run); a Speed Tag per Boss Blind beaten.
  champion: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ key: 'tag_skip', set: 'Tag', specific_vars: [5, 5 * ((G.GAME && G.GAME.skips) || 0)] });
      return { vars: [card.ability.extra.Xmult_mod, 1 + ((G.GAME && G.GAME.skips) || 0) * card.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        const x = 1 + (G.GAME.skips || 0) * card.ability.extra.Xmult_mod;
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [x] }), colour: 'XMULT', Xmult_mod: x };
      }
      if (context.end_of_round && context.game_over === false && context.main_eval && context.beat_boss && !context.blueprint) {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_skip'));
          play_sound('generic1', 0.9, 0.8);
          play_sound('holo1', 1.2, 0.4);
        });
      }
      return undefined;
    },
  },
  // Imposter Professor: after 2 rounds, selling it makes a rental Pokédex and a Starter Tag...? (the knock-off starters).
  // Its card turns to the "revealed" cell once owned (3.9.1 set_sprites: form 1 = Others {8,1}; ui.js face()).
  imposter_professor: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.rounds_total, center.ability.extra.rounds_current] };
    },
    calculate(self, card, context) {
      if (context.selling_self && (card.ability.extra.rounds_current >= card.ability.extra.rounds_total) && !context.blueprint) {
        play_sound('timpani');
        const added = add_card({ set: 'Joker', key: 'j_poke_pokedex' });
        added.set_rental(true);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_joker'), colour: 'BLUE' });
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_poke_starterq_tag'));
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
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) card.ability.extra.form = 1;
    },
  },
  // Oologist: after 3 rounds, selling it makes a Negative Mystery Egg, one more per 3 more rounds. While owned, Mystery
  // Eggs hatch faster (mystery_egg above: a held Fire Energy / a Flame Body neighbour).
  oologist: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed() && !(center.edition && center.edition.negative)) info_queue.push(P_CENTERS.e_negative);
      return { vars: [center.ability.extra.rounds_total, center.ability.extra.rounds_current] };
    },
    calculate(self, card, context) {
      if (context.selling_self && (card.ability.extra.rounds_current >= card.ability.extra.rounds_total) && !context.blueprint) {
        for (let i = 1; i <= Math.floor(card.ability.extra.rounds_current / card.ability.extra.rounds_total); i++) {
          add_card({ set: 'Joker', key: 'j_poke_mystery_egg', edition: 'e_negative' });
        }
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
  // Daycare: sold next to 2 breedable Pokémon (not Baby / Legendary lines), it makes a Mystery Egg of one parent's lowest
  // stage (3 rounds). (Its update only labels the Blueprint box in the Lua's UI.)
  daycare: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
    calculate(self, card, context) {
      if (context.selling_self && !context.blueprint) {
        const adjacent_jokers = poke_get_adjacent_jokers(card);
        if (daycare_breedable(adjacent_jokers) >= 2) {
          const parent = pseudorandom_element(adjacent_jokers, pseudoseed('daycare'))[0];
          const lowest = get_lowest_evo(parent);
          if (lowest && typeof lowest === 'string') {
            const prefix = parent.config.center.poke_custom_prefix || 'poke';
            // (precedence: an add-on duplicate's line hatches Pokermon's joker; a key nothing registers — a parent that
            // isn't a Pokémon — makes no egg: intended-design fix, the Lua's egg would hatch into a missing key)
            const egg_key = precedence_key('j_' + prefix + '_' + lowest);
            if (P_CENTERS[egg_key]) {
              const egg = add_card({ set: 'Joker', key: 'j_poke_mystery_egg' });
              egg.ability.extra.key = egg_key;
              egg.ability.extra.rounds = 3;
            }
          }
        }
      }
      return undefined;
    },
  },
  // Repel: sold, it disables the current Boss Blind and makes a D6 Tag. 3.9.1 writes it but never registers it (it is not
  // in zotherjokers.lua's jlist): registered here, never offered (in_pool false), like 3.9.1. Its card is composed (3.9.1:
  // placeholder_joker). Static data in full (data.js and the 3.9.1 extract have none).
  repel: {
    name: 'repel',
    pos: { x: 0, y: 0 },
    config: { extra: {} },
    rarity: 2,
    cost: 6,
    stage: 'Other',
    atlas: 'repel',
    blueprint_compat: false,
    eternal_compat: false,
    attributes: ['tag', 'generation', 'boss_blind', 'on_sell'],
    custom_pool_func: true,
    poke_file: FILE,
    loc_vars(self, info_queue) {
      info_queue.push({ key: 'tag_d_six', set: 'Tag' });
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.selling_self && !context.blueprint) {
        if (G.GAME.blind && G.GAME.blind.get_type() === 'Boss') {
          card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('ph_boss_disabled') });
          G.GAME.blind.disable();
        }
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_d_six'));
          play_sound('generic1', 0.9, 0.8);
          play_sound('holo1', 1.2, 0.4);
        });
      }
      return undefined;
    },
    in_pool() { return false; },
  },
}, FILE);

// Pokermon 3.9.1: once beaten, the Rival never comes back to the pool.
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_rival' && G.GAME && G.GAME.poke_rival_defeated ? false : undefined));
// The Rival chain (3.9.1 in_pool, batch 17): Bitter Rival once the Rival is beaten (until it is beaten too), then Champion.
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_bitter_rival' && !(G.GAME && G.GAME.poke_rival_defeated && !G.GAME.poke_bitter_rival_defeated) ? false : undefined));
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_champion' && !(G.GAME && G.GAME.poke_bitter_rival_defeated) ? false : undefined));
// The Professors (3.9.1 in_pool; the Professor's was not ported in batch 8): only while every Starter Pack slot has a candidate
// (no family of it seen this run) — the Pokémon starters for the Professor, the knock-off ones (Starter Pack...?) for the Imposter.
POKE_POOL_RULES.push((self) => {
  if (!self || (self.key !== 'j_poke_professor' && self.key !== 'j_poke_imposter_professor')) return undefined;
  const L = self.key === 'j_poke_professor' ? starter_lists() : starterq_lists();
  return Object.values(L).every((l) => l.length > 0) ? undefined : false;
});
// Pokermon 3.9.1 (batch 10b): the Unown Swarm is never in a pool (in_pool false).
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_unown_swarm' ? false : undefined));
