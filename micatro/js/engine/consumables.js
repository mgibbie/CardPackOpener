// Micatro — consumables, boosters and vouchers.
//
// Line-for-line port of Balatro card.lua:
//   Card:use_consumeable      (1091-1521)
//   Card:can_use_consumeable  (1523-1579)
//   Card:check_use            (1581-1589)
//   Card:open                 (1681-1811)
//   Card:redeem               (1813-1878)
//   Card:apply_to_run         (1880-1971)
// plus the bits of Card:update (4154-4223) these read (mod_num, Temperance's
// money, the Wheel/Ectoplasm/Hex eligible-joker lists), stop_use/dec_stop_use,
// playing_card_joker_effects and set_voucher_usage from misc_functions.lua.
//
// Visual-only events (juice, delays, DynaText) are dropped or become emits;
// every state change stays in a G.E_MANAGER event in Lua's order.

import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card,
  emit, play_sound, attention_text, localize, update_hand_text,
  pseudoseed, pseudorandom, pseudorandom_element, pseudoshuffle,
  ease_dollars, ease_discard, ease_hands_played, ease_ante, level_up_hand,
  create_card, create_playing_card, copy_card, poll_edition, all_cards, next,
  set_consumeable_usage, check_for_unlock, inc_career_stat,
} from './core.js';
import { change_shop_size } from './run.js';

// ----------------------------------------------------- misc_functions.lua
/** stop_use(): block consumable use until the queue has drained ~7 events. */
export function stop_use() {
  G.GAME.STOP_USE = (G.GAME.STOP_USE || 0) + 1;
  dec_stop_use(6);
}
export function dec_stop_use(_depth) {
  if (_depth > 0) {
    G.E_MANAGER.add_event(() => { dec_stop_use(_depth - 1); });
  } else {
    G.E_MANAGER.add_event(() => { G.GAME.STOP_USE = Math.max(G.GAME.STOP_USE - 1, 0); });
  }
}
export function playing_card_joker_effects(cards) {
  for (let i = 0; i < G.jokers.cards.length; i++) {
    G.jokers.cards[i].calculate_joker({ playing_card_added: true, cards });
  }
}
/** Profile statistics only in Balatro — nothing to track per run. */
export function set_voucher_usage(card) { /* profile stats are out of scope */ }
function alert_no_space(card, area) { emit('no_space', { card: card.sort_id, area: area && area.name }); }

/**
 * The consumable-related part of Card:update(dt) (card.lua 4154-4223). Balatro
 * recomputes these every frame; Micatro recomputes them whenever they're read.
 */
export function update_consumeable(card) {
  if (card.ability.consumeable && card.ability.consumeable.max_highlighted) {
    card.ability.consumeable.mod_num = Math.min(5, card.ability.consumeable.max_highlighted);
  }
  if (card.ability.name === 'Temperance') {
    card.ability.money = 0;
    for (let i = 0; i < G.jokers.cards.length; i++) {
      if (G.jokers.cards[i].ability.set === 'Joker') card.ability.money = card.ability.money + G.jokers.cards[i].sell_cost;
    }
    card.ability.money = Math.min(card.ability.money, card.ability.extra);
  }
  if (card.ability.name === 'The Wheel of Fortune') {
    card.eligible_strength_jokers = [];
    for (const v of G.jokers.cards) {
      if (v.ability.set === 'Joker' && !v.edition) card.eligible_strength_jokers.push(v);
    }
  }
  if (card.ability.name === 'Ectoplasm' || card.ability.name === 'Hex') {
    card.eligible_editionless_jokers = [];
    for (const v of G.jokers.cards) {
      if (v.ability.set === 'Joker' && !v.edition) card.eligible_editionless_jokers.push(v);
    }
  }
}

/** Screen-x stand-in: a hand card's position is its index in G.hand.cards. */
const hand_x = (c) => G.hand.cards.indexOf(c);

