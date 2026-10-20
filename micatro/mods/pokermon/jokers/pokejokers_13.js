// Pokermon 3.9.1 — pokemon/pokejokers_13.lua (Pokédex 361-390: Snorunt -> Jirachi), 12 jokers
// + the two Jirachi forms the Lua writes but never registers (jirachi_copy, jirachi_negging).
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
import {
  G, P_CENTERS, localize, card_eval_status_text, ease_dollars, create_card, copy_card, poll_edition, juice_card_until,
  pseudorandom_element, pseudoseed, add_booster_to_shop, add_card, get_total_energy,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, energize, poke_total_chips, remove,
} from '../api.js';
import { blueprint_effect } from './pokejokers_08.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';

const FILE = 'pokemon/pokejokers_13.lua';
const not_in_pool = () => false;
/** Jirachi (Invis): how many Jokers hold Energy (3.9.1 pokermon.energy.get_total_energy(v) > 0). */
const energized_count = () => (G.jokers ? G.jokers.cards.filter((v) => get_total_energy(v) > 0).length : 0);

/** Snorunt / Glalie / Froslass: go `debt` dollars into the red. */
const debt = {
  add_to_deck(self, card) { G.GAME.bankrupt_at = G.GAME.bankrupt_at - card.ability.extra.debt; },
  remove_from_deck(self, card) { G.GAME.bankrupt_at = G.GAME.bankrupt_at + card.ability.extra.debt; },
};
const a_chips = (card) => ({ message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips });

defineJokers({
  // Snorunt 361
  snorunt: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.debt, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const evolve = item_evo(self, card, context, 'j_poke_froslass');
      if (evolve) return evolve;
      // Glalie only counts down (and evolves) while you are in debt.
      if (G.GAME.dollars < 0) return level_evo(self, card, context, 'j_poke_glalie');
      return undefined;
    },
    ...debt,
  },
  // Glalie 362
  glalie: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.debt] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.juice_up();
        const back_to_zero = -G.GAME.dollars;
        ease_dollars(back_to_zero, true);
      }
      return undefined;
    },
    ...debt,
  },
  // Luvdisc 370
  luvdisc: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.c_poke_heartscale);
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Heart Scale'] });
        info_queue.push({ set: 'Joker', key: 'j_splash', config: {} });
      }
      return { vars: [] };
    },
    calculate() { return undefined; },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        const _card = create_card('Item', G.consumeables, null, null, null, null, 'c_poke_heartscale');
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'FILTER' });
        return true;
      }
      return undefined;
    },
  },
  // Beldum 374
  beldum: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, center.ability.extra.size, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && !context.blueprint) {
          let has_ace = false;
          for (let i = 0; i < context.scoring_hand.length; i++) if (context.scoring_hand[i].get_id() === 14) { has_ace = true; break; }
          if (has_ace || context.scoring_name === 'Four of a Kind') {
            if (has_ace && context.scoring_name === 'Four of a Kind') card.ability.extra.chips = card.ability.extra.chips + 2 * card.ability.extra.chip_mod;
            else card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod;
          }
        }
        if (context.joker_main) return a_chips(card);
      }
      return scaling_evo(self, card, context, 'j_poke_metang', card.ability.extra.chips, self.config.evo_rqmt);
    },
  },
  // Metang 375
  metang: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, center.ability.extra.size, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && !context.blueprint) {
          let ace_count = 0;
          for (let i = 0; i < context.scoring_hand.length; i++) if (context.scoring_hand[i].get_id() === 14) ace_count = ace_count + 1;
          if (ace_count > 1 || context.scoring_name === 'Four of a Kind') {
            if (ace_count > 1 && context.scoring_name === 'Four of a Kind') card.ability.extra.chips = card.ability.extra.chips + 2 * card.ability.extra.chip_mod;
            else card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod;
          }
        }
        if (context.joker_main) return { ...a_chips(card), card };
      }
      return scaling_evo(self, card, context, 'j_poke_metagross', card.ability.extra.chips, self.config.evo_rqmt);
    },
  },
  // Metagross 376
  metagross: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) return { ...a_chips(card), card };
      }
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.scoring_name && context.scoring_name === 'Four of a Kind') {
        const total_chips = poke_total_chips(context.other_card);
        const Xmult = Math.pow(total_chips, 1 / 4);
        if (Xmult > 0) return { x_mult: Xmult, card };
      }
      return undefined;
    },
  },
  // Jirachi 385
  jirachi: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [] };
    },
    calculate(self, card, context) {
      // if everything works correctly, it should create the tag and instantly use it
      if (context.ending_shop && !context.blueprint) add_tag(new Tag('tag_poke_jirachi_tag'));
      return undefined;
    },
  },
  // Pokermon 3.9.1 (3.8.0 Jirachi rework): the wish forms below. (The Wish Pack's own 3.9.1 changes - 3 random unused
  // wishes - wait with the boosters; the forms are self-contained jokers.)
  // Banker: X3 cash-out through the modify_final_cashout context ({modify = amount * 2}); 3.9.1 dropped the lovely
  // "Jirachi Double Payout" patch (our rules.evaluate_round no longer doubles).
  jirachi_banker: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.multiply] };
    },
    calculate(self, card, context) {
      if (context.modify_final_cashout && !context.blueprint) return { modify: context.amount * 2 };
      return undefined;
    },
    in_pool: not_in_pool,
  },
  // Booster: +1 card in every pack (G.GAME.extra_pocket_picks; 3.9.1 names it poke_extra_picks) and the first
  // reroll_max rerolls of each shop add a Booster to the shop (no more extra Booster slot).
  jirachi_booster: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.reroll_max, Math.max(ex.reroll_max - ex.rerolls, 0), ex.bonus_choices] };
    },
    calculate(self, card, context) {
      if (context.reroll_shop && card.ability.extra.rerolls < card.ability.extra.reroll_max) {
        if (!context.blueprint) card.ability.extra.rerolls = card.ability.extra.rerolls + 1;
        card.juice_up();
        add_booster_to_shop();
        return { message: localize('poke_wish_ex'), colour: 'PURPLE' };
      }
      if (context.ending_shop && !context.blueprint) {
        card.ability.extra.rerolls = 0;
        return { message: localize('k_reset') };
      }
      return undefined;
    },
    add_to_deck(self, card) {
      G.GAME.extra_pocket_picks = (G.GAME.extra_pocket_picks || 0) + card.ability.extra.bonus_choices;
    },
    remove_from_deck(self, card) {
      G.GAME.extra_pocket_picks = (G.GAME.extra_pocket_picks || 0) - card.ability.extra.bonus_choices;
    },
    in_pool: not_in_pool,
  },
  // Invis ("copy" wish): Blueprint of the Joker to the right while energy_target+ Jokers are Energized
  // (no more copy-and-self-destruct at Blind select).
  jirachi_invis: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.energy_target, energized_count()] };
    },
    calculate(self, card, context) {
      const found_pos = G.jokers.cards.indexOf(card);
      if (found_pos >= 0) {
        const other_joker = G.jokers.cards[found_pos + 1];
        if (other_joker && energized_count() >= card.ability.extra.energy_target) {
          const ret = blueprint_effect(card, other_joker, context);
          if (ret) ret.colour = 'BLUE';
          return ret;
        }
      }
      return undefined;
    },
    update(self, card) {
      // (the compatible / incompatible badge: pokermon.ui.blueprint_compat(energized >= target and other_joker))
      if (G.jokers && card.area === G.jokers) {
        const other_joker = G.jokers.cards[G.jokers.cards.indexOf(card) + 1];
        const ok = energized_count() >= card.ability.extra.energy_target && other_joker && other_joker !== card && other_joker.config.center.blueprint_compat;
        card.ability.blueprint_compat = ok ? 'compatible' : 'incompatible';
      }
    },
    in_pool: not_in_pool,
  },
  // Written in the 3.2.1 Lua but never registered (not in data.js): defined in full here.
  // Intended-design fix: the owner wants these two Jirachi wishes live. (The 3.2.1 Wish Pack
  // still never offers them: its "copy" wish is jirachi_invis, and fake_negging isn't in it.)
  jirachi_copy: {
    pos: { x: 10, y: 2 }, soul_pos: { x: 11, y: 2 }, atlas: 'AtlasJokersBasicGen03',
    config: { extra: { energy_buff: 1, ptype: 'Metal' } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 3,
    aux_poke: true, no_collection: true, perishable_compat: false, blueprint_compat: true, custom_pool_func: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push({ set: 'Other', key: 'energize' });
      return { vars: [card.ability.extra.energy_buff] };
    },
    calculate(self, card, context) {
      let other_joker = null;
      for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] === card) other_joker = G.jokers.cards[i + 1];
      if (other_joker && other_joker !== card && !context.no_blueprint) {
        context.blueprint = (context.blueprint || 0) + 1;
        context.blueprint_card = context.blueprint_card || card;
        if (context.blueprint > G.jokers.cards.length + 1) return undefined;

        // A see-through copy of the ability (Lua: setmetatable __index) — writes stay on the copy.
        const fake_card = { config: other_joker.config };
        fake_card.ability = Object.create(other_joker.ability);
        if (other_joker.ability.extra !== null && typeof other_joker.ability.extra === 'object') fake_card.ability.extra = Object.create(other_joker.ability.extra);
        else fake_card.ability.extra = other_joker.ability.extra;
        // prevent evolution
        other_joker.gone = true;
        for (let i = 1; i <= card.ability.extra.energy_buff; i++) energize(fake_card, undefined, undefined, true);

        const true_ability = other_joker.ability;
        other_joker.ability = fake_card.ability;
        let other_joker_ret;
        try { other_joker_ret = other_joker.calculate_joker(context); } finally {
          other_joker.ability = true_ability;
          other_joker.gone = undefined;
        }

        context.blueprint = undefined;
        const eff_card = context.blueprint_card || card;
        context.blueprint_card = undefined;
        if (other_joker_ret) {
          other_joker_ret.card = eff_card;
          other_joker_ret.colour = 'BLUE';
          return other_joker_ret;
        }
      }
      return undefined;
    },
    update(self, card) {
      let other_joker = null;
      for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] === card) { other_joker = G.jokers.cards[i + 1]; break; }
      card.ability.blueprint_compat = (other_joker && other_joker !== card && other_joker.config.center.blueprint_compat && 'compatible') || 'incompatible';
    },
    in_pool: not_in_pool,
  },
  jirachi_negging: {
    pos: { x: 10, y: 2 }, atlas: 'AtlasJokersBasicGen03',
    config: { extra: { slots: 2, chance: 2, ptype: 'Metal' } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 3,
    aux_poke: true, no_collection: true, perishable_compat: false, blueprint_compat: false, custom_pool_func: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [] };
    },
    // (Negative weight: index.js edition_weight reads G.GAME.negative_edition_rate.)
    add_to_deck(self, card) {
      G.jokers.config.card_limit = G.jokers.config.card_limit + card.ability.extra.slots;
      G.GAME.negative_edition_rate = (G.GAME.negative_edition_rate || 1) * card.ability.extra.chance;
    },
    remove_from_deck(self, card) {
      G.jokers.config.card_limit = G.jokers.config.card_limit - card.ability.extra.slots;
      G.GAME.negative_edition_rate = (G.GAME.negative_edition_rate || 1) / card.ability.extra.chance;
    },
    in_pool: not_in_pool,
  },
  // Power: played cards X2 every 3rd hand played (Loyalty Card's count from when it became this form).
  jirachi_power: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return {
        vars: [card.ability.extra.Xmult_multi, card.ability.extra.every + 1,
          localize({ type: 'variable', key: (card.ability.extra.loyalty_remaining === 0 ? 'loyalty_active' : 'loyalty_inactive'), vars: [card.ability.extra.loyalty_remaining] })],
      };
    },
    calculate(self, card, context) {
      if (context.before) {
        const m = card.ability.extra.every + 1;
        const n = card.ability.extra.every - 1 - (G.GAME.hands_played - card.ability.hands_played_at_create);
        card.ability.extra.loyalty_remaining = ((n % m) + m) % m; // (Lua % floors)
        if (!context.blueprint && card.ability.extra.loyalty_remaining === 0) {
          juice_card_until(card, (c) => c.ability.extra.loyalty_remaining === 0 && !G.RESET_JIGGLES, true);
        }
      }
      // (3.9.1 drops the "not debuffed" check: a debuffed played card never reaches context.individual anyway.)
      if (context.individual && !context.end_of_round && context.cardarea === G.play) {
        if (card.ability.extra.loyalty_remaining === card.ability.extra.every) return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
    in_pool: not_in_pool,
  },
  // Fixer: a 1-card first discard is destroyed and makes a Death, Cryptid or Metal Coat (if there is room); no more
  // edition on a 1-card first hand.
  jirachi_fixer: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) {
        info_queue.push(P_CENTERS.c_death);
        info_queue.push(P_CENTERS.c_cryptid);
        info_queue.push(P_CENTERS.c_poke_metalcoat);
      }
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.discard && G.GAME.current_round.discards_used === 0 && context.full_hand && context.full_hand.length === 1) {
        const create_function = () => {
          if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            G.E_MANAGER.add_event(() => {
              const cons = [
                { set: 'Tarot', message: localize('k_plus_tarot'), colour: 'PURPLE', key: 'c_death' },
                { set: 'Spectral', message: localize('k_plus_spectral'), colour: 'Spectral', key: 'c_cryptid' },
                { set: 'Item', message: localize('poke_plus_pokeitem'), colour: 'item', key: 'c_poke_metalcoat' },
              ];
              const [con] = pseudorandom_element(cons, pseudoseed('jirachi_fixer'));
              const added = add_card({ set: con.set, key: con.key, key_append: 'jirachi_fixer' });
              card_eval_status_text(added, 'extra', null, null, null, { message: con.message, colour: con.colour });
              G.GAME.consumeable_buffer = 0;
            });
          }
        };
        // (Lua's popup says "+1 Tarot" whichever card it makes.)
        return { delay: 0.45, remove: true, card, extra: { focus: card, message: localize('k_plus_tarot'), colour: 'PURPLE', func: create_function } };
      }
      if (context.first_hand_drawn) {
        juice_card_until(card, () => G.GAME.current_round.discards_used === 0 && !G.RESET_JIGGLES, true);
      }
      return undefined;
    },
    in_pool: not_in_pool,
  },
}, FILE);
