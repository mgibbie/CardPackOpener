// Micatro — port of Balatro's tag.lua (logic only) + add_tag from UI_definitions.lua.
//
// Tag:yep / Tag:nope keep their event ordering (show -> effect -> remove) but the
// HUD sprite work becomes `emit('tag_yep'|'tag_nope')`. G.CONTROLLER.locks are
// UI input locks and are dropped.

import {
  G, P_TAGS, P_CENTERS, P_CARDS, P_JOKER_RARITY_POOLS, Card, emit, play_sound, attention_text, localize,
  pseudoseed, pseudorandom_element, math_random, copy_table, create_card, ease_dollars,
  level_up_hand, update_hand_text, calculate_reroll_cost, get_next_voucher_key,
} from './core.js';
import { use_card, reroll_boss, HANDLIST } from './run.js';

/**
 * create_UIBox_blind_choice (UI_definitions.lua) rolls the Orbital Tag hand for
 * each blind the first time the blind-select screen is built for an ante. The
 * headless port has no screen, so the roll happens the first time a tag needs
 * it — for all three blinds at once, in the Small/Big/Boss order Lua builds them.
 */
export function prep_orbital_choices() {
  const ante = G.GAME.round_resets.ante;
  G.GAME.orbital_choices = G.GAME.orbital_choices || {};
  G.GAME.orbital_choices[ante] = G.GAME.orbital_choices[ante] || {};
  for (const type of ['Small', 'Big', 'Boss']) {
    if (!G.GAME.orbital_choices[ante][type]) {
      const _poker_hands = [];
      // Lua iterates pairs(G.GAME.hands) (unordered) — use the fixed hand order.
      for (const k of HANDLIST) if (G.GAME.hands[k].visible) _poker_hands.push(k);
      G.GAME.orbital_choices[ante][type] = pseudorandom_element(_poker_hands, pseudoseed('orbital'))[0];
    }
  }
}

export class Tag {
  constructor(_tag, for_collection, _blind_type) {
    this.key = _tag;
    const proto = P_TAGS[_tag] || { config: {}, name: 'Undiscovered Tag' };
    this.config = copy_table(proto.config);
    this.pos = proto.pos;
    this.name = proto.name;
    this.tally = G.GAME.tag_tally || 0;
    this.triggered = false;
    G.tagid = G.tagid || 0;
    this.ID = G.tagid;
    G.tagid = G.tagid + 1;
    this.ability = {
      orbital_hand: '[' + localize('k_poker_hand') + ']',
      blind_type: _blind_type,
    };
    G.GAME.tag_tally = G.GAME.tag_tally ? G.GAME.tag_tally + 1 : 1;
    if (!for_collection) this.set_ability();
  }

  nope() {
    G.E_MANAGER.add_event(() => {
      emit('tag_nope', { tag: this.key, id: this.ID });
      attention_text('NOPE');
      play_sound('cancel', 1.4, 0.5);
    });
    G.E_MANAGER.add_event(() => {
      this.HUD_hidden = true;
      play_sound('cancel', 1.26, 0.5);
    });
    G.E_MANAGER.add_event(() => { this.remove(); });
  }

  yep(message, _colour, func) {
    G.E_MANAGER.add_event(() => {
      emit('tag_yep', { tag: this.key, id: this.ID, message, colour: _colour });
      attention_text(message);
      play_sound('generic1', 0.9, 0.8);
      play_sound('holo1', 1.2, 0.4);
    });
    G.E_MANAGER.add_event(() => { this.HUD_hidden = true; });
    if (func) G.E_MANAGER.add_event(() => { func(); });
    G.E_MANAGER.add_event(() => { this.remove(); });
  }

  set_ability() {
    if (this.name === 'Orbital Tag') {
      if (G.orbital_hand) {
        this.ability.orbital_hand = G.orbital_hand;
      } else if (this.ability.blind_type) {
        prep_orbital_choices();
        if (G.GAME.orbital_choices && G.GAME.orbital_choices[G.GAME.round_resets.ante][this.ability.blind_type]) {
          this.ability.orbital_hand = G.GAME.orbital_choices[G.GAME.round_resets.ante][this.ability.blind_type];
        }
      }
    }
  }