// ------------------------------------------------------ Card:use_consumeable
Card.prototype.use_consumeable = function (area, copier) {
  stop_use();
  if (!copier) set_consumeable_usage(this);
  if (this.debuff) return undefined;
  update_consumeable(this);
  const used_tarot = copier || this;

  if (this.ability.consumeable.max_highlighted) {
    update_hand_text({ immediate: true, nopulse: true, delay: 0 }, { mult: 0, chips: 0, level: '', handname: '' });
  }

  if (this.ability.consumeable.mod_conv || this.ability.consumeable.suit_conv) {
    G.E_MANAGER.add_event(() => {
      play_sound('tarot1');
      used_tarot.juice_up(0.3, 0.5);
    });
    for (let i = 0; i < G.hand.highlighted.length; i++) {
      const percent = 1.15 - ((i + 1) - 0.999) / (G.hand.highlighted.length - 0.998) * 0.3;
      G.E_MANAGER.add_event(() => { G.hand.highlighted[i].flip(); play_sound('card1', percent); G.hand.highlighted[i].juice_up(0.3, 0.3); });
    }
    if (this.ability.name === 'Death') {
      let rightmost = G.hand.highlighted[0];
      for (let i = 0; i < G.hand.highlighted.length; i++) if (hand_x(G.hand.highlighted[i]) > hand_x(rightmost)) rightmost = G.hand.highlighted[i];
      for (let i = 0; i < G.hand.highlighted.length; i++) {
        G.E_MANAGER.add_event(() => {
          if (G.hand.highlighted[i] !== rightmost) {
            copy_card(rightmost, G.hand.highlighted[i]);
          }
        });
      }
    } else if (this.ability.name === 'Strength') {
      for (let i = 0; i < G.hand.highlighted.length; i++) {
        G.E_MANAGER.add_event(() => {
          const card = G.hand.highlighted[i];
          const suit_prefix = card.base.suit.substring(0, 1) + '_';
          let rank_suffix = card.base.id === 14 ? 2 : Math.min(card.base.id + 1, 14);
          if (rank_suffix < 10) rank_suffix = String(rank_suffix);
          else if (rank_suffix === 10) rank_suffix = 'T';
          else if (rank_suffix === 11) rank_suffix = 'J';
          else if (rank_suffix === 12) rank_suffix = 'Q';
          else if (rank_suffix === 13) rank_suffix = 'K';
          else if (rank_suffix === 14) rank_suffix = 'A';
          card.set_base(P_CARDS[suit_prefix + rank_suffix]);
        });
      }
    } else if (this.ability.consumeable.suit_conv) {
      for (let i = 0; i < G.hand.highlighted.length; i++) {
        G.E_MANAGER.add_event(() => { G.hand.highlighted[i].change_suit(this.ability.consumeable.suit_conv); });
      }
    } else {
      for (let i = 0; i < G.hand.highlighted.length; i++) {
        G.E_MANAGER.add_event(() => { G.hand.highlighted[i].set_ability(P_CENTERS[this.ability.consumeable.mod_conv]); });
      }
    }
    for (let i = 0; i < G.hand.highlighted.length; i++) {
      const percent = 0.85 + ((i + 1) - 0.999) / (G.hand.highlighted.length - 0.998) * 0.3;
      G.E_MANAGER.add_event(() => { G.hand.highlighted[i].flip(); play_sound('tarot2', percent, 0.6); G.hand.highlighted[i].juice_up(0.3, 0.3); });
    }
    G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
  }
  if (this.ability.name === 'Black Hole') {
    update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, { handname: localize('k_all_hands'), chips: '...', mult: '...', level: '' });
    G.E_MANAGER.add_event(() => {
      play_sound('tarot1');
      this.juice_up(0.8, 0.5);
      G.TAROT_INTERRUPT_PULSE = true;
    });
    update_hand_text({ delay: 0 }, { mult: '+', StatusText: true });
    G.E_MANAGER.add_event(() => {
      play_sound('tarot1');
      this.juice_up(0.8, 0.5);
    });
    update_hand_text({ delay: 0 }, { chips: '+', StatusText: true });
    G.E_MANAGER.add_event(() => {
      play_sound('tarot1');
      this.juice_up(0.8, 0.5);
      G.TAROT_INTERRUPT_PULSE = undefined;
    });
    update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.9, delay: 0 }, { level: '+1' });
    for (const k of Object.keys(G.GAME.hands)) {
      level_up_hand(this, k, true);
    }
    update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
  }
  if (this.ability.name === 'Talisman' || this.ability.name === 'Deja Vu' || this.ability.name === 'Trance' || this.ability.name === 'Medium') {
    const conv_card = G.hand.highlighted[0];
    G.E_MANAGER.add_event(() => {
      play_sound('tarot1');
      used_tarot.juice_up(0.3, 0.5);
    });
    G.E_MANAGER.add_event(() => {
      conv_card.set_seal(this.ability.extra, undefined, true);
    });
    G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
  }
  if (this.ability.name === 'Aura') {
    G.E_MANAGER.add_event(() => {
      const edition = poll_edition('aura', undefined, true, true);
      const aura_card = G.hand.highlighted[0];
      aura_card.set_edition(edition, true);
      used_tarot.juice_up(0.3, 0.5);
    });
  }
  if (this.ability.name === 'Cryptid') {
    G.E_MANAGER.add_event(() => {
      const new_cards = [];
      for (let i = 1; i <= this.ability.extra; i++) {
        G.playing_card = (G.playing_card && G.playing_card + 1) || 1;
        const _card = copy_card(G.hand.highlighted[0], undefined, undefined, G.playing_card);
        _card.add_to_deck();
        G.deck.config.card_limit = G.deck.config.card_limit + 1;
        G.playing_cards.push(_card);
        G.hand.emplace(_card);
        emit('materialize', { card: _card.sort_id });
        new_cards.push(_card);
      }
      playing_card_joker_effects(new_cards);
    });
  }
  if (this.ability.name === 'Sigil' || this.ability.name === 'Ouija') {
    G.E_MANAGER.add_event(() => {
      play_sound('tarot1');
      used_tarot.juice_up(0.3, 0.5);
    });
    for (let i = 0; i < G.hand.cards.length; i++) {
      const percent = 1.15 - ((i + 1) - 0.999) / (G.hand.cards.length - 0.998) * 0.3;
      G.E_MANAGER.add_event(() => { G.hand.cards[i].flip(); play_sound('card1', percent); G.hand.cards[i].juice_up(0.3, 0.3); });
    }
    if (this.ability.name === 'Sigil') {
      const [_suit] = pseudorandom_element(['S', 'H', 'D', 'C'], pseudoseed('sigil'));
      for (let i = 0; i < G.hand.cards.length; i++) {
        G.E_MANAGER.add_event(() => {
          const card = G.hand.cards[i];
          const suit_prefix = _suit + '_';
          const id = card.base.id;
          const rank_suffix = id < 10 ? String(id) :
            id === 10 ? 'T' : id === 11 ? 'J' :
            id === 12 ? 'Q' : id === 13 ? 'K' :
            id === 14 ? 'A' : false;
          card.set_base(P_CARDS[suit_prefix + rank_suffix]);
        });
      }
    }
    if (this.ability.name === 'Ouija') {
      const [_rank] = pseudorandom_element(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'], pseudoseed('ouija'));
      for (let i = 0; i < G.hand.cards.length; i++) {
        G.E_MANAGER.add_event(() => {
          const card = G.hand.cards[i];
          const suit_prefix = card.base.suit.substring(0, 1) + '_';
          const rank_suffix = _rank;
          card.set_base(P_CARDS[suit_prefix + rank_suffix]);
        });
      }
      G.hand.change_size(-1);
    }
    for (let i = 0; i < G.hand.cards.length; i++) {
      const percent = 0.85 + ((i + 1) - 0.999) / (G.hand.cards.length - 0.998) * 0.3;
      G.E_MANAGER.add_event(() => { G.hand.cards[i].flip(); play_sound('tarot2', percent, 0.6); G.hand.cards[i].juice_up(0.3, 0.3); });
    }
  }
  if (this.ability.consumeable.hand_type) {
    const ht = this.ability.consumeable.hand_type;
    update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, { handname: localize(ht, 'poker_hands'), chips: G.GAME.hands[ht].chips, mult: G.GAME.hands[ht].mult, level: G.GAME.hands[ht].level });
    level_up_hand(used_tarot, ht);
    update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
  }
  if (this.ability.consumeable.remove_card) {
    const destroyed_cards = [];
    if (this.ability.name === 'The Hanged Man') {
      for (let i = G.hand.highlighted.length - 1; i >= 0; i--) {
        destroyed_cards.push(G.hand.highlighted[i]);
      }
      G.E_MANAGER.add_event(() => {
        play_sound('tarot1');
        used_tarot.juice_up(0.3, 0.5);
      });
      G.E_MANAGER.add_event(() => {
        for (let i = G.hand.highlighted.length - 1; i >= 0; i--) {
          const card = G.hand.highlighted[i];
          if (card.ability.name === 'Glass Card') {
            card.shatter();
          } else {
            card.start_dissolve();
          }
        }
      });
    } else if (this.ability.name === 'Familiar' || this.ability.name === 'Grim' || this.ability.name === 'Incantation') {
      destroyed_cards.push(pseudorandom_element(G.hand.cards, pseudoseed('random_destroy'))[0]);
      G.E_MANAGER.add_event(() => {
        play_sound('tarot1');
        used_tarot.juice_up(0.3, 0.5);
      });
      G.E_MANAGER.add_event(() => {
        for (let i = destroyed_cards.length - 1; i >= 0; i--) {
          const card = destroyed_cards[i];
          if (card.ability.name === 'Glass Card') {
            card.shatter();
          } else {
            card.start_dissolve();
          }
        }
      });
      G.E_MANAGER.add_event(() => {
        const cards = [];
        for (let i = 1; i <= this.ability.extra; i++) {
          cards[i - 1] = true;
          let _suit, _rank;
          if (this.ability.name === 'Familiar') {
            _rank = pseudorandom_element(['J', 'Q', 'K'], pseudoseed('familiar_create'))[0];
            _suit = pseudorandom_element(['S', 'H', 'D', 'C'], pseudoseed('familiar_create'))[0];
          } else if (this.ability.name === 'Grim') {
            _rank = 'A';
            _suit = pseudorandom_element(['S', 'H', 'D', 'C'], pseudoseed('grim_create'))[0];
          } else if (this.ability.name === 'Incantation') {
            _rank = pseudorandom_element(['2', '3', '4', '5', '6', '7', '8', '9', 'T'], pseudoseed('incantation_create'))[0];
            _suit = pseudorandom_element(['S', 'H', 'D', 'C'], pseudoseed('incantation_create'))[0];
          }
          _suit = _suit || 'S'; _rank = _rank || 'A';
          const cen_pool = [];
          for (const v of P_CENTER_POOLS.Enhanced) {
            if (v.key !== 'm_stone') cen_pool.push(v);
          }
          create_playing_card({ front: P_CARDS[_suit + '_' + _rank], center: pseudorandom_element(cen_pool, pseudoseed('spe_card'))[0] }, G.hand);
        }
        playing_card_joker_effects(cards);
      });
    } else if (this.ability.name === 'Immolate') {
      const temp_hand = [];
      for (const v of G.hand.cards) temp_hand.push(v);
      temp_hand.sort((a, b) => (a.playing_card || 0) - (b.playing_card || 0));
      pseudoshuffle(temp_hand, pseudoseed('immolate'));

      for (let i = 0; i < this.ability.extra.destroy; i++) if (temp_hand[i]) destroyed_cards.push(temp_hand[i]);

      G.E_MANAGER.add_event(() => {
        play_sound('tarot1');
        used_tarot.juice_up(0.3, 0.5);
      });
      G.E_MANAGER.add_event(() => {
        for (let i = destroyed_cards.length - 1; i >= 0; i--) {
          const card = destroyed_cards[i];
          if (card.ability.name === 'Glass Card') {
            card.shatter();
          } else {
            card.start_dissolve();
          }
        }
      });
      ease_dollars(this.ability.extra.dollars);
    }
    for (let i = 0; i < G.jokers.cards.length; i++) {
      G.jokers.cards[i].calculate_joker({ remove_playing_cards: true, removed: destroyed_cards });
    }
  }
  if (this.ability.name === 'The Fool') {
    G.E_MANAGER.add_event(() => {
      if (G.consumeables.config.card_limit > G.consumeables.cards.length) {
        play_sound('timpani');
        const card = create_card('Tarot_Planet', G.consumeables, null, null, null, null, G.GAME.last_tarot_planet, 'fool');
        card.add_to_deck();
        G.consumeables.emplace(card);
        used_tarot.juice_up(0.3, 0.5);
      }
    });
  }
  if (this.ability.name === 'The Hermit') {
    G.E_MANAGER.add_event(() => {
      play_sound('timpani');
      used_tarot.juice_up(0.3, 0.5);
      ease_dollars(Math.max(0, Math.min(G.GAME.dollars, this.ability.extra)), true);
    });
  }
  if (this.ability.name === 'Temperance') {
    G.E_MANAGER.add_event(() => {
      play_sound('timpani');
      used_tarot.juice_up(0.3, 0.5);
      update_consumeable(this); // Card:update ran every frame in Lua
      ease_dollars(this.ability.money, true);
    });
  }
  if (this.ability.name === 'The Emperor' || this.ability.name === 'The High Priestess') {
    const n = Math.min(this.ability.consumeable.tarots || this.ability.consumeable.planets, G.consumeables.config.card_limit - G.consumeables.cards.length);
    for (let i = 1; i <= n; i++) {
      G.E_MANAGER.add_event(() => {
        if (G.consumeables.config.card_limit > G.consumeables.cards.length) {
          play_sound('timpani');
          const card = create_card(this.ability.name === 'The Emperor' ? 'Tarot' : 'Planet', G.consumeables, null, null, null, null, null, this.ability.name === 'The Emperor' ? 'emp' : 'pri');
          card.add_to_deck();
          G.consumeables.emplace(card);
          used_tarot.juice_up(0.3, 0.5);
        }
      });
    }
  }
  if (this.ability.name === 'Judgement' || this.ability.name === 'The Soul') {
    G.E_MANAGER.add_event(() => {
      play_sound('timpani');
      const card = create_card('Joker', G.jokers, this.ability.name === 'The Soul', null, null, null, null, this.ability.name === 'Judgement' ? 'jud' : 'sou');
      card.add_to_deck();
      G.jokers.emplace(card);
      if (this.ability.name === 'The Soul') check_for_unlock({ type: 'spawn_legendary' });
      used_tarot.juice_up(0.3, 0.5);
    });
  }
  if (this.ability.name === 'Ankh') {
    // Lua comment: if there are max Jokers and all are eternal OR there is a max of 1 joker this isn't possible already
    const deletable_jokers = [];
    for (const v of G.jokers.cards) {
      if (!v.ability.eternal) deletable_jokers.push(v);
    }
    const [chosen_joker] = pseudorandom_element(G.jokers.cards, pseudoseed('ankh_choice'));
    G.E_MANAGER.add_event(() => {
      for (const v of deletable_jokers) {
        if (v !== chosen_joker) {
          v.start_dissolve();
        }
      }
    });
    G.E_MANAGER.add_event(() => {
      const card = copy_card(chosen_joker, undefined, undefined, undefined, chosen_joker.edition && chosen_joker.edition.negative);
      emit('materialize', { card: card.sort_id });
      card.add_to_deck();
      if (card.edition && card.edition.negative) {
        card.set_edition(null, true);
      }
      G.jokers.emplace(card);
    });
  }
  if (this.ability.name === 'Wraith') {
    G.E_MANAGER.add_event(() => {
      play_sound('timpani');
      const card = create_card('Joker', G.jokers, null, 0.99, null, null, null, 'wra');
      card.add_to_deck();
      G.jokers.emplace(card);
      used_tarot.juice_up(0.3, 0.5);
      if (G.GAME.dollars !== 0) {
        ease_dollars(-G.GAME.dollars, true);
      }
    });
  }
  if (this.ability.name === 'The Wheel of Fortune' || this.ability.name === 'Ectoplasm' || this.ability.name === 'Hex') {
    const temp_pool = (this.ability.name === 'The Wheel of Fortune' && this.eligible_strength_jokers) ||
      ((this.ability.name === 'Ectoplasm' || this.ability.name === 'Hex') && this.eligible_editionless_jokers) || [];
    if (this.ability.name === 'Ectoplasm' || this.ability.name === 'Hex' || pseudorandom('wheel_of_fortune') < G.GAME.probabilities.normal / this.ability.extra) {
      G.E_MANAGER.add_event(() => {
        const [eligible_card] = pseudorandom_element(temp_pool, pseudoseed(
          (this.ability.name === 'The Wheel of Fortune' && 'wheel_of_fortune') ||
          (this.ability.name === 'Ectoplasm' && 'ectoplasm') ||
          (this.ability.name === 'Hex' && 'hex')));
        let edition = null;
        if (this.ability.name === 'Ectoplasm') {
          edition = { negative: true };
        } else if (this.ability.name === 'Hex') {
          edition = { polychrome: true };
        } else if (this.ability.name === 'The Wheel of Fortune') {
          edition = poll_edition('wheel_of_fortune', undefined, true, true);
        }
        eligible_card.set_edition(edition, true);
        check_for_unlock({ type: 'have_edition' });
        if (this.ability.name === 'Hex') {
          for (const v of G.jokers.cards.slice()) {
            if (v !== eligible_card && !v.ability.eternal) v.start_dissolve();
          }
        }
        if (this.ability.name === 'Ectoplasm') {
          G.GAME.ecto_minus = G.GAME.ecto_minus || 1;
          G.hand.change_size(-G.GAME.ecto_minus);
          G.GAME.ecto_minus = G.GAME.ecto_minus + 1;
        }
        used_tarot.juice_up(0.3, 0.5);
      });
    } else {
      G.E_MANAGER.add_event(() => {
        attention_text(localize('k_nope_ex'));
        emit('nope', { card: used_tarot.sort_id });
        play_sound('tarot2', 1, 0.4);
        used_tarot.juice_up(0.3, 0.5);
      });
    }
  }
};

