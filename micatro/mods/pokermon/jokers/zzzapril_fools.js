// Pokermon 3.9.1 — pokemon/zzzapril_fools.lua (batch 17): the April Fools jokers. 3.9.1 registers them only when the
// `pokemon_aprilfools` config option is on (an OPTION, not a date: nothing in 3.9.1 reads the clock for them); ours are always
// registered (collection, saves, replays) and, like 3.9.1, only offered with the option (index.js APRIL_FOOLS: their in_pool,
// and POKE_POOL_RULES for the random-Pokémon picks).
//   A Billion Lions: defined in jokers/zotherjokers.js (3.2.1 had it there; unchanged in 3.9.1).
//   Spiclops (an April Fools Spidops; Legendary badge, Uncommon): +1 Hazard layer, +4 hand size; every 8th playing card added
//     gets a random Seal; when a Blind is selected, + hand size equal to the Hazard level and -1 discard; a first hand of only
//     Hazard cards gives + hand size this round per card; every third Hazard card held at end of round gets a Blue Seal; every 2
//     Hazard cards drawn make a Planet card of your most played hand.
//   Miror Budicolo ("Ludicolo", a Water Basic): added to your deck, it turns into a Ludicolo playing card (m_poke_ludicolo, no
//     rank or suit, always scores, "Ludicolo!": enhancements/enhancement1.js) and leaves the joker row.
//   Capture Disc: +1 Mult each time it is shaken (dragged 25 x its Mult in game units: Lua card.drag), reset at end of round.
//     The drag is the player's input, so it is an ACTION (the board sends {type: 'poke_capture_disc_drag', id, segs}: the drag's
//     per-move distances in Balatro units, js/ui/board.js), applied here frame by frame as the Lua's card.drag: replays and
//     resumes re-simulate it exactly. A drag that only moves the card still counts (the Lua's drag does too).
import {
  G, P_CENTERS, P_CENTER_POOLS, localize, card_eval_status_text, ease_discard, create_card, defineJokers, has_enhancement, scale_card,
  poke_change_hazard_level, type_tooltip, remove,
} from '../api.js';
import { poll_seal_guaranteed } from './pokejokers_05.js';

const FILE = 'pokemon/zzzapril_fools.lua';
/** The zzzapril_fools.lua jokers (index.js: offered only with pokemon_aprilfools). */
export const APRIL_FOOLS = new Set(['billion_lions', 'spiclops', 'miror_budicolo', 'capture_disc']);
/** Capture Disc's shake requirement (capture_disc_load shake_rqmt): 25 units per point of Mult it has. */
export const SHAKE_RQMT = 25;
/** The most segments one drag action may carry (a long drag keeps its first ones). */
export const MAX_DRAG_SEGS = 4000;

