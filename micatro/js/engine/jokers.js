// Micatro — Card:calculate_joker, a line-for-line port of Balatro's
// card.lua `Card:calculate_joker(context)` (lines 2291-4063), plus the
// joker-relevant part of `Card:update` (the per-frame tallies the Lua
// relies on: Throwback, Driver's License, Steel/Stone Joker, Cloud 9,
// Joker Stencil, Swashbuckler, Blueprint/Brainstorm compat) and the
// helpers it calls (playing_card_joker_effects, juice_card_until).
//
// Structure and ordering mirror the Lua exactly (one big function organized
// by context) so the two can be diffed by eye. Visual-only work (sprite
// pinch/rotation, juice, sounds) becomes emit/play_sound calls; every
// state-changing event stays an event, in the same order.

import {
  G, Card, P_CENTERS, P_CARDS_LIST, localize, emit, card_eval_status_text, play_sound,
  pseudorandom, pseudoseed, pseudorandom_element, next,
  ease_dollars, ease_discard, ease_hands_played, draw_card, level_up_hand, update_hand_text, delay,
  create_card, create_playing_card, copy_card, probability_roll,
} from './core.js';
import * as B from './bignum.js';
import { get_poker_hand_info } from './run.js';
import { Tag, add_tag } from './tag.js';
import { firstHook, ACTIVE as ACTIVE_MODS } from '../mods/registry.js';

// G.C colours, kept as plain strings so returned tables stay serialisable.
const C = {
  RED: 'RED', BLUE: 'BLUE', PURPLE: 'PURPLE', MONEY: 'MONEY', CHIPS: 'CHIPS', MULT: 'MULT', FILTER: 'FILTER',
  SECONDARY_SET: { Tarot: 'Tarot', Spectral: 'Spectral', Enhanced: 'Enhanced' },
};

/** Lua's `%` is floored modulo (result has the sign of the divisor). */
const lmod = (a, b) => ((a % b) + b) % b;

// ------------------------------------------------------------- helpers
/** misc_functions.lua playing_card_joker_effects(cards) */
export function playing_card_joker_effects(cards) {
  for (let i = 0; i < G.jokers.cards.length; i++) {
    G.jokers.cards[i].calculate_joker({ playing_card_added: true, cards });
  }
}

/**
 * common_events.lua juice_card_until(card, eval_func, first, delay). The Lua
 * re-queues itself every 0.8s while eval_func holds — purely visual and a
 * runaway in a synchronous queue — so it becomes one UI event the renderer
 * keeps juicing (it can re-check the condition from state).
 */
export function juice_card_until(card, eval_func, first) {
  if (eval_func(card)) emit('juice_until', { card: card.sort_id });
}

/** Card:start_materialize — visual only. */
if (!Card.prototype.start_materialize) {
  Card.prototype.start_materialize = function () { emit('materialize', { card: this.sort_id }); };
}

/**
 * The joker part of Card:update(dt) (run stage) that game logic reads. Lua
 * runs it every frame, so the values are always current when
 * calculate_joker / calculate_dollar_bonus look at them; here it runs at the
 * top of calculate_joker, and `update_joker_tallies()` refreshes every joker.
 * (Temperance / Wheel / Ectoplasm bookkeeping belongs to consumables.js.)
 */
Card.prototype.update_joker = function () {
  const n = this.ability.name;
  if (n === 'Throwback') {
    this.ability.x_mult = 1 + G.GAME.skips * this.ability.extra;
  }
  if (n === "Driver's License") {
    this.ability.driver_tally = 0;
    for (const v of G.playing_cards) if (v.config.center !== P_CENTERS.c_base) this.ability.driver_tally++;
  }
  if (n === 'Steel Joker') {
    this.ability.steel_tally = 0;
    for (const v of G.playing_cards) if (v.config.center === P_CENTERS.m_steel) this.ability.steel_tally++;
  }
  if (n === 'Cloud 9') {
    this.ability.nine_tally = 0;
    for (const v of G.playing_cards) if (v.get_id() === 9) this.ability.nine_tally++;
  }
  if (n === 'Stone Joker') {
    this.ability.stone_tally = 0;
    for (const v of G.playing_cards) if (v.config.center === P_CENTERS.m_stone) this.ability.stone_tally++;
  }
  if (n === 'Joker Stencil') {
    this.ability.x_mult = G.jokers.config.card_limit - G.jokers.cards.length;
    for (let i = 0; i < G.jokers.cards.length; i++) {
      if (G.jokers.cards[i].ability.name === 'Joker Stencil') this.ability.x_mult += 1;
    }
  }
  if (n === 'Blueprint' || n === 'Brainstorm') {
    let other_joker = null;
    if (n === 'Brainstorm') other_joker = G.jokers.cards[0];
    else {
      for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] === this) other_joker = G.jokers.cards[i + 1];
    }
    this.ability.blueprint_compat = (other_joker && other_joker !== this && other_joker.config.center.blueprint_compat) ? 'compatible' : 'incompatible';
  }
  if (n === 'Swashbuckler') {
    let sell_cost = 0;
    for (let i = 0; i < G.jokers.cards.length; i++) {
      const c = G.jokers.cards[i];
      if (c !== this && c.area && c.area === G.jokers) sell_cost += c.sell_cost;
    }
    this.ability.mult = sell_cost;
  }
};
/** Refresh Card:update-driven values on every joker/consumable (call before reading them from outside). */
export function update_joker_tallies() {
  if (G.jokers) for (const c of G.jokers.cards) if (c.ability.set === 'Joker') c.update_joker();
}

/** The repeated "eaten / melted / drank / extinct" removal events. */
function food_remove(self) {
  G.E_MANAGER.add_event(() => {
    play_sound('tarot1');
    self.juice_up(0.3, 0.4);
    G.E_MANAGER.add_event(() => {
      emit('dissolve', { card: self.sort_id, reason: 'eaten' });
      G.jokers.remove_card(self);
      self.remove();
    });
  });
}

// ------------------------------------------------------ calculate_joker
/**
 * Mod effects may use the short scoring keys (mult / chips / xmult) in any
 * scoring context; translate them to what evaluate_play reads for that context
 * (joker_main & joker-on-joker: *_mod; per-card: x_mult) and add the standard
 * popup text when the mod didn't supply one.
 */
export function normalize_mod_effect(r, context) {
  if (!r || typeof r !== 'object') return r;
  // Marks a MOD card's return: the scoring loops then also read Steamodded's extra keys (run.js mod_score_ops).
  if (!r._mod) Object.defineProperty(r, '_mod', { value: true, enumerable: false, configurable: true });
  const x = r.xmult ?? r.Xmult ?? r.x_mult;
  if (context.joker_main || context.other_joker) {
    if (r.mult !== undefined && r.mult_mod === undefined) { r.mult_mod = r.mult; delete r.mult; if (!r.message) r.message = localize({ type: 'variable', key: 'a_mult', vars: [r.mult_mod] }); }
    if (r.chips !== undefined && r.chip_mod === undefined) { r.chip_mod = r.chips; delete r.chips; if (!r.message) r.message = localize({ type: 'variable', key: 'a_chips', vars: [r.chip_mod] }); }
    if (x !== undefined && r.Xmult_mod === undefined) { r.Xmult_mod = x; delete r.xmult; delete r.Xmult; delete r.x_mult; if (!r.message) r.message = localize({ type: 'variable', key: 'a_xmult', vars: [r.Xmult_mod] }); }
  } else if (context.individual) {
    if (x !== undefined && r.x_mult === undefined) { r.x_mult = x; delete r.xmult; delete r.Xmult; }
  }
  return r;
}