// --------------------------------------------------- Card:can_use_consumeable
Card.prototype.can_use_consumeable = function (any_state, skip_check) {
  if (!skip_check && ((G.play && G.play.cards.length > 0) ||
      (G.GAME.STOP_USE && G.GAME.STOP_USE > 0))) return false;
  update_consumeable(this);
  if ((G.STATE !== G.STATES.HAND_PLAYED && G.STATE !== G.STATES.DRAW_TO_HAND && G.STATE !== G.STATES.PLAY_TAROT) || any_state) {
    if (this.ability.name === 'The Hermit' || this.ability.consumeable.hand_type || this.ability.name === 'Temperance' || this.ability.name === 'Black Hole') {
      return true;
    }
    if (this.ability.name === 'The Wheel of Fortune') {
      if (next(this.eligible_strength_jokers)) return true;
    }
    if (this.ability.name === 'Ankh') {
      // if there is at least one joker
      for (const v of G.jokers.cards) {
        if (v.ability.set === 'Joker' && G.jokers.config.card_limit > 1) {
          return true;
        }
      }
    }
    if (this.ability.name === 'Aura') {
      if (G.hand && G.hand.highlighted.length === 1 && G.hand.highlighted[0] && !G.hand.highlighted[0].edition) return true;
    }
    if (this.ability.name === 'Ectoplasm' || this.ability.name === 'Hex') {
      if (next(this.eligible_editionless_jokers)) return true;
    }
    if (this.ability.name === 'The Emperor' || this.ability.name === 'The High Priestess') {
      if (G.consumeables.cards.length < G.consumeables.config.card_limit || this.area === G.consumeables) return true;
    }
    if (this.ability.name === 'The Fool') {
      if ((G.consumeables.cards.length < G.consumeables.config.card_limit || this.area === G.consumeables) &&
          G.GAME.last_tarot_planet && G.GAME.last_tarot_planet !== 'c_fool') return true;
    }
    if (this.ability.name === 'Judgement' || this.ability.name === 'The Soul' || this.ability.name === 'Wraith') {
      if (G.jokers.cards.length < G.jokers.config.card_limit || this.area === G.jokers) {
        return true;
      } else {
        return false;
      }
    }
    if (G.STATE === G.STATES.SELECTING_HAND || G.STATE === G.STATES.TAROT_PACK || G.STATE === G.STATES.SPECTRAL_PACK || G.STATE === G.STATES.PLANET_PACK) {
      if (this.ability.consumeable.max_highlighted) {
        if (this.ability.consumeable.mod_num >= G.hand.highlighted.length && G.hand.highlighted.length >= (this.ability.consumeable.min_highlighted || 1)) {
          return true;
        }
      }
      if ((this.ability.name === 'Familiar' || this.ability.name === 'Grim' ||
          this.ability.name === 'Incantation' || this.ability.name === 'Immolate' ||
          this.ability.name === 'Sigil' || this.ability.name === 'Ouija') &&
          G.hand.cards.length > 1) {
        return true;
      }
    }
  }
  return false;
};