defineJokers({
  spiclops: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const e = card.ability.extra;
      return { vars: [e.hazard_level, e.h_size, e.card_goal, e.cards_added, e.planet_goal, e.hazards_drawn] };
    },
    calculate(self, card, context) {
      // a random seal on every 8th playing card added to the deck
      if (context.playing_card_added && !card.getting_sliced && context.cards && !context.blueprint) {
        if (Array.isArray(context.cards) && context.cards.length > 0) {
          for (const v of context.cards) {
            card.ability.extra.cards_added = card.ability.extra.cards_added + 1;
            if (card.ability.extra.cards_added === card.ability.extra.card_goal) {
              card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_sticky_web_ex') });
              v.set_seal(poll_seal_guaranteed(), true);
              card.ability.extra.cards_added = 0;
            }
          }
        }
      }
      // hand size equal to the Hazard level (this round), and one discard less
      if (context.setting_blind) {
        ease_discard(-1);
        const level = Math.min(G.GAME.poke_hazard_max ?? 3, G.GAME.poke_hazard_level || 0);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_handsize', vars: [level] }) });
        G.hand.change_size(level);
        G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + level;
      }
      // a first hand of only Hazard cards: + hand size this round per scoring card
      if (context.joker_main && context.cardarea === G.jokers && G.GAME.current_round.hands_played === 0 && !context.blueprint) {
        const all_hazards = context.full_hand.every((v) => has_enhancement(v, 'm_poke_hazard'));
        if (all_hazards) {
          const size_up = context.scoring_hand.length;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_handsize', vars: [size_up] }) });
          G.hand.change_size(size_up);
          G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + size_up;
        }
      }
      // a Blue Seal on every third Hazard card held at end of round
      if (context.end_of_round && !context.individual && !context.repetition) {
        let hazard_count = 0;
        for (const c of (G.hand && G.hand.cards) || []) {
          if (has_enhancement(c, 'm_poke_hazard')) {
            hazard_count = hazard_count + 1;
            if (hazard_count % 3 === 0) c.set_seal('Blue', null, true);
          }
        }
      }
      // every 2 Hazard cards drawn: a Planet card of the most played hand
      if (context.hand_drawn) {
        let count = 0;
        for (const v of G.hand.cards) if (has_enhancement(v, 'm_poke_hazard')) count = count + 1;
        if (count > 0) {
          if (!context.blueprint) card.ability.extra.hazards_drawn = card.ability.extra.hazards_drawn + count;
          if (card.ability.extra.hazards_drawn >= card.ability.extra.planet_goal && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            count = Math.floor(card.ability.extra.hazards_drawn / card.ability.extra.planet_goal);
            card.ability.extra.hazards_drawn = card.ability.extra.hazards_drawn % card.ability.extra.planet_goal;
            let _planet, _hand, _tally = 0;
            for (const v of G.handlist) {
              if (G.GAME.hands[v].visible && G.GAME.hands[v].played > _tally) { _hand = v; _tally = G.GAME.hands[v].played; }
            }
            if (_hand) for (const v of P_CENTER_POOLS.Planet) if (v.config && v.config.hand_type === _hand) _planet = v.key;
            for (let i = 1; i <= count; i++) {
              if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
                const _card = create_card('Planet', G.consumeables, null, null, null, null, _planet);
                _card.add_to_deck();
                G.consumeables.emplace(_card);
                card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_planet'), colour: 'Planet' });
              }
            }
          }
        }
      }
      return undefined;
    },
    add_to_deck(self, card) {
      G.hand.change_size(card.ability.extra.h_size);
      poke_change_hazard_level(card.ability.extra.hazard_level);
    },
    remove_from_deck(self, card) {
      G.hand.change_size(-card.ability.extra.h_size);
      poke_change_hazard_level(-card.ability.extra.hazard_level);
    },
  },
  miror_budicolo: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate() { return undefined; },
    // It adds itself to the deck: a Ludicolo playing card joins the deck, and this joker goes (SMODS.destroy_cards, immediate).
    add_to_deck(self, card) {
      const _card = create_card('Base', G.deck, null, null, true, null, null, null);
      _card.set_ability(P_CENTERS.m_poke_ludicolo);
      G.playing_card = (G.playing_card || 0) + 1;
      _card.playing_card = G.playing_card;
      G.playing_cards.push(_card);
      // (SMODS.destroy_cards(card, true, true, true): even an Eternal one goes, at once)
      card.getting_sliced = true;
      G.E_MANAGER.add_event(() => { if (card.area === G.jokers && !card.gone) remove(null, card, {}); });
      G.E_MANAGER.add_event(() => {
        G.deck.emplace(_card);
        if (G.GAME.blind) G.GAME.blind.debuff_card(_card);
        for (const j of G.jokers.cards) j.calculate_joker({ playing_card_added: true, cards: [_card] });
      });
    },
  },
  capture_disc: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.mult_mod, card.ability.extra.mult] }; },
    calculate(self, card, context) {
      if (context.joker_main && card.ability.extra.mult > 0) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      if (context.end_of_round && context.game_over === false && context.main_eval && !context.blueprint && card.ability.extra.mult > 0) {
        card.ability.extra.mult = 0;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
}, FILE);

/**
 * capture_disc_load's card.drag, for one whole drag: `segs` = the distance moved on each drag frame (game units). Each frame adds
 * its distance; past 25 x the current Mult the count starts over and the Disc gains +1 Mult (SMODS.scale_card). -> the shakes.
 */
export function capture_disc_drag(card, segs) {
  let shakes = 0, dist = 0;
  for (const d of segs) {
    dist = dist + d;
    if (dist > SHAKE_RQMT * card.ability.extra.mult) {
      dist = 0;
      scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod' });
      shakes = shakes + 1;
    }
  }
  return shakes;
}
/**
 * The mod action hook: {type: 'poke_capture_disc_drag', id, segs} — a Capture Disc in the joker row was dragged (js/ui/board.js
 * sends it when the drag ends). Any time the joker row can be dragged. undefined = not ours.
 */
export function capture_disc_action(a) {
  if (!a || a.type !== 'poke_capture_disc_drag') return undefined;
  const card = G.jokers && G.jokers.cards.find((c) => c.sort_id === a.id);
  if (!card || card.config.center.key !== 'j_poke_capture_disc') return 'no Capture Disc';
  if (!Array.isArray(a.segs) || a.segs.length > MAX_DRAG_SEGS || !a.segs.every((d) => typeof d === 'number' && Number.isFinite(d) && d >= 0 && d < 1000)) return 'bad drag';
  capture_disc_drag(card, a.segs);
  return true;
}