Card.prototype.calculate_joker = function (context) {
  // A mod may replace this card's calculation outright (Risk of Jesters: Temporary jokers break at
  // end of round instead of acting) — a Lua Card:calculate_joker wrap; null = no effect.
  if (ACTIVE_MODS.length) { const o = firstHook('calculate_joker', this, context); if (o !== undefined) return o === null ? undefined : o; }
  if (this.debuff) return undefined;
  const mc = this.config.center;
  if (mc.mod) {
    if (mc.update) mc.update(mc, this);
    return mc.calculate ? normalize_mod_effect(mc.calculate(mc, this, context), context) : undefined;
  }
  const self = this;
  if (this.ability.set === 'Joker') this.update_joker();
  if (this.ability.set === 'Planet' && !this.debuff) {
    if (context.joker_main) {
      if (G.GAME.used_vouchers.v_observatory && this.ability.consumeable.hand_type === context.scoring_name) {
        return {
          message: localize({ type: 'variable', key: 'a_xmult', vars: [P_CENTERS.v_observatory.config.extra] }),
          Xmult_mod: P_CENTERS.v_observatory.config.extra,
        };
      }
    }
  }
  if (this.ability.set === 'Joker' && !this.debuff) {
    if (this.ability.name === 'Blueprint') {
      let other_joker = null;
      for (let i = 0; i < G.jokers.cards.length; i++) {
        if (G.jokers.cards[i] === this) other_joker = G.jokers.cards[i + 1];
      }
      if (other_joker && other_joker !== this) {
        context.blueprint = context.blueprint ? context.blueprint + 1 : 1;
        context.blueprint_card = context.blueprint_card || this;
        if (context.blueprint > G.jokers.cards.length + 1) return undefined;
        const other_joker_ret = other_joker.calculate_joker(context);
        if (other_joker_ret) {
          other_joker_ret.card = context.blueprint_card || this;
          other_joker_ret.colour = C.BLUE;
          return other_joker_ret;
        }
      }
    }
    if (this.ability.name === 'Brainstorm') {
      const other_joker = G.jokers.cards[0];
      if (other_joker && other_joker !== this) {
        context.blueprint = context.blueprint ? context.blueprint + 1 : 1;
        context.blueprint_card = context.blueprint_card || this;
        if (context.blueprint > G.jokers.cards.length + 1) return undefined;
        const other_joker_ret = other_joker.calculate_joker(context);
        if (other_joker_ret) {
          other_joker_ret.card = context.blueprint_card || this;
          other_joker_ret.colour = C.RED;
          return other_joker_ret;
        }
      }
    }
    if (context.open_booster) {
      if (this.ability.name === 'Hallucination' && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        if (probability_roll(this, 'halu' + G.GAME.round_resets.ante, 1, this.ability.extra, 'halu')) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          G.E_MANAGER.add_event(() => {
            const card = create_card('Tarot', G.consumeables, null, null, null, null, null, 'hal');
            card.add_to_deck();
            G.consumeables.emplace(card);
            G.GAME.consumeable_buffer = 0;
          });
          card_eval_status_text(this, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: C.PURPLE });
        }
      }
    } else if (context.buying_card) {
      // (nothing)
    } else if (context.selling_self) {
      if (this.ability.name === 'Luchador') {
        if (G.GAME.blind && (!G.GAME.blind.disabled && G.GAME.blind.get_type() === 'Boss')) {
          card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('ph_boss_disabled') });
          G.GAME.blind.disable();
        }
      }
      if (this.ability.name === 'Diet Cola') {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_double'));
          play_sound('generic1');
          play_sound('holo1');
        });
      }
      if (this.ability.name === 'Invisible Joker' && this.ability.invis_rounds >= this.ability.extra && !context.blueprint) {
        const _eval = (card) => card.ability.loyalty_remaining === 0 && !G.RESET_JIGGLES;
        juice_card_until(this, _eval, true);
        const jokers = [];
        for (let i = 0; i < G.jokers.cards.length; i++) {
          if (G.jokers.cards[i] !== this) jokers.push(G.jokers.cards[i]);
        }
        if (jokers.length > 0) {
          if (G.jokers.cards.length <= G.jokers.config.card_limit) {
            card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('k_duplicated_ex') });
            const [chosen_joker] = pseudorandom_element(jokers, pseudoseed('invisible'));
            const card = copy_card(chosen_joker, null, null, null, !!(chosen_joker.edition && chosen_joker.edition.negative));
            if (card.ability.invis_rounds !== undefined) card.ability.invis_rounds = 0;
            card.add_to_deck();
            G.jokers.emplace(card);
          } else {
            card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('k_no_room_ex') });
          }
        } else {
          card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('k_no_other_jokers') });
        }
      }
    } else if (context.selling_card) {
      if (this.ability.name === 'Campfire' && !context.blueprint) {
        this.ability.x_mult = this.ability.x_mult + this.ability.extra;
        G.E_MANAGER.add_event(() => {
          card_eval_status_text(self, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        });
      }
      return undefined;
    } else if (context.reroll_shop) {
      if (this.ability.name === 'Flash Card' && !context.blueprint) {
        this.ability.mult = this.ability.mult + this.ability.extra;
        G.E_MANAGER.add_event(() => {
          card_eval_status_text(self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_mult', vars: [self.ability.mult] }), colour: C.MULT });
        });
      }
    } else if (context.ending_shop) {
      if (this.ability.name === 'Perkeo') {
        if (G.consumeables.cards[0]) {
          G.E_MANAGER.add_event(() => {
            const card = copy_card(pseudorandom_element(G.consumeables.cards, pseudoseed('perkeo'))[0], null);
            card.set_edition({ negative: true }, true);
            card.add_to_deck();
            G.consumeables.emplace(card);
          });
          card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('k_duplicated_ex') });
        }
        return undefined;
      }
      return undefined;
    } else if (context.skip_blind) {
      if (this.ability.name === 'Throwback' && !context.blueprint) {
        G.E_MANAGER.add_event(() => {
          self.update_joker();
          card_eval_status_text(self, 'extra', null, null, null, {
            message: localize({ type: 'variable', key: 'a_xmult', vars: [self.ability.x_mult] }),
            colour: C.RED,
            card: self,
          });
        });
      }
      return undefined;
    } else if (context.skipping_booster) {
      if (this.ability.name === 'Red Card' && !context.blueprint) {
        this.ability.mult = this.ability.mult + this.ability.extra;
        G.E_MANAGER.add_event(() => {
          card_eval_status_text(self, 'extra', null, null, null, {
            message: localize({ type: 'variable', key: 'a_mult', vars: [self.ability.extra] }),
            colour: C.RED,
            delay: 0.45,
            card: self,
          });
        });
      }
      return undefined;
    } else if (context.playing_card_added && !this.getting_sliced) {
      if (this.ability.name === 'Hologram' && !context.blueprint &&
          context.cards && context.cards[0]) {
        this.ability.x_mult = this.ability.x_mult + context.cards.length * this.ability.extra;
        card_eval_status_text(this, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.x_mult] }) });
      }
    } else if (context.first_hand_drawn) {
      if (this.ability.name === 'Certificate') {
        G.E_MANAGER.add_event(() => {
          const _card = create_playing_card({
            front: pseudorandom_element(P_CARDS_LIST(), pseudoseed('cert_fr'))[0],
            center: P_CENTERS.c_base,
          }, G.hand);
          const seal_type = pseudorandom(pseudoseed('certsl'));
          if (seal_type > 0.75) _card.set_seal('Red', true);
          else if (seal_type > 0.5) _card.set_seal('Blue', true);
          else if (seal_type > 0.25) _card.set_seal('Gold', true);
          else _card.set_seal('Purple', true);
          G.GAME.blind.debuff_card(_card);
          G.hand.sort();
          if (context.blueprint_card) context.blueprint_card.juice_up(); else self.juice_up();
        });
        playing_card_joker_effects([true]);
      }
      if (this.ability.name === 'DNA' && !context.blueprint) {
        const _eval = () => G.GAME.current_round.hands_played === 0;
        juice_card_until(this, _eval, true);
      }
      if (this.ability.name === 'Trading Card' && !context.blueprint) {
        const _eval = () => G.GAME.current_round.discards_used === 0 && !G.RESET_JIGGLES;
        juice_card_until(this, _eval, true);
      }
    } else if (context.setting_blind && !this.getting_sliced) {
      if (this.ability.name === 'Chicot' && !context.blueprint &&
          context.blind.boss && !this.getting_sliced) {
        G.E_MANAGER.add_event(() => {
          G.E_MANAGER.add_event(() => {
            G.GAME.blind.disable();
            play_sound('timpani');
            delay(0.4);
          });
          card_eval_status_text(self, 'extra', null, null, null, { message: localize('ph_boss_disabled') });
        });
      }
      if (this.ability.name === 'Madness' && !context.blueprint && !context.blind.boss) {
        this.ability.x_mult = this.ability.x_mult + this.ability.extra;
        const destructable_jokers = [];
        for (let i = 0; i < G.jokers.cards.length; i++) {
          const j = G.jokers.cards[i];
          if (j !== this && !j.ability.eternal && !j.getting_sliced) destructable_jokers.push(j);
        }
        const joker_to_destroy = destructable_jokers.length > 0 ? pseudorandom_element(destructable_jokers, pseudoseed('madness'))[0] : null;

        if (joker_to_destroy && !(context.blueprint_card || this).getting_sliced) {
          joker_to_destroy.getting_sliced = true;
          G.E_MANAGER.add_event(() => {
            (context.blueprint_card || self).juice_up(0.8, 0.8);
            joker_to_destroy.start_dissolve();
          });
        }
        if (!(context.blueprint_card || this).getting_sliced) {
          card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.x_mult] }) });
        }
      }
      if (this.ability.name === 'Burglar' && !(context.blueprint_card || this).getting_sliced) {
        G.E_MANAGER.add_event(() => {
          ease_discard(-G.GAME.current_round.discards_left, null, true);
          ease_hands_played(self.ability.extra);
          card_eval_status_text(context.blueprint_card || self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_hands', vars: [self.ability.extra] }) });
        });
      }
      if (this.ability.name === 'Riff-raff' && !(context.blueprint_card || this).getting_sliced && G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit) {
        const jokers_to_create = Math.min(2, G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer));
        G.GAME.joker_buffer = G.GAME.joker_buffer + jokers_to_create;
        G.E_MANAGER.add_event(() => {
          for (let i = 1; i <= jokers_to_create; i++) {
            const card = create_card('Joker', G.jokers, null, 0, null, null, null, 'rif');
            card.add_to_deck();
            G.jokers.emplace(card);
            card.start_materialize();
            G.GAME.joker_buffer = 0;
          }
        });
        card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('k_plus_joker'), colour: C.BLUE });
      }
      if (this.ability.name === 'Cartomancer' && !(context.blueprint_card || this).getting_sliced && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          G.E_MANAGER.add_event(() => {
            const card = create_card('Tarot', G.consumeables, null, null, null, null, null, 'car');
            card.add_to_deck();
            G.consumeables.emplace(card);
            G.GAME.consumeable_buffer = 0;
          });
          card_eval_status_text(context.blueprint_card || self, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: C.PURPLE });
        });
      }
      if (this.ability.name === 'Ceremonial Dagger' && !context.blueprint) {
        let my_pos = null;
        for (let i = 0; i < G.jokers.cards.length; i++) {
          if (G.jokers.cards[i] === this) { my_pos = i; break; }
        }
        if (my_pos !== null && G.jokers.cards[my_pos + 1] && !this.getting_sliced && !G.jokers.cards[my_pos + 1].ability.eternal && !G.jokers.cards[my_pos + 1].getting_sliced) {
          const sliced_card = G.jokers.cards[my_pos + 1];
          sliced_card.getting_sliced = true;
          G.GAME.joker_buffer = G.GAME.joker_buffer - 1;
          G.E_MANAGER.add_event(() => {
            G.GAME.joker_buffer = 0;
            self.ability.mult = self.ability.mult + sliced_card.sell_cost * 2;
            self.juice_up(0.8, 0.8);
            sliced_card.start_dissolve();
            play_sound('slice1');
          });
          card_eval_status_text(this, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult + 2 * sliced_card.sell_cost] }), colour: C.RED, no_juice: true });
        }
      }
      if (this.ability.name === 'Marble Joker' && !(context.blueprint_card || this).getting_sliced) {
        G.E_MANAGER.add_event(() => {
          const [front] = pseudorandom_element(P_CARDS_LIST(), pseudoseed('marb_fr'));
          G.playing_card = (G.playing_card ? G.playing_card + 1 : 1);
          const card = new Card(front, P_CENTERS.m_stone, { playing_card: G.playing_card });
          card.start_materialize();
          G.play.emplace(card);
          G.playing_cards.push(card);
        });
        card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('k_plus_stone'), colour: C.SECONDARY_SET.Enhanced });

        G.E_MANAGER.add_event(() => {
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
        });
        draw_card(G.play, G.deck, 90, 'up', null);

        playing_card_joker_effects([true]);
      }
      return undefined;
    } else if (context.destroying_card && !context.blueprint) {
      if (this.ability.name === 'Sixth Sense' && context.full_hand.length === 1 && context.full_hand[0].get_id() === 6 && G.GAME.current_round.hands_played === 0) {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          G.E_MANAGER.add_event(() => {
            const card = create_card('Spectral', G.consumeables, null, null, null, null, null, 'sixth');
            card.add_to_deck();
            G.consumeables.emplace(card);
            G.GAME.consumeable_buffer = 0;
          });
          card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: C.SECONDARY_SET.Spectral });
        }
        return true;
      }
      return undefined;
    } else if (context.cards_destroyed) {
      if (this.ability.name === 'Caino' && !context.blueprint) {
        let faces = 0;
        for (const v of context.glass_shattered) {
          if (v.is_face()) faces = faces + 1;
        }
        if (faces > 0) {
          G.E_MANAGER.add_event(() => {
            G.E_MANAGER.add_event(() => {
              self.ability.caino_xmult = self.ability.caino_xmult + faces * self.ability.extra;
            });
            card_eval_status_text(self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [self.ability.caino_xmult + faces * self.ability.extra] }) });
          });
        }
        return undefined;
      }
      if (this.ability.name === 'Glass Joker' && !context.blueprint) {
        let glasses = 0;
        for (const v of context.glass_shattered) {
          if (v.shattered) glasses = glasses + 1;
        }
        if (glasses > 0) {
          G.E_MANAGER.add_event(() => {
            G.E_MANAGER.add_event(() => {
              self.ability.x_mult = self.ability.x_mult + self.ability.extra * glasses;
            });
            card_eval_status_text(self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [self.ability.x_mult + self.ability.extra * glasses] }) });
          });
        }
        return undefined;
      }
    } else if (context.remove_playing_cards) {
      if (this.ability.name === 'Caino' && !context.blueprint) {
        let face_cards = 0;
        for (const val of context.removed) {
          if (val.is_face()) face_cards = face_cards + 1;
        }
        if (face_cards > 0) {
          this.ability.caino_xmult = this.ability.caino_xmult + face_cards * this.ability.extra;
          G.E_MANAGER.add_event(() => {
            card_eval_status_text(self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [self.ability.caino_xmult] }) });
          });
        }
        return undefined;
      }

      if (this.ability.name === 'Glass Joker' && !context.blueprint) {
        let glass_cards = 0;
        for (const val of context.removed) {
          if (val.shattered) glass_cards = glass_cards + 1;
        }
        if (glass_cards > 0) {
          G.E_MANAGER.add_event(() => {
            G.E_MANAGER.add_event(() => {
              self.ability.x_mult = self.ability.x_mult + self.ability.extra * glass_cards;
            });
            card_eval_status_text(self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [self.ability.x_mult + self.ability.extra * glass_cards] }) });
          });
        }
        return undefined;
      }
    } else if (context.using_consumeable) {
      if (this.ability.name === 'Glass Joker' && !context.blueprint && context.consumeable.ability.name === 'The Hanged Man') {
        let shattered_glass = 0;
        for (const val of G.hand.highlighted) {
          if (val.ability.name === 'Glass Card') shattered_glass = shattered_glass + 1;
        }
        if (shattered_glass > 0) {
          this.ability.x_mult = this.ability.x_mult + this.ability.extra * shattered_glass;
          G.E_MANAGER.add_event(() => {
            card_eval_status_text(self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [self.ability.x_mult] }) });
          });
        }
        return undefined;
      }
      if (this.ability.name === 'Fortune Teller' && !context.blueprint && context.consumeable.ability.set === 'Tarot') {
        G.E_MANAGER.add_event(() => {
          card_eval_status_text(self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_mult', vars: [G.GAME.consumeable_usage_total.tarot] }) });
        });
      }
      if (this.ability.name === 'Constellation' && !context.blueprint && context.consumeable.ability.set === 'Planet') {
        this.ability.x_mult = this.ability.x_mult + this.ability.extra;
        G.E_MANAGER.add_event(() => {
          card_eval_status_text(self, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [self.ability.x_mult] }) });
        });
        return undefined;
      }
      return undefined;
    } else if (context.debuffed_hand) {
      if (this.ability.name === 'Matador') {
        if (G.GAME.blind.triggered) {
          ease_dollars(this.ability.extra);
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + this.ability.extra;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return {
            message: localize('$') + this.ability.extra,
            dollars: this.ability.extra,
            colour: C.MONEY,
          };
        }
      }
    } else if (context.pre_discard) {
      if (this.ability.name === 'Burnt Joker' && G.GAME.current_round.discards_used <= 0 && !context.hook) {
        const { text } = get_poker_hand_info(G.hand.highlighted);
        card_eval_status_text(context.blueprint_card || this, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, { handname: localize(text, 'poker_hands'), chips: G.GAME.hands[text].chips, mult: G.GAME.hands[text].mult, level: G.GAME.hands[text].level });
        level_up_hand(context.blueprint_card || this, text, null, 1);
        update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
      }
    } else if (context.discard) {
      if (this.ability.name === 'Ramen' && !context.blueprint) {
        if (this.ability.x_mult - this.ability.extra <= 1) {
          food_remove(this);
          return {
            message: localize('k_eaten_ex'),
            colour: C.FILTER,
          };
        } else {
          this.ability.x_mult = this.ability.x_mult - this.ability.extra;
          return {
            delay: 0.2,
            message: localize({ type: 'variable', key: 'a_xmult_minus', vars: [this.ability.extra] }),
            colour: C.RED,
          };
        }
      }
      if (this.ability.name === 'Yorick' && !context.blueprint) {
        if (this.ability.yorick_discards <= 1) {
          this.ability.yorick_discards = this.ability.extra.discards;
          this.ability.x_mult = this.ability.x_mult + this.ability.extra.xmult;
          return {
            delay: 0.2,
            message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.x_mult] }),
            colour: C.RED,
          };
        } else {
          this.ability.yorick_discards = this.ability.yorick_discards - 1;
        }
        return undefined;
      }
      if (this.ability.name === 'Trading Card' && !context.blueprint &&
          G.GAME.current_round.discards_used <= 0 && context.full_hand.length === 1) {
        ease_dollars(this.ability.extra);
        return {
          message: localize('$') + this.ability.extra,
          colour: C.MONEY,
          delay: 0.45,
          remove: true,
          card: this,
        };
      }

      if (this.ability.name === 'Castle' &&
          !context.other_card.debuff &&
          context.other_card.is_suit(G.GAME.current_round.castle_card.suit) && !context.blueprint) {
        this.ability.extra.chips = this.ability.extra.chips + this.ability.extra.chip_mod;
        return {
          message: localize('k_upgrade_ex'),
          card: this,
          colour: C.CHIPS,
        };
      }
      if (this.ability.name === 'Mail-In Rebate' &&
          !context.other_card.debuff &&
          context.other_card.get_id() === G.GAME.current_round.mail_card.id) {
        ease_dollars(this.ability.extra);
        return {
          message: localize('$') + this.ability.extra,
          colour: C.MONEY,
          card: this,
        };
      }
      if (this.ability.name === 'Hit the Road' &&
          !context.other_card.debuff &&
          context.other_card.get_id() === 11 && !context.blueprint) {
        this.ability.x_mult = this.ability.x_mult + this.ability.extra;
        return {
          message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.x_mult] }),
          colour: C.RED,
          delay: 0.45,
          card: this,
        };
      }
      if (this.ability.name === 'Green Joker' && !context.blueprint && context.other_card === context.full_hand[context.full_hand.length - 1]) {
        const prev_mult = this.ability.mult;
        this.ability.mult = Math.max(0, this.ability.mult - this.ability.extra.discard_sub);
        if (this.ability.mult !== prev_mult) {
          return {
            message: localize({ type: 'variable', key: 'a_mult_minus', vars: [this.ability.extra.discard_sub] }),
            colour: C.RED,
            card: this,
          };
        }
      }

      if (this.ability.name === 'Faceless Joker' && context.other_card === context.full_hand[context.full_hand.length - 1]) {
        let face_cards = 0;
        for (const v of context.full_hand) {
          if (v.is_face()) face_cards = face_cards + 1;
        }
        if (face_cards >= this.ability.extra.faces) {
          G.E_MANAGER.add_event(() => {
            ease_dollars(self.ability.extra.dollars);
            card_eval_status_text(context.blueprint_card || self, 'extra', null, null, null, { message: localize('$') + self.ability.extra.dollars, colour: C.MONEY, delay: 0.45 });
          });
          return undefined;
        }
      }
      return undefined;
    } else if (context.end_of_round) {
      if (context.individual) {
        // (nothing)
      } else if (context.repetition) {
        if (context.cardarea === G.hand) {
          if (this.ability.name === 'Mime' &&
              (next(context.card_effects[0]) || context.card_effects.length > 1)) {
            return {
              message: localize('k_again_ex'),
              repetitions: this.ability.extra,
              card: this,
            };
          }
        }
      } else if (!context.blueprint) {
        if (this.ability.name === 'Campfire' && G.GAME.blind.boss && this.ability.x_mult > 1) {
          this.ability.x_mult = 1;
          return {
            message: localize('k_reset'),
            colour: C.RED,
          };
        }
        if (this.ability.name === 'Rocket' && G.GAME.blind.boss) {
          this.ability.extra.dollars = this.ability.extra.dollars + this.ability.extra.increase;
          return {
            message: localize('k_upgrade_ex'),
            colour: C.MONEY,
          };
        }
        if (this.ability.name === 'Turtle Bean' && !context.blueprint) {
          if (this.ability.extra.h_size - this.ability.extra.h_mod <= 0) {
            food_remove(this);
            return {
              message: localize('k_eaten_ex'),
              colour: C.FILTER,
            };
          } else {
            this.ability.extra.h_size = this.ability.extra.h_size - this.ability.extra.h_mod;
            G.hand.change_size(-this.ability.extra.h_mod);
            return {
              message: localize({ type: 'variable', key: 'a_handsize_minus', vars: [this.ability.extra.h_mod] }),
              colour: C.FILTER,
            };
          }
        }
        if (this.ability.name === 'Invisible Joker' && !context.blueprint) {
          this.ability.invis_rounds = this.ability.invis_rounds + 1;
          if (this.ability.invis_rounds === this.ability.extra) {
            const _eval = (card) => !card.REMOVED;
            juice_card_until(this, _eval, true);
          }
          return {
            message: (this.ability.invis_rounds < this.ability.extra) ? (this.ability.invis_rounds + '/' + this.ability.extra) : localize('k_active_ex'),
            colour: C.FILTER,
          };
        }
        if (this.ability.name === 'Popcorn' && !context.blueprint) {
          if (this.ability.mult - this.ability.extra <= 0) {
            food_remove(this);
            return {
              message: localize('k_eaten_ex'),
              colour: C.RED,
            };
          } else {
            this.ability.mult = this.ability.mult - this.ability.extra;
            return {
              message: localize({ type: 'variable', key: 'a_mult_minus', vars: [this.ability.extra] }),
              colour: C.MULT,
            };
          }
        }
        if (this.ability.name === 'To Do List' && !context.blueprint) {
          const _poker_hands = [];
          for (const [k, v] of Object.entries(G.GAME.hands)) {
            if (v.visible && k !== this.ability.to_do_poker_hand) _poker_hands.push(k);
          }
          this.ability.to_do_poker_hand = pseudorandom_element(_poker_hands, pseudoseed('to_do'))[0];
          return {
            message: localize('k_reset'),
          };
        }
        if (this.ability.name === 'Egg') {
          this.ability.extra_value = this.ability.extra_value + this.ability.extra;
          this.set_cost();
          return {
            message: localize('k_val_up'),
            colour: C.MONEY,
          };
        }
        if (this.ability.name === 'Gift Card') {
          for (const v of G.jokers.cards) {
            if (v.set_cost) {
              v.ability.extra_value = (v.ability.extra_value || 0) + this.ability.extra;
              v.set_cost();
            }
          }
          for (const v of G.consumeables.cards) {
            if (v.set_cost) {
              v.ability.extra_value = (v.ability.extra_value || 0) + this.ability.extra;
              v.set_cost();
            }
          }
          return {
            message: localize('k_val_up'),
            colour: C.MONEY,
          };
        }
        if (this.ability.name === 'Hit the Road' && this.ability.x_mult > 1) {
          this.ability.x_mult = 1;
          return {
            message: localize('k_reset'),
            colour: C.RED,
          };
        }

        if (this.ability.name === 'Gros Michel' || this.ability.name === 'Cavendish') {
          if (probability_roll(this, this.ability.name === 'Cavendish' ? 'cavendish' : 'gros_michel', 1, this.ability.extra.odds)) {
            food_remove(this);
            if (this.ability.name === 'Gros Michel') G.GAME.pool_flags.gros_michel_extinct = true;
            return {
              message: localize('k_extinct_ex'),
            };
          } else {
            return {
              message: localize('k_safe_ex'),
            };
          }
        }
        if (this.ability.name === 'Mr. Bones' && context.game_over &&
            B.gte(B.div(G.GAME.chips, G.GAME.blind.chips), 0.25)) {
          G.E_MANAGER.add_event(() => {
            emit('blind_juice', {});
            play_sound('tarot1');
            self.start_dissolve();
          });
          return {
            message: localize('k_saved_ex'),
            saved: true,
            colour: C.RED,
          };
        }
      }
    } else if (context.individual) {
      if (context.cardarea === G.play) {
        if (this.ability.name === 'Hiker') {
          context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus || 0;
          context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus + this.ability.extra;
          return {
            extra: { message: localize('k_upgrade_ex'), colour: C.CHIPS },
            colour: C.CHIPS,
            card: this,
          };
        }
        if (this.ability.name === 'Lucky Cat' && context.other_card.lucky_trigger && !context.blueprint) {
          this.ability.x_mult = this.ability.x_mult + this.ability.extra;
          return {
            extra: { focus: this, message: localize('k_upgrade_ex'), colour: C.MULT },
            card: this,
          };
        }
        if (this.ability.name === 'Wee Joker' &&
            context.other_card.get_id() === 2 && !context.blueprint) {
          this.ability.extra.chips = this.ability.extra.chips + this.ability.extra.chip_mod;

          return {
            extra: { focus: this, message: localize('k_upgrade_ex') },
            card: this,
            colour: C.CHIPS,
          };
        }
        if (this.ability.name === 'Photograph') {
          let first_face = null;
          for (let i = 0; i < context.scoring_hand.length; i++) {
            if (context.scoring_hand[i].is_face()) { first_face = context.scoring_hand[i]; break; }
          }
          if (context.other_card === first_face) {
            return {
              x_mult: this.ability.extra,
              colour: C.RED,
              card: this,
            };
          }
        }
        if (this.ability.name === '8 Ball' && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          if (context.other_card.get_id() === 8 && probability_roll(this, '8ball', 1, this.ability.extra)) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            return {
              extra: {
                focus: this, message: localize('k_plus_tarot'), func: () => {
                  G.E_MANAGER.add_event(() => {
                    const card = create_card('Tarot', G.consumeables, null, null, null, null, null, '8ba');
                    card.add_to_deck();
                    G.consumeables.emplace(card);
                    G.GAME.consumeable_buffer = 0;
                  });
                },
              },
              colour: C.SECONDARY_SET.Tarot,
              card: this,
            };
          }
        }
        if (this.ability.name === 'The Idol' &&
            context.other_card.get_id() === G.GAME.current_round.idol_card.id &&
            context.other_card.is_suit(G.GAME.current_round.idol_card.suit)) {
          return {
            x_mult: this.ability.extra,
            colour: C.RED,
            card: this,
          };
        }
        if (this.ability.name === 'Scary Face' &&
            context.other_card.is_face()) {
          return {
            chips: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Smiley Face' &&
            context.other_card.is_face()) {
          return {
            mult: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Golden Ticket' &&
            context.other_card.ability.name === 'Gold Card') {
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + this.ability.extra;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return {
            dollars: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Scholar' &&
            context.other_card.get_id() === 14) {
          return {
            chips: this.ability.extra.chips,
            mult: this.ability.extra.mult,
            card: this,
          };
        }
        if (this.ability.name === 'Walkie Talkie' &&
            (context.other_card.get_id() === 10 || context.other_card.get_id() === 4)) {
          return {
            chips: this.ability.extra.chips,
            mult: this.ability.extra.mult,
            card: this,
          };
        }
        if (this.ability.name === 'Business Card' &&
            context.other_card.is_face() &&
            probability_roll(this, 'business', 1, this.ability.extra)) {
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + 2;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return {
            dollars: 2,
            card: this,
          };
        }
        if (this.ability.name === 'Fibonacci' && (
          context.other_card.get_id() === 2 ||
          context.other_card.get_id() === 3 ||
          context.other_card.get_id() === 5 ||
          context.other_card.get_id() === 8 ||
          context.other_card.get_id() === 14)) {
          return {
            mult: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Even Steven' &&
            context.other_card.get_id() <= 10 &&
            context.other_card.get_id() >= 0 &&
            context.other_card.get_id() % 2 === 0) {
          return {
            mult: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Odd Todd' &&
            ((context.other_card.get_id() <= 10 &&
              context.other_card.get_id() >= 0 &&
              context.other_card.get_id() % 2 === 1) ||
             context.other_card.get_id() === 14)) {
          return {
            chips: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.effect === 'Suit Mult' &&
            context.other_card.is_suit(this.ability.extra.suit)) {
          return {
            mult: this.ability.extra.s_mult,
            card: this,
          };
        }
        if (this.ability.name === 'Rough Gem' &&
            context.other_card.is_suit('Diamonds')) {
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + this.ability.extra;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return {
            dollars: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Onyx Agate' &&
            context.other_card.is_suit('Clubs')) {
          return {
            mult: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Arrowhead' &&
            context.other_card.is_suit('Spades')) {
          return {
            chips: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Bloodstone' &&
            context.other_card.is_suit('Hearts') &&
            probability_roll(this, 'bloodstone', 1, this.ability.extra.odds)) {
          return {
            x_mult: this.ability.extra.Xmult,
            card: this,
          };
        }
        if (this.ability.name === 'Ancient Joker' &&
            context.other_card.is_suit(G.GAME.current_round.ancient_card.suit)) {
          return {
            x_mult: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Triboulet' &&
            (context.other_card.get_id() === 12 || context.other_card.get_id() === 13)) {
          return {
            x_mult: this.ability.extra,
            colour: C.RED,
            card: this,
          };
        }
      }
      if (context.cardarea === G.hand) {
        if (this.ability.name === 'Shoot the Moon' &&
            context.other_card.get_id() === 12) {
          if (context.other_card.debuff) {
            return {
              message: localize('k_debuffed'),
              colour: C.RED,
              card: this,
            };
          } else {
            return {
              h_mult: 13,
              card: this,
            };
          }
        }
        if (this.ability.name === 'Baron' &&
            context.other_card.get_id() === 13) {
          if (context.other_card.debuff) {
            return {
              message: localize('k_debuffed'),
              colour: C.RED,
              card: this,
            };
          } else {
            return {
              x_mult: this.ability.extra,
              card: this,
            };
          }
        }
        if (this.ability.name === 'Reserved Parking' &&
            context.other_card.is_face() &&
            probability_roll(this, 'parking', 1, this.ability.extra.odds)) {
          if (context.other_card.debuff) {
            return {
              message: localize('k_debuffed'),
              colour: C.RED,
              card: this,
            };
          } else {
            G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + this.ability.extra.dollars;
            G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
            return {
              dollars: this.ability.extra.dollars,
              card: this,
            };
          }
        }
        if (this.ability.name === 'Raised Fist') {
          let temp_Mult = 15, temp_ID = 15;
          let raised_card = null;
          for (let i = 0; i < G.hand.cards.length; i++) {
            const hc = G.hand.cards[i];
            if (temp_ID >= hc.base.id && hc.ability.effect !== 'Stone Card') { temp_Mult = hc.base.nominal; temp_ID = hc.base.id; raised_card = hc; }
          }
          if (raised_card === context.other_card) {
            if (context.other_card.debuff) {
              return {
                message: localize('k_debuffed'),
                colour: C.RED,
                card: this,
              };
            } else {
              return {
                h_mult: 2 * temp_Mult,
                card: this,
              };
            }
          }
        }
      }
    } else if (context.repetition) {
      if (context.cardarea === G.play) {
        if (this.ability.name === 'Sock and Buskin' &&
            context.other_card.is_face()) {
          return {
            message: localize('k_again_ex'),
            repetitions: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Hanging Chad' &&
            context.other_card === context.scoring_hand[0]) {
          return {
            message: localize('k_again_ex'),
            repetitions: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Dusk' && G.GAME.current_round.hands_left === 0) {
          return {
            message: localize('k_again_ex'),
            repetitions: this.ability.extra,
            card: this,
          };
        }
        if (this.ability.name === 'Seltzer') {
          return {
            message: localize('k_again_ex'),
            repetitions: 1,
            card: this,
          };
        }
        if (this.ability.name === 'Hack' && (
          context.other_card.get_id() === 2 ||
          context.other_card.get_id() === 3 ||
          context.other_card.get_id() === 4 ||
          context.other_card.get_id() === 5)) {
          return {
            message: localize('k_again_ex'),
            repetitions: this.ability.extra,
            card: this,
          };
        }
      }
      if (context.cardarea === G.hand) {
        if (this.ability.name === 'Mime' &&
            (next(context.card_effects[0]) || context.card_effects.length > 1)) {
          return {
            message: localize('k_again_ex'),
            repetitions: this.ability.extra,
            card: this,
          };
        }
      }
    } else if (context.other_joker) {
      if (this.ability.name === 'Baseball Card' && context.other_joker.config.center.rarity === 2 && this !== context.other_joker) {
        G.E_MANAGER.add_event(() => {
          context.other_joker.juice_up(0.5, 0.5);
        });
        return {
          message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra] }),
          Xmult_mod: this.ability.extra,
        };
      }
    } else {
      if (context.cardarea === G.jokers) {
        if (context.before) {
          if (this.ability.name === 'Spare Trousers' && (next(context.poker_hands['Two Pair']) || next(context.poker_hands['Full House'])) && !context.blueprint) {
            this.ability.mult = this.ability.mult + this.ability.extra;
            return {
              message: localize('k_upgrade_ex'),
              colour: C.RED,
              card: this,
            };
          }
          if (this.ability.name === 'Space Joker' && probability_roll(this, 'space', 1, this.ability.extra)) {
            return {
              card: this,
              level_up: true,
              message: localize('k_level_up_ex'),
            };
          }
          if (this.ability.name === 'Square Joker' && context.full_hand.length === 4 && !context.blueprint) {
            this.ability.extra.chips = this.ability.extra.chips + this.ability.extra.chip_mod;
            return {
              message: localize('k_upgrade_ex'),
              colour: C.CHIPS,
              card: this,
            };
          }
          if (this.ability.name === 'Runner' && next(context.poker_hands['Straight']) && !context.blueprint) {
            this.ability.extra.chips = this.ability.extra.chips + this.ability.extra.chip_mod;
            return {
              message: localize('k_upgrade_ex'),
              colour: C.CHIPS,
              card: this,
            };
          }
          if (this.ability.name === 'Midas Mask' && !context.blueprint) {
            const faces = [];
            for (const v of context.scoring_hand) {
              if (v.is_face()) {
                faces.push(v);
                v.set_ability(P_CENTERS.m_gold, null, true);
                G.E_MANAGER.add_event(() => { v.juice_up(); });
              }
            }
            if (faces.length > 0) {
              return {
                message: localize('k_gold'),
                colour: C.MONEY,
                card: this,
              };
            }
          }
          if (this.ability.name === 'Vampire' && !context.blueprint) {
            const enhanced = [];
            for (const v of context.scoring_hand) {
              if (v.config.center !== P_CENTERS.c_base && !v.debuff && !v.vampired) {
                enhanced.push(v);
                v.vampired = true;
                v.set_ability(P_CENTERS.c_base, null, true);
                G.E_MANAGER.add_event(() => {
                  v.juice_up();
                  v.vampired = undefined;
                });
              }
            }

            if (enhanced.length > 0) {
              this.ability.x_mult = this.ability.x_mult + this.ability.extra * enhanced.length;
              return {
                message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.x_mult] }),
                colour: C.MULT,
                card: this,
              };
            }
          }
          if (this.ability.name === 'To Do List' && context.scoring_name === this.ability.to_do_poker_hand) {
            ease_dollars(this.ability.extra.dollars);
            G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + this.ability.extra.dollars;
            G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
            return {
              message: localize('$') + this.ability.extra.dollars,
              dollars: this.ability.extra.dollars,
              colour: C.MONEY,
            };
          }
          if (this.ability.name === 'DNA' && G.GAME.current_round.hands_played === 0) {
            if (context.full_hand.length === 1) {
              G.playing_card = (G.playing_card ? G.playing_card + 1 : 1);
              const _card = copy_card(context.full_hand[0], null, null, G.playing_card);
              _card.add_to_deck();
              G.deck.config.card_limit = G.deck.config.card_limit + 1;
              G.playing_cards.push(_card);
              G.hand.emplace(_card);

              G.E_MANAGER.add_event(() => { _card.start_materialize(); });
              return {
                message: localize('k_copied_ex'),
                colour: C.CHIPS,
                card: this,
                playing_cards_created: [true],
              };
            }
          }
          if (this.ability.name === 'Ride the Bus' && !context.blueprint) {
            let faces = false;
            for (let i = 0; i < context.scoring_hand.length; i++) {
              if (context.scoring_hand[i].is_face()) faces = true;
            }
            if (faces) {
              const last_mult = this.ability.mult;
              this.ability.mult = 0;
              if (last_mult > 0) {
                return {
                  card: this,
                  message: localize('k_reset'),
                };
              }
            } else {
              this.ability.mult = this.ability.mult + this.ability.extra;
            }
          }
          if (this.ability.name === 'Obelisk' && !context.blueprint) {
            let reset = true;
            const play_more_than = G.GAME.hands[context.scoring_name].played || 0;
            for (const [k, v] of Object.entries(G.GAME.hands)) {
              if (k !== context.scoring_name && v.played >= play_more_than && v.visible) reset = false;
            }
            if (reset) {
              if (this.ability.x_mult > 1) {
                this.ability.x_mult = 1;
                return {
                  card: this,
                  message: localize('k_reset'),
                };
              }
            } else {
              this.ability.x_mult = this.ability.x_mult + this.ability.extra;
            }
          }
          if (this.ability.name === 'Green Joker' && !context.blueprint) {
            this.ability.mult = this.ability.mult + this.ability.extra.hand_add;
            return {
              card: this,
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.extra.hand_add] }),
            };
          }
        } else if (context.after) {
          if (this.ability.name === 'Ice Cream' && !context.blueprint) {
            if (this.ability.extra.chips - this.ability.extra.chip_mod <= 0) {
              food_remove(this);
              return {
                message: localize('k_melted_ex'),
                colour: C.CHIPS,
              };
            } else {
              this.ability.extra.chips = this.ability.extra.chips - this.ability.extra.chip_mod;
              return {
                message: localize({ type: 'variable', key: 'a_chips_minus', vars: [this.ability.extra.chip_mod] }),
                colour: C.CHIPS,
              };
            }
          }
          if (this.ability.name === 'Seltzer' && !context.blueprint) {
            if (this.ability.extra - 1 <= 0) {
              food_remove(this);
              return {
                message: localize('k_drank_ex'),
                colour: C.FILTER,
              };
            } else {
              this.ability.extra = this.ability.extra - 1;
              return {
                message: this.ability.extra + '',
                colour: C.FILTER,
              };
            }
          }
        } else {
          if (this.ability.name === 'Loyalty Card') {
            this.ability.loyalty_remaining = lmod(this.ability.extra.every - 1 - (G.GAME.hands_played - this.ability.hands_played_at_create), this.ability.extra.every + 1);
            if (context.blueprint) {
              if (this.ability.loyalty_remaining === this.ability.extra.every) {
                return {
                  message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra.Xmult] }),
                  Xmult_mod: this.ability.extra.Xmult,
                };
              }
            } else {
              if (this.ability.loyalty_remaining === 0) {
                const _eval = (card) => card.ability.loyalty_remaining === 0;
                juice_card_until(this, _eval, true);
              } else if (this.ability.loyalty_remaining === this.ability.extra.every) {
                return {
                  message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra.Xmult] }),
                  Xmult_mod: this.ability.extra.Xmult,
                };
              }
            }
          }
          if (this.ability.name !== 'Seeing Double' && this.ability.x_mult > 1 && (this.ability.type === '' || next(context.poker_hands[this.ability.type]))) {
            return {
              message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.x_mult] }),
              colour: C.RED,
              Xmult_mod: this.ability.x_mult,
            };
          }
          if (this.ability.t_mult > 0 && next(context.poker_hands[this.ability.type])) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.t_mult] }),
              mult_mod: this.ability.t_mult,
            };
          }
          if (this.ability.t_chips > 0 && next(context.poker_hands[this.ability.type])) {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.t_chips] }),
              chip_mod: this.ability.t_chips,
            };
          }
          if (this.ability.name === 'Half Joker' && context.full_hand.length <= this.ability.extra.size) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.extra.mult] }),
              mult_mod: this.ability.extra.mult,
            };
          }
          if (this.ability.name === 'Abstract Joker') {
            let x = 0;
            for (let i = 0; i < G.jokers.cards.length; i++) {
              if (G.jokers.cards[i].ability.set === 'Joker') x = x + 1;
            }
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [x * this.ability.extra] }),
              mult_mod: x * this.ability.extra,
            };
          }
          if (this.ability.name === 'Acrobat' && G.GAME.current_round.hands_left === 0) {
            return {
              message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra] }),
              Xmult_mod: this.ability.extra,
            };
          }
          if (this.ability.name === 'Mystic Summit' && G.GAME.current_round.discards_left === this.ability.extra.d_remaining) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.extra.mult] }),
              mult_mod: this.ability.extra.mult,
            };
          }
          if (this.ability.name === 'Misprint') {
            const temp_Mult = pseudorandom('misprint', this.ability.extra.min, this.ability.extra.max);
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [temp_Mult] }),
              mult_mod: temp_Mult,
            };
          }
          if (this.ability.name === 'Banner' && G.GAME.current_round.discards_left > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [G.GAME.current_round.discards_left * this.ability.extra] }),
              chip_mod: G.GAME.current_round.discards_left * this.ability.extra,
            };
          }
          if (this.ability.name === 'Stuntman') {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra.chip_mod] }),
              chip_mod: this.ability.extra.chip_mod,
            };
          }
          if (this.ability.name === 'Matador') {
            if (G.GAME.blind.triggered) {
              ease_dollars(this.ability.extra);
              G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + this.ability.extra;
              G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
              return {
                message: localize('$') + this.ability.extra,
                dollars: this.ability.extra,
                colour: C.MONEY,
              };
            }
          }
          if (this.ability.name === 'Supernova') {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [G.GAME.hands[context.scoring_name].played] }),
              mult_mod: G.GAME.hands[context.scoring_name].played,
            };
          }
          if (this.ability.name === 'Ceremonial Dagger' && this.ability.mult > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Vagabond' && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            if (G.GAME.dollars <= this.ability.extra) {
              G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
              G.E_MANAGER.add_event(() => {
                const card = create_card('Tarot', G.consumeables, null, null, null, null, null, 'vag');
                card.add_to_deck();
                G.consumeables.emplace(card);
                G.GAME.consumeable_buffer = 0;
              });
              return {
                message: localize('k_plus_tarot'),
                card: this,
              };
            }
          }
          if (this.ability.name === 'Superposition' && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            let aces = 0;
            for (let i = 0; i < context.scoring_hand.length; i++) {
              if (context.scoring_hand[i].get_id() === 14) aces = aces + 1;
            }
            if (aces >= 1 && next(context.poker_hands['Straight'])) {
              const card_type = 'Tarot';
              G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
              G.E_MANAGER.add_event(() => {
                const card = create_card(card_type, G.consumeables, null, null, null, null, null, 'sup');
                card.add_to_deck();
                G.consumeables.emplace(card);
                G.GAME.consumeable_buffer = 0;
              });
              return {
                message: localize('k_plus_tarot'),
                colour: C.SECONDARY_SET.Tarot,
                card: this,
              };
            }
          }
          if (this.ability.name === 'Seance' && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            if (next(context.poker_hands[this.ability.extra.poker_hand])) {
              G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
              G.E_MANAGER.add_event(() => {
                const card = create_card('Spectral', G.consumeables, null, null, null, null, null, 'sea');
                card.add_to_deck();
                G.consumeables.emplace(card);
                G.GAME.consumeable_buffer = 0;
              });
              return {
                message: localize('k_plus_spectral'),
                colour: C.SECONDARY_SET.Spectral,
                card: this,
              };
            }
          }
          if (this.ability.name === 'Flower Pot') {
            const suits = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
            for (let i = 0; i < context.scoring_hand.length; i++) {
              const sc = context.scoring_hand[i];
              if (sc.ability.name !== 'Wild Card') {
                if (sc.is_suit('Hearts', true) && suits.Hearts === 0) suits.Hearts = suits.Hearts + 1;
                else if (sc.is_suit('Diamonds', true) && suits.Diamonds === 0) suits.Diamonds = suits.Diamonds + 1;
                else if (sc.is_suit('Spades', true) && suits.Spades === 0) suits.Spades = suits.Spades + 1;
                else if (sc.is_suit('Clubs', true) && suits.Clubs === 0) suits.Clubs = suits.Clubs + 1;
              }
            }
            for (let i = 0; i < context.scoring_hand.length; i++) {
              const sc = context.scoring_hand[i];
              if (sc.ability.name === 'Wild Card') {
                if (sc.is_suit('Hearts') && suits.Hearts === 0) suits.Hearts = suits.Hearts + 1;
                else if (sc.is_suit('Diamonds') && suits.Diamonds === 0) suits.Diamonds = suits.Diamonds + 1;
                else if (sc.is_suit('Spades') && suits.Spades === 0) suits.Spades = suits.Spades + 1;
                else if (sc.is_suit('Clubs') && suits.Clubs === 0) suits.Clubs = suits.Clubs + 1;
              }
            }
            if (suits.Hearts > 0 &&
                suits.Diamonds > 0 &&
                suits.Spades > 0 &&
                suits.Clubs > 0) {
              return {
                message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra] }),
                Xmult_mod: this.ability.extra,
              };
            }
          }
          if (this.ability.name === 'Seeing Double') {
            const suits = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
            for (let i = 0; i < context.scoring_hand.length; i++) {
              const sc = context.scoring_hand[i];
              if (sc.ability.name !== 'Wild Card') {
                if (sc.is_suit('Hearts')) suits.Hearts = suits.Hearts + 1;
                if (sc.is_suit('Diamonds')) suits.Diamonds = suits.Diamonds + 1;
                if (sc.is_suit('Spades')) suits.Spades = suits.Spades + 1;
                if (sc.is_suit('Clubs')) suits.Clubs = suits.Clubs + 1;
              }
            }
            for (let i = 0; i < context.scoring_hand.length; i++) {
              const sc = context.scoring_hand[i];
              if (sc.ability.name === 'Wild Card') {
                if (sc.is_suit('Clubs') && suits.Clubs === 0) suits.Clubs = suits.Clubs + 1;
                else if (sc.is_suit('Diamonds') && suits.Diamonds === 0) suits.Diamonds = suits.Diamonds + 1;
                else if (sc.is_suit('Spades') && suits.Spades === 0) suits.Spades = suits.Spades + 1;
                else if (sc.is_suit('Hearts') && suits.Hearts === 0) suits.Hearts = suits.Hearts + 1;
              }
            }
            if ((suits.Hearts > 0 ||
                 suits.Diamonds > 0 ||
                 suits.Spades > 0) &&
                suits.Clubs > 0) {
              return {
                message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra] }),
                Xmult_mod: this.ability.extra,
              };
            }
          }
          if (this.ability.name === 'Wee Joker') {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra.chips] }),
              chip_mod: this.ability.extra.chips,
              colour: C.CHIPS,
            };
          }
          if (this.ability.name === 'Castle' && this.ability.extra.chips > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra.chips] }),
              chip_mod: this.ability.extra.chips,
              colour: C.CHIPS,
            };
          }
          if (this.ability.name === 'Blue Joker' && G.deck.cards.length > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra * G.deck.cards.length] }),
              chip_mod: this.ability.extra * G.deck.cards.length,
              colour: C.CHIPS,
            };
          }
          if (this.ability.name === 'Erosion' && (G.GAME.starting_deck_size - G.playing_cards.length) > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.extra * (G.GAME.starting_deck_size - G.playing_cards.length)] }),
              mult_mod: this.ability.extra * (G.GAME.starting_deck_size - G.playing_cards.length),
              colour: C.MULT,
            };
          }
          if (this.ability.name === 'Square Joker') {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra.chips] }),
              chip_mod: this.ability.extra.chips,
              colour: C.CHIPS,
            };
          }
          if (this.ability.name === 'Runner') {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra.chips] }),
              chip_mod: this.ability.extra.chips,
              colour: C.CHIPS,
            };
          }
          if (this.ability.name === 'Ice Cream') {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra.chips] }),
              chip_mod: this.ability.extra.chips,
              colour: C.CHIPS,
            };
          }
          if (this.ability.name === 'Stone Joker' && this.ability.stone_tally > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra * this.ability.stone_tally] }),
              chip_mod: this.ability.extra * this.ability.stone_tally,
              colour: C.CHIPS,
            };
          }
          if (this.ability.name === 'Steel Joker' && this.ability.steel_tally > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_xmult', vars: [1 + this.ability.extra * this.ability.steel_tally] }),
              Xmult_mod: 1 + this.ability.extra * this.ability.steel_tally,
              colour: C.MULT,
            };
          }
          if (this.ability.name === 'Bull' && (G.GAME.dollars + (G.GAME.dollar_buffer || 0)) > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_chips', vars: [this.ability.extra * Math.max(0, G.GAME.dollars + (G.GAME.dollar_buffer || 0))] }),
              chip_mod: this.ability.extra * Math.max(0, G.GAME.dollars + (G.GAME.dollar_buffer || 0)),
              colour: C.CHIPS,
            };
          }
          if (this.ability.name === "Driver's License") {
            if ((this.ability.driver_tally || 0) >= 16) {
              return {
                message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra] }),
                Xmult_mod: this.ability.extra,
              };
            }
          }
          if (this.ability.name === 'Blackboard') {
            let black_suits = 0, all_cards = 0;
            for (const v of G.hand.cards) {
              all_cards = all_cards + 1;
              if (v.is_suit('Clubs', null, true) || v.is_suit('Spades', null, true)) {
                black_suits = black_suits + 1;
              }
            }
            if (black_suits === all_cards) {
              return {
                message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra] }),
                Xmult_mod: this.ability.extra,
              };
            }
          }
          if (this.ability.name === 'Joker Stencil') {
            if ((G.jokers.config.card_limit - G.jokers.cards.length) > 0) {
              return {
                message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.x_mult] }),
                Xmult_mod: this.ability.x_mult,
              };
            }
          }
          if (this.ability.name === 'Swashbuckler' && this.ability.mult > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Joker') {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Spare Trousers' && this.ability.mult > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Ride the Bus' && this.ability.mult > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Flash Card' && this.ability.mult > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Popcorn' && this.ability.mult > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Green Joker' && this.ability.mult > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Fortune Teller' && G.GAME.consumeable_usage_total && G.GAME.consumeable_usage_total.tarot > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [G.GAME.consumeable_usage_total.tarot] }),
              mult_mod: G.GAME.consumeable_usage_total.tarot,
            };
          }
          if (this.ability.name === 'Gros Michel') {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.extra.mult] }),
              mult_mod: this.ability.extra.mult,
            };
          }
          if (this.ability.name === 'Cavendish') {
            return {
              message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra.Xmult] }),
              Xmult_mod: this.ability.extra.Xmult,
            };
          }
          if (this.ability.name === 'Red Card' && this.ability.mult > 0) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.mult] }),
              mult_mod: this.ability.mult,
            };
          }
          if (this.ability.name === 'Card Sharp' && G.GAME.hands[context.scoring_name] && G.GAME.hands[context.scoring_name].played_this_round > 1) {
            return {
              message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.extra.Xmult] }),
              Xmult_mod: this.ability.extra.Xmult,
            };
          }
          if (this.ability.name === 'Bootstraps' && Math.floor((G.GAME.dollars + (G.GAME.dollar_buffer || 0)) / this.ability.extra.dollars) >= 1) {
            return {
              message: localize({ type: 'variable', key: 'a_mult', vars: [this.ability.extra.mult * Math.floor((G.GAME.dollars + (G.GAME.dollar_buffer || 0)) / this.ability.extra.dollars)] }),
              mult_mod: this.ability.extra.mult * Math.floor((G.GAME.dollars + (G.GAME.dollar_buffer || 0)) / this.ability.extra.dollars),
            };
          }
          if (this.ability.name === 'Caino' && this.ability.caino_xmult > 1) {
            return {
              message: localize({ type: 'variable', key: 'a_xmult', vars: [this.ability.caino_xmult] }),
              Xmult_mod: this.ability.caino_xmult,
            };
          }
        }
      }
    }
  }
  return undefined;
};