// ----------------------------------------------------------- Card:check_use
Card.prototype.check_use = function () {
  if (this.ability.name === 'Ankh') {
    if (G.jokers.cards.length >= G.jokers.config.card_limit) {
      alert_no_space(this, G.jokers);
      return true;
    }
  }
};

// -------------------------------------------------------------- Card:explode
/** Visual burst, then the card is gone (Lua removes it when the dissolve finishes). */
Card.prototype.explode = function () {
  emit('explode', { card: this.sort_id });
  this.remove();
};

// ----------------------------------------------------------------- Card:open
Card.prototype.open = function () {
  if (this.ability.set === 'Booster') {
    stop_use();
    G.STATE_COMPLETE = false;
    this.opening = true;

    if (this.ability.name.includes('Arcana')) {
      G.STATE = G.STATES.TAROT_PACK;
      G.GAME.pack_size = this.ability.extra;
    } else if (this.ability.name.includes('Celestial')) {
      G.STATE = G.STATES.PLANET_PACK;
      G.GAME.pack_size = this.ability.extra;
    } else if (this.ability.name.includes('Spectral')) {
      G.STATE = G.STATES.SPECTRAL_PACK;
      G.GAME.pack_size = this.ability.extra;
    } else if (this.ability.name.includes('Standard')) {
      G.STATE = G.STATES.STANDARD_PACK;
      G.GAME.pack_size = this.ability.extra;
    } else if (this.ability.name.includes('Buffoon')) {
      G.STATE = G.STATES.BUFFOON_PACK;
      G.GAME.pack_size = this.ability.extra;
    }

    G.GAME.pack_choices = this.config.center.config.choose || 1;

    if (this.cost > 0) {
      G.E_MANAGER.add_event(() => {
        inc_career_stat('c_shop_dollars_spent', this.cost);
        this.juice_up();
      });
      ease_dollars(-this.cost);
    }

    G.E_MANAGER.add_event(() => {
      this.explode();
      const pack_cards = [];

      G.E_MANAGER.add_event(() => {
        const _size = this.ability.extra;

        for (let i = 1; i <= _size; i++) {
          let card = null;
          if (this.ability.name.includes('Arcana')) {
            if (G.GAME.used_vouchers.v_omen_globe && pseudorandom('omen_globe') > 0.8) {
              card = create_card('Spectral', G.pack_cards, null, null, true, true, null, 'ar2');
            } else {
              card = create_card('Tarot', G.pack_cards, null, null, true, true, null, 'ar1');
            }
          } else if (this.ability.name.includes('Celestial')) {
            if (G.GAME.used_vouchers.v_telescope && i === 1) {
              let _planet = null, _hand = null, _tally = 0;
              for (const v of G.handlist) {
                if (G.GAME.hands[v].visible && G.GAME.hands[v].played > _tally) {
                  _hand = v;
                  _tally = G.GAME.hands[v].played;
                }
              }
              if (_hand) {
                for (const v of P_CENTER_POOLS.Planet) {
                  if (v.config.hand_type === _hand) {
                    _planet = v.key;
                  }
                }
              }
              card = create_card('Planet', G.pack_cards, null, null, true, true, _planet, 'pl1');
            } else {
              card = create_card('Planet', G.pack_cards, null, null, true, true, null, 'pl1');
            }
          } else if (this.ability.name.includes('Spectral')) {
            card = create_card('Spectral', G.pack_cards, null, null, true, true, null, 'spe');
          } else if (this.ability.name.includes('Standard')) {
            card = create_card(pseudorandom(pseudoseed('stdset' + G.GAME.round_resets.ante)) > 0.6 ? 'Enhanced' : 'Base', G.pack_cards, null, null, null, true, null, 'sta');
            const edition_rate = 2;
            const edition = poll_edition('standard_edition' + G.GAME.round_resets.ante, edition_rate, true);
            card.set_edition(edition);
            const seal_rate = 10;
            const seal_poll = pseudorandom(pseudoseed('stdseal' + G.GAME.round_resets.ante));
            if (seal_poll > 1 - 0.02 * seal_rate) {
              const seal_type = pseudorandom(pseudoseed('stdsealtype' + G.GAME.round_resets.ante));
              if (seal_type > 0.75) card.set_seal('Red');
              else if (seal_type > 0.5) card.set_seal('Blue');
              else if (seal_type > 0.25) card.set_seal('Gold');
              else card.set_seal('Purple');
            }
          } else if (this.ability.name.includes('Buffoon')) {
            card = create_card('Joker', G.pack_cards, null, null, true, true, null, 'buf');
          }
          emit('materialize', { card: card.sort_id });
          pack_cards[i - 1] = card;
        }
      });

      G.E_MANAGER.add_event(() => {
        if (G.pack_cards) {
          for (const v of pack_cards) {
            G.pack_cards.emplace(v);
          }
          emit('pack_opened', {
            center: this.config.center.key, state: G.STATE, pack_size: G.GAME.pack_size,
            choices: G.GAME.pack_choices, cards: pack_cards.map((c) => c.sort_id),
          });
        }
      });

      for (let i = 0; i < G.jokers.cards.length; i++) {
        G.jokers.cards[i].calculate_joker({ open_booster: true, card: this });
      }

      if (G.GAME.modifiers.inflation) {
        G.GAME.inflation = G.GAME.inflation + 1;
        G.E_MANAGER.add_event(() => {
          for (const v of all_cards()) {
            if (v.set_cost) v.set_cost();
          }
        });
      }
    });
  }
};