  apply_to_run(_context) {
    // Steamodded: a mod tag's apply(self, tag, context) sees every context while untriggered.
    const mt = P_TAGS[this.key];
    if (!this.triggered && mt && mt.mod && mt.apply) {
      const res = mt.apply(mt, this, _context);
      if (res) return res;
    }
    if (!this.triggered && this.config.type === _context.type) {
      if (_context.type === 'eval') {
        if (this.name === 'Investment Tag' && G.GAME.last_blind && G.GAME.last_blind.boss) {
          this.yep('+', 'GOLD', () => true);
          this.triggered = true;
          return {
            dollars: this.config.dollars,
            condition: localize('ph_defeat_the_boss'),
            pos: this.pos,
            tag: this,
          };
        }
      } else if (_context.type === 'immediate') {
        if (this.name === 'Top-up Tag') {
          this.yep('+', 'PURPLE', () => {
            for (let i = 1; i <= this.config.spawn_jokers; i++) {
              if (G.jokers && G.jokers.cards.length < G.jokers.config.card_limit) {
                const card = create_card('Joker', G.jokers, null, 0, null, null, null, 'top');
                card.add_to_deck();
                G.jokers.emplace(card);
              }
            }
            return true;
          });
          this.triggered = true;
          return true;
        }
        if (this.name === 'Skip Tag') {
          this.yep('+', 'MONEY', () => true);
          ease_dollars((G.GAME.skips || 0) * this.config.skip_bonus);
          this.triggered = true;
          return true;
        }
        if (this.name === 'Garbage Tag') {
          this.yep('+', 'MONEY', () => true);
          ease_dollars((G.GAME.unused_discards || 0) * this.config.dollars_per_discard);
          this.triggered = true;
          return true;
        }
        if (this.name === 'Handy Tag') {
          this.yep('+', 'MONEY', () => true);
          ease_dollars((G.GAME.hands_played || 0) * this.config.dollars_per_hand);
          this.triggered = true;
          return true;
        }
        if (this.name === 'Economy Tag') {
          this.yep('+', 'MONEY', () => true);
          G.E_MANAGER.add_event(() => {
            ease_dollars(Math.min(this.config.max, Math.max(0, G.GAME.dollars)), true);
          });
          this.triggered = true;
          return true;
        }
        if (this.name === 'Orbital Tag') {
          const hand = G.GAME.hands[this.ability.orbital_hand];
          if (!hand) {
            // No hand was ever rolled for this tag (Lua would crash here) — fizzle.
            this.nope();
            this.triggered = true;
            return true;
          }
          update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, {
            handname: localize(this.ability.orbital_hand, 'poker_hands'),
            chips: hand.chips, mult: hand.mult, level: hand.level,
          });
          level_up_hand(this, this.ability.orbital_hand, null, this.config.levels);
          update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
          this.yep('+', 'MONEY', () => true);
          this.triggered = true;
          return true;
        }
      } else if (_context.type === 'new_blind_choice') {
        const open_free_pack = (key) => {
          const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
          card.cost = 0;
          card.from_tag = true;
          use_card(card);
          emit('materialize', { card: card.sort_id });
        };
        if (this.name === 'Charm Tag') {
          this.yep('+', 'PURPLE', () => { open_free_pack('p_arcana_mega_' + math_random(1, 2)); return true; });
          this.triggered = true;
          return true;
        }
        if (this.name === 'Meteor Tag') {
          this.yep('+', 'Planet', () => { open_free_pack('p_celestial_mega_' + math_random(1, 2)); return true; });
          this.triggered = true;
          return true;
        }
        if (this.name === 'Ethereal Tag') {
          this.yep('+', 'Spectral', () => { open_free_pack('p_spectral_normal_1'); return true; });
          this.triggered = true;
          return true;
        }
        if (this.name === 'Standard Tag') {
          this.yep('+', 'Spectral', () => { open_free_pack('p_standard_mega_1'); return true; });
          this.triggered = true;
          return true;
        }
        if (this.name === 'Buffoon Tag') {
          this.yep('+', 'Spectral', () => { open_free_pack('p_buffoon_mega_1'); return true; });
          this.triggered = true;
          return true;
        }
        if (this.name === 'Boss Tag') {
          this.yep('+', 'GREEN', () => {
            G.from_boss_tag = true;
            reroll_boss(true);
            G.from_boss_tag = undefined;
            return true;
          });
          this.triggered = true;
          return true;
        }
      } else if (_context.type === 'voucher_add') {
        if (this.name === 'Voucher Tag') {
          this.yep('+', 'Voucher', () => {
            G.ARGS = G.ARGS || {};
            G.ARGS.voucher_tag = G.ARGS.voucher_tag || {};
            const voucher_key = get_next_voucher_key(true);
            G.ARGS.voucher_tag[voucher_key] = true;
            G.shop_vouchers.config.card_limit = G.shop_vouchers.config.card_limit + 1;
            const card = new Card(P_CARDS.empty, P_CENTERS[voucher_key], { bypass_discovery_center: true, bypass_discovery_ui: true });
            card.shop_voucher = true;
            card.from_tag = true;
            G.shop_vouchers.emplace(card);
            G.ARGS.voucher_tag = undefined;
            return true;
          });
          this.triggered = true;
        }
      } else if (_context.type === 'tag_add') {
        if (this.name === 'Double Tag' && _context.tag.key !== 'tag_double') {
          this.yep('+', 'BLUE', () => {
            if (_context.tag.ability && _context.tag.ability.orbital_hand) G.orbital_hand = _context.tag.ability.orbital_hand;
            add_tag(new Tag(_context.tag.key));
            G.orbital_hand = undefined;
            return true;
          });
          this.triggered = true;
        }
      } else if (_context.type === 'round_start_bonus') {
        if (this.name === 'Juggle Tag') {
          this.yep('+', 'BLUE', () => true);
          G.hand.change_size(this.config.h_size);
          G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + this.config.h_size;
          this.triggered = true;
          return true;
        }
      } else if (_context.type === 'store_joker_create') {
        let card;
        if (this.name === 'Rare Tag') {
          const rares_in_posession = { count: 0 };
          for (const v of G.jokers.cards) {
            if (v.config.center.rarity === 3 && !rares_in_posession[v.config.center.key]) {
              rares_in_posession.count += 1;
              rares_in_posession[v.config.center.key] = true;
            }
          }
          if (P_JOKER_RARITY_POOLS[3].length > rares_in_posession.count) {
            card = create_card('Joker', _context.area, null, 1, null, null, null, 'rta');
            card.states_visible = false;
            this.yep('+', 'RED', () => {
              card.states_visible = undefined;
              emit('materialize', { card: card.sort_id });
              card.ability.couponed = true;
              card.set_cost();
              return true;
            });
          } else {
            this.nope();
          }
          this.triggered = true;
        } else if (this.name === 'Uncommon Tag') {
          card = create_card('Joker', _context.area, null, 0.9, null, null, null, 'uta');
          card.states_visible = false;
          this.yep('+', 'GREEN', () => {
            card.states_visible = undefined;
            emit('materialize', { card: card.sort_id });
            card.ability.couponed = true;
            card.set_cost();
            return true;
          });
        }
        this.triggered = true;
        return card;
      } else if (_context.type === 'shop_start') {
        if (this.name === 'D6 Tag' && !G.GAME.shop_d6ed) {
          G.GAME.shop_d6ed = true;
          this.yep('+', 'GREEN', () => {
            G.GAME.round_resets.temp_reroll_cost = 0;
            calculate_reroll_cost(true);
            return true;
          });
          this.triggered = true;
          return true;
        }
      } else if (_context.type === 'store_joker_modify') {
        let _applied;
        const c = _context.card;
        if (!c.edition && !c.temp_edition && c.ability.set === 'Joker') {
          const ed = { 'Foil Tag': 'foil', 'Holographic Tag': 'holo', 'Polychrome Tag': 'polychrome', 'Negative Tag': 'negative' }[this.name];
          if (ed) {
            c.temp_edition = true;
            this.yep('+', 'DARK_EDITION', () => {
              c.temp_edition = undefined;
              c.set_edition({ [ed]: true }, true);
              c.ability.couponed = true;
              c.set_cost();
              return true;
            });
            _applied = true;
          }
          this.triggered = true;
        }
        return _applied;
      } else if (_context.type === 'shop_final_pass') {
        if (this.name === 'Coupon Tag' && (G.shop_open && !G.GAME.shop_free)) {
          G.GAME.shop_free = true;
          this.yep('+', 'GREEN', () => {
            if (G.shop_jokers && G.shop_booster) {
              for (const v of G.shop_jokers.cards) { v.ability.couponed = true; v.set_cost(); }
              for (const v of G.shop_booster.cards) { v.ability.couponed = true; v.set_cost(); }
            }
            return true;
          });
          this.triggered = true;
          return true;
        }
      }
    }
    return undefined;
  }

  save() {
    return JSON.parse(JSON.stringify({
      key: this.key,
      tally: this.tally,
      ability: this.ability,
      // Not in Lua's save: a tag saved mid-trigger would otherwise fire twice.
      triggered: this.triggered || undefined,
    }));
  }

  static load(tag_savetable) {
    const t = new Tag(tag_savetable.key, true);
    t.load(tag_savetable);
    return t;
  }

  load(tag_savetable) {
    this.key = tag_savetable.key;
    const proto = P_TAGS[this.key] || { config: {}, name: 'Undiscovered Tag' };
    this.config = copy_table(proto.config);
    this.pos = proto.pos;
    this.name = proto.name;
    this.tally = tag_savetable.tally;
    this.ability = copy_table(tag_savetable.ability);
    this.triggered = !!tag_savetable.triggered;
    G.GAME.tag_tally = Math.max(this.tally, G.GAME.tag_tally || 0) + 1;
    return this;
  }

  juice_up() { emit('tag_juice', { tag: this.key, id: this.ID }); }

  remove_from_game() {
    const i = G.GAME.tags.indexOf(this);
    if (i >= 0) G.GAME.tags.splice(i, 1);
  }

  remove() {
    const was_in = G.GAME.tags.includes(this);
    this.remove_from_game();
    if (was_in) emit('tag_removed', { tag: this.key, id: this.ID });
  }
}

/** UI_definitions.lua add_tag — existing tags see it (Double Tag) before it joins the list. */
export function add_tag(_tag) {
  for (let i = 0; i < G.GAME.tags.length; i++) {
    G.GAME.tags[i].apply_to_run({ type: 'tag_add', tag: _tag });
  }
  G.GAME.tags.push(_tag);
  emit('tag_added', { tag: _tag.key, id: _tag.ID, orbital_hand: _tag.name === 'Orbital Tag' ? _tag.ability.orbital_hand : undefined });
}
