// Micatro — port of Balatro's back.lua (deck backs; logic only).

import {
  G, P_CENTERS, Card, emit, play_sound, attention_text, localize, pseudoseed, pseudorandom_element,
  copy_table, create_card, update_hand_text,
} from './core.js';
import { Tag, add_tag } from './tag.js';

/** Card.apply_to_run(nil, center) — the voucher effect lives in consumables.js. */
function card_apply_to_run(center) {
  if (typeof Card.apply_to_run !== 'function') throw new Error('micatro: Card.apply_to_run (consumables.js) is missing');
  return Card.apply_to_run(null, center);
}

export class Back {
  constructor(selected_back) {
    if (!selected_back) selected_back = P_CENTERS.b_red;
    this.name = selected_back.name || 'Red Deck';
    this.effect = {
      center: selected_back,
      text_UI: '',
      config: copy_table(selected_back.config || {}),
    };
    this.loc_name = localize({ type: 'name_text', set: 'Back', key: this.effect.center.key });
    const pos = this.effect.center.pos || { x: 4, y: 0 };
    this.pos = { x: pos.x, y: pos.y };
  }

  get key() { return this.effect.center.key; }

  get_name() { return this.loc_name; }

  change_to(new_back) {
    if (!new_back) new_back = P_CENTERS.b_red;
    this.name = new_back.name || 'Red Deck';
    this.effect = { center: new_back, text_UI: '', config: copy_table(new_back.config || {}) };
    this.loc_name = localize({ type: 'name_text', set: 'Back', key: this.effect.center.key });
    const pos = copy_table(new_back.pos) || { x: 4, y: 0 };
    this.pos.x = pos.x;
    this.pos.y = pos.y;
  }

  save() {
    return {
      name: this.name,
      pos: { ...this.pos },
      effect: { text_UI: this.effect.text_UI, config: copy_table(this.effect.config) },
      key: this.effect.center.key || 'b_red',
    };
  }

  static load(backTable) {
    const b = new Back(P_CENTERS[backTable.key] || P_CENTERS.b_red);
    b.load(backTable);
    return b;
  }

  load(backTable) {
    this.name = backTable.name;
    this.pos = { ...backTable.pos };
    this.effect = { text_UI: '', ...copy_table(backTable.effect) };
    this.effect.center = P_CENTERS[backTable.key] || P_CENTERS.b_red;
    this.loc_name = localize({ type: 'name_text', set: 'Back', key: this.effect.center.key });
    return this;
  }

  /** Returns [chips, mult] for Plasma's final_scoring_step (Lua's two return values), else undefined. */
  trigger_effect(args) {
    if (!args) return undefined;

    if (this.name === 'Anaglyph Deck' && args.context === 'eval' && G.GAME.last_blind && G.GAME.last_blind.boss) {
      G.E_MANAGER.add_event(() => {
        add_tag(new Tag('tag_double'));
        play_sound('generic1', 0.9, 0.8);
        play_sound('holo1', 1.2, 0.4);
      });
    }
    if (this.name === 'Plasma Deck' && args.context === 'blind_amount') {
      return undefined;
    }

    if (this.name === 'Plasma Deck' && args.context === 'final_scoring_step') {
      const tot = args.chips + args.mult;
      args.chips = Math.floor(tot / 2);
      args.mult = Math.floor(tot / 2);
      update_hand_text({ delay: 0 }, { mult: args.mult, chips: args.chips });

      G.E_MANAGER.add_event(() => {
        const text = localize('k_balanced');
        play_sound('gong', 0.94, 0.3);
        play_sound('gong', 0.94 * 1.5, 0.2);
        play_sound('tarot1', 1.5);
        emit('balanced', { chips: args.chips, mult: args.mult });
        attention_text(text);
      });
      return [args.chips, args.mult];
    }
    return undefined;
  }

  apply_to_run() {
    const cfg = this.effect.config;
    if (cfg.voucher) {
      G.GAME.used_vouchers[cfg.voucher] = true;
      G.GAME.starting_voucher_count = (G.GAME.starting_voucher_count || 0) + 1;
      card_apply_to_run(P_CENTERS[cfg.voucher]);
    }
    if (cfg.hands !== undefined) {
      G.GAME.starting_params.hands = G.GAME.starting_params.hands + cfg.hands;
    }
    if (cfg.consumables) {
      G.E_MANAGER.add_event(() => {
        for (const v of cfg.consumables) {
          const card = create_card('Tarot', G.consumeables, null, null, null, null, v, 'deck');
          card.add_to_deck();
          G.consumeables.emplace(card);
        }
      });
    }

    if (cfg.dollars !== undefined) {
      G.GAME.starting_params.dollars = G.GAME.starting_params.dollars + cfg.dollars;
    }
    if (cfg.remove_faces) {
      G.GAME.starting_params.no_faces = true;
    }

    if (cfg.spectral_rate !== undefined) {
      G.GAME.spectral_rate = cfg.spectral_rate;
    }
    if (cfg.discards !== undefined) {
      G.GAME.starting_params.discards = G.GAME.starting_params.discards + cfg.discards;
    }
    if (cfg.reroll_discount !== undefined) {
      G.GAME.starting_params.reroll_cost = G.GAME.starting_params.reroll_cost - cfg.reroll_discount;
    }

    if (cfg.edition) {
      G.E_MANAGER.add_event(() => {
        let i = 0;
        while (i < cfg.edition_count) {
          const [card] = pseudorandom_element(G.playing_cards, pseudoseed('edition_deck'));
          if (!card.edition) {
            i = i + 1;
            card.set_edition({ [cfg.edition]: true }, null, true);
          }
        }
      });
    }
    if (cfg.vouchers) {
      for (const v of cfg.vouchers) {
        G.GAME.used_vouchers[v] = true;
        G.GAME.starting_voucher_count = (G.GAME.starting_voucher_count || 0) + 1;
        card_apply_to_run(P_CENTERS[v]);
      }
    }
    if (this.name === 'Checkered Deck') {
      G.E_MANAGER.add_event(() => {
        for (const v of G.playing_cards) {
          if (v.base.suit === 'Clubs') v.change_suit('Spades');
          if (v.base.suit === 'Diamonds') v.change_suit('Hearts');
        }
      });
    }
    if (cfg.randomize_rank_suit) {
      G.GAME.starting_params.erratic_suits_and_ranks = true;
    }
    if (cfg.joker_slot !== undefined) {
      G.GAME.starting_params.joker_slots = G.GAME.starting_params.joker_slots + cfg.joker_slot;
    }
    if (cfg.hand_size !== undefined) {
      G.GAME.starting_params.hand_size = G.GAME.starting_params.hand_size + cfg.hand_size;
    }
    if (cfg.ante_scaling !== undefined) {
      G.GAME.starting_params.ante_scaling = cfg.ante_scaling;
    }
    if (cfg.consumable_slot !== undefined) {
      G.GAME.starting_params.consumable_slots = G.GAME.starting_params.consumable_slots + cfg.consumable_slot;
    }
    if (cfg.no_interest) {
      G.GAME.modifiers.no_interest = true;
    }
    if (cfg.extra_hand_bonus !== undefined) {
      G.GAME.modifiers.money_per_hand = cfg.extra_hand_bonus;
    }
    if (cfg.extra_discard_bonus !== undefined) {
      G.GAME.modifiers.money_per_discard = cfg.extra_discard_bonus;
    }
  }
}