// --------------------------------------------------------------- Card:redeem
Card.prototype.redeem = function () {
  if (this.ability.set === 'Voucher') {
    stop_use();
    if (this.shop_voucher) G.GAME.current_round.voucher = null;

    G.GAME.used_vouchers[this.config.center_key] = true;

    G.E_MANAGER.add_event(() => {
      emit('redeemed', { card: this.sort_id, center: this.config.center.key, name: localize({ type: 'name_text', set: this.config.center.set, key: this.config.center.key }), text: localize('k_redeemed_ex') });
      this.juice_up(0.3, 0.5);
      play_sound('card1');
      play_sound('coin1');
    });
    ease_dollars(-this.cost);
    inc_career_stat('c_shop_dollars_spent', this.cost);
    inc_career_stat('c_vouchers_bought', 1);
    set_voucher_usage(this);
    check_for_unlock({ type: 'run_redeem' });
    G.GAME.current_round.voucher = null;

    this.apply_to_run();

    for (let i = 0; i < G.jokers.cards.length; i++) {
      G.jokers.cards[i].calculate_joker({ buying_card: true, card: this });
    }
    if (G.GAME.modifiers.inflation) {
      G.GAME.inflation = G.GAME.inflation + 1;
      G.E_MANAGER.add_event(() => {
        for (const v of all_cards()) {
          if (v.set_cost) v.set_cost();
        }
      });
    }
  }
};

