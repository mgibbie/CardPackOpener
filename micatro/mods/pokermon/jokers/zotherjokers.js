// Pokermon 3.9.1 — pokemon/zotherjokers.lua (non-Pokédex jokers), 12 jokers: Pokédex, Rotom Dex,
// Everstone, Tall Grass, Jelly Donut, Treasure Eatery, Mystery Egg, Rival, Ruins of Alph,
// Unown Swarm, Professor, A Billion Lions (only offered with the pokemon_aprilfools option —
// see index.js; 3.9.1 moved it to zzzapril_fools.lua, unchanged). Line-for-line port of the behaviour; static data
// comes from data.js + data391.js. On Pokermon 3.9.1 behaviour since batch 8; Unown Swarm and Ruins of Alph's Unown spawn
// since batch 10b (the Unown rework). 3.9.1's new jokers here (Bitter Rival, Champion, Oologist, Daycare, Rage Candy Bar,
// Repel, the Imposter Professor) are not ported yet (new-jokers batch).
//
// Everstone blocks evolution (see can_evolve); Pokédex lifts the one-per-family pool rule
// (see pokemon_in_pool / poke_family_present).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, play_sound, delay,
  create_card, copy_card, all_cards, juice_card_until, change_booster_limit,
  defineJokers, type_tooltip, get_type, has_type, type_sticker_applied, apply_type_sticker,
  get_probability_vars, pseudorandom_probability, smods_create_card, find_card, add_card, has_enhancement,
  poke_get_adjacent_jokers, ease_poke_dollars, scale_card, destroy_joker, poke_evolve, poll_object, POKE_POOL_RULES,
  poke_is_in_collection,
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
        // Pokermon 3.9.1: the hatch speed-ups (a Fire Energy held / a Flame Body neighbour) need an Oologist (a new 3.9.1
        // joker, not ported yet: so, for now, never).
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
  // offers Bitter Rival, then Champion — new jokers, not ported yet (rework_deferred).
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
}, FILE);

// Pokermon 3.9.1: once beaten, the Rival never comes back to the pool.
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_rival' && G.GAME && G.GAME.poke_rival_defeated ? false : undefined));
// Pokermon 3.9.1 (batch 10b): the Unown Swarm is never in a pool (in_pool false).
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_unown_swarm' ? false : undefined));