// ---------------------------------------------------------- Card:apply_to_run
/** Card.apply_to_run(self, center) — `self` may be null (backs/tags call it as Card.apply_to_run(nil, center)). */
function apply_to_run(self, center) {
  const center_table = {
    name: center ? center.name : (self ? self.ability.name : undefined),
    extra: center ? center.config.extra : (self ? self.ability.extra : undefined),
  };
  if (center_table.name === 'Overstock' || center_table.name === 'Overstock Plus') {
    G.E_MANAGER.add_event(() => {
      change_shop_size(1);
    });
  }
  if (center_table.name === 'Tarot Merchant' || center_table.name === 'Tarot Tycoon') {
    G.E_MANAGER.add_event(() => {
      G.GAME.tarot_rate = 4 * center_table.extra;
    });
  }
  if (center_table.name === 'Planet Merchant' || center_table.name === 'Planet Tycoon') {
    G.E_MANAGER.add_event(() => {
      G.GAME.planet_rate = 4 * center_table.extra;
    });
  }
  if (center_table.name === 'Hone' || center_table.name === 'Glow Up') {
    G.E_MANAGER.add_event(() => {
      G.GAME.edition_rate = center_table.extra;
    });
  }
  if (center_table.name === 'Magic Trick' || center_table.name === 'Illusion') {
    G.E_MANAGER.add_event(() => {
      G.GAME.playing_card_rate = center_table.extra;
    });
  }
  if (center_table.name === 'Telescope' || center_table.name === 'Observatory') {
    // passive: read via G.GAME.used_vouchers (Card:open / Observatory joker calc)
  }
  if (center_table.name === 'Crystal Ball') {
    G.E_MANAGER.add_event(() => {
      G.consumeables.config.card_limit = G.consumeables.config.card_limit + 1;
    });
  }
  if (center_table.name === 'Clearance Sale' || center_table.name === 'Liquidation') {
    G.E_MANAGER.add_event(() => {
      G.GAME.discount_percent = center_table.extra;
      for (const v of all_cards()) {
        if (v.set_cost) v.set_cost();
      }
    });
  }
  if (center_table.name === 'Reroll Surplus' || center_table.name === 'Reroll Glut') {
    // Lua reads self.ability.extra here (nil self would crash); fall back to the center's value.
    const _extra = self && self.ability && self.ability.extra !== undefined ? self.ability.extra : center_table.extra;
    G.E_MANAGER.add_event(() => {
      G.GAME.round_resets.reroll_cost = G.GAME.round_resets.reroll_cost - _extra;
      G.GAME.current_round.reroll_cost = Math.max(0, G.GAME.current_round.reroll_cost - _extra);
    });
  }
  if (center_table.name === 'Seed Money' || center_table.name === 'Money Tree') {
    G.E_MANAGER.add_event(() => {
      G.GAME.interest_cap = center_table.extra;
    });
  }
  if (center_table.name === 'Grabber' || center_table.name === 'Nacho Tong') {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands + center_table.extra;
    ease_hands_played(center_table.extra);
  }
  if (center_table.name === 'Paint Brush' || center_table.name === 'Palette') {
    G.hand.change_size(1);
  }
  if (center_table.name === 'Wasteful' || center_table.name === 'Recyclomancy') {
    G.GAME.round_resets.discards = G.GAME.round_resets.discards + center_table.extra;
    ease_discard(center_table.extra);
  }
  if (center_table.name === 'Blank') {
    check_for_unlock({ type: 'blank_redeems' });
  }
  if (center_table.name === 'Antimatter') {
    G.E_MANAGER.add_event(() => {
      if (G.jokers) {
        G.jokers.config.card_limit = G.jokers.config.card_limit + 1;
      }
    });
  }
  if (center_table.name === 'Hieroglyph' || center_table.name === 'Petroglyph') {
    ease_ante(-center_table.extra);
    G.GAME.round_resets.blind_ante = G.GAME.round_resets.blind_ante ?? G.GAME.round_resets.ante;
    G.GAME.round_resets.blind_ante = G.GAME.round_resets.blind_ante - center_table.extra;

    if (center_table.name === 'Hieroglyph') {
      G.GAME.round_resets.hands = G.GAME.round_resets.hands - center_table.extra;
      ease_hands_played(-center_table.extra);
    }
    if (center_table.name === 'Petroglyph') {
      G.GAME.round_resets.discards = G.GAME.round_resets.discards - center_table.extra;
      ease_discard(-center_table.extra);
    }
  }
}
Card.prototype.apply_to_run = function (center) { return apply_to_run(this, center); };
/** Static form: Card.apply_to_run(null, P_CENTERS.v_xxx) like Lua's Card.apply_to_run(nil, center). */
// Also tolerates the one-argument form Card.apply_to_run(center) (back.js calls it that way).
Card.apply_to_run = function (self, center) {
  if (center === undefined && self && !self.ability && self.config) return apply_to_run(null, self);
  return apply_to_run(self || null, center);
};

