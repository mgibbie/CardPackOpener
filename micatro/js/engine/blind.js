// Micatro — port of Balatro's blind.lua (logic only).
//
// Everything visual (sprites, colour easing, HUD alignment, particles, sounds)
// becomes `emit` / `play_sound` / `attention_text` calls. The Lua `alert_debuff`
// play-lock (`block_play`) only exists to hold the Play button while the
// attention text animates, so it is cleared immediately here (see alert_debuff).

import {
  G, P_BLINDS, LOC, emit, card_eval_status_text, play_sound, attention_text, localize,
  pseudoseed, pseudorandom, pseudorandom_element, ease_discard, ease_hands_played, ease_dollars,
  level_up_hand, get_blind_amount, number_format, copy_table,
} from './core.js';
import { draw_from_deck_to_hand, discard_cards_from_highlighted } from './run.js';

/** Lua's `vars = {}` survives the data export as `{}` — normalise to an array. */
const as_list = (v) => (Array.isArray(v) ? v : []);

export class Blind {
  constructor() {
    this.children = {};
    this.config = {};
    this.chips = 0;
    this.loc_debuff_lines = ['', ''];
    // Lua leaves name/debuff nil until set_blind runs.
  }

  get key() { return this.config.blind && this.config.blind.key; }

  // ---------------------------------------------------------------- text
  set_text() {
    if (this.config.blind) {
      if (this.disabled) {
        this.loc_name = this.name === '' ? this.name : localize({ type: 'name_text', key: this.config.blind.key, set: 'Blind' });
        this.loc_debuff_text = '';
        this.loc_debuff_lines[0] = '';
        this.loc_debuff_lines[1] = '';
      } else {
        let loc_vars;
        if (this.name === 'The Ox') loc_vars = [localize(G.GAME.current_round.most_played_poker_hand, 'poker_hands')];
        const loc_target = raw_blind_description(this.config.blind.key, loc_vars || as_list(this.config.blind.vars).map((v) => localize(v)));
        if (loc_target) {
          this.loc_name = this.name === '' ? this.name : localize({ type: 'name_text', key: this.config.blind.key, set: 'Blind' });
          this.loc_debuff_text = '';
          loc_target.forEach((v, k) => { this.loc_debuff_text = this.loc_debuff_text + v + (k + 1 <= loc_target.length ? ' ' : ''); });
          this.loc_debuff_lines[0] = loc_target[0] || '';
          this.loc_debuff_lines[1] = loc_target[1] || '';
        } else {
          this.loc_name = ''; this.loc_debuff_text = '';
          this.loc_debuff_lines[0] = '';
          this.loc_debuff_lines[1] = '';
        }
      }
    }
  }

  // ----------------------------------------------------------- set_blind
  set_blind(blind, reset, silent) {
    if (!reset) {
      this.config.blind = blind || {};
      this.name = (blind && blind.name) || '';
      this.dollars = (blind && blind.dollars) || 0;
      this.sound_pings = this.dollars + 2;
      if (G.GAME.modifiers.no_blind_reward && G.GAME.modifiers.no_blind_reward[this.get_type()]) this.dollars = 0;
      this.debuff = (blind && blind.debuff) ? copy_table(blind.debuff) : {};
      this.pos = blind && blind.pos;
      this.mult = (blind && blind.mult) || 0;
      this.disabled = false;
      this.discards_sub = undefined;
      this.hands_sub = undefined;
      this.boss = !!(blind && blind.boss);
      this.blind_set = false;
      this.triggered = undefined;
      this.prepped = true;
      this.hands = undefined;
      this.only_hand = undefined;
      this.set_text();

      G.GAME.last_blind = G.GAME.last_blind || {};
      G.GAME.last_blind.boss = this.boss;
      G.GAME.last_blind.name = this.name;

      this.chips = get_blind_amount(G.GAME.round_resets.ante) * this.mult * G.GAME.starting_params.ante_scaling;
      this.chip_text = number_format(this.chips);

      if (!blind) this.chips = 0;

      G.GAME.current_round.dollars_to_be_earned = this.dollars > 0 ? '$'.repeat(this.dollars) : '';

      emit('blind', {
        action: blind ? 'set' : 'clear', key: blind ? blind.key : null, name: this.name,
        chips: this.chips, chip_text: this.chip_text, dollars: this.dollars, boss: this.boss,
        showdown: !!(blind && blind.boss && blind.boss.showdown), silent: !!silent,
      });
      if (blind && blind.name && blind.name !== '') {
        this.alert_debuff(true);
        this.blind_set = true;
        if (!reset && !silent) { play_sound('chips1'); play_sound('gold_seal'); }
      }
    }

    if (this.name === 'The Eye' && !reset) {
      this.hands = {
        'Flush Five': false, 'Flush House': false, 'Five of a Kind': false, 'Straight Flush': false,
        'Four of a Kind': false, 'Full House': false, Flush: false, Straight: false,
        'Three of a Kind': false, 'Two Pair': false, Pair: false, 'High Card': false,
      };
    }
    if (this.name === 'The Mouth' && !reset) {
      this.only_hand = false;
    }
    if (this.name === 'The Fish' && !reset) {
      this.prepped = undefined;
    }
    if (this.name === 'The Water' && !reset) {
      this.discards_sub = G.GAME.current_round.discards_left;
      ease_discard(-this.discards_sub);
    }
    if (this.name === 'The Needle' && !reset) {
      this.hands_sub = G.GAME.round_resets.hands - 1;
      ease_hands_played(-this.hands_sub);
    }
    if (this.name === 'The Manacle' && !reset) {
      G.hand.change_size(-1);
    }
    if (this.name === 'Amber Acorn' && !reset && G.jokers.cards.length > 0) {
      G.jokers.unhighlight_all();
      for (const v of G.jokers.cards) v.flip();
      if (G.jokers.cards.length > 1) {
        G.E_MANAGER.add_event(() => {
          G.E_MANAGER.add_event(() => { G.jokers.shuffle('aajk'); play_sound('cardSlide1', 0.85); });
          G.E_MANAGER.add_event(() => { G.jokers.shuffle('aajk'); play_sound('cardSlide1', 1.15); });
          G.E_MANAGER.add_event(() => { G.jokers.shuffle('aajk'); play_sound('cardSlide1', 1); });
        });
      }
    }

    // add new debuffs
    for (const v of G.playing_cards || []) this.debuff_card(v);
    for (const v of (G.jokers && G.jokers.cards) || []) {
      if (!reset) this.debuff_card(v, true);
    }
  }

  /**
   * Lua sets block_play and clears it ~1s later once the attention text has
   * shown (only while SELECTING_HAND). The lock is a pure animation hold, so
   * the port shows the text and never leaves the Play button locked.
   */
  alert_debuff(first) {
    if (this.loc_debuff_text && this.loc_debuff_text !== '') {
      this.block_play = undefined;
      const disp_text = this.get_loc_debuff_text();
      emit('blind_alert', { key: this.config.blind && this.config.blind.key, text: disp_text, first: !!first });
      attention_text(disp_text);
    }
  }

  get_loc_debuff_text() {
    let disp_text = (this.config.blind.name === 'The Wheel' ? G.GAME.probabilities.normal : '') + this.loc_debuff_text;
    if (this.config.blind.name === 'The Mouth' && this.only_hand) disp_text = disp_text + ' [' + localize(this.only_hand, 'poker_hands') + ']';
    return disp_text;
  }

  // -------------------------------------------------------------- defeat
  defeat(silent) {
    emit('blind', { action: 'defeat', key: this.config.blind && this.config.blind.key, name: this.name, silent: !!silent });
    if (!silent) play_sound('whoosh2', 0.7, 0.42);
    G.E_MANAGER.add_event(() => {
      this.dissolve = undefined;
      this.set_blind(null, null, true);
    });
    for (const v of G.jokers.cards) {
      if (v.facing === 'back') v.flip();
    }
    if (this.name === 'The Manacle' && !this.disabled) {
      G.hand.change_size(1);
    }
  }

  get_type() {
    if (this.name === 'Small Blind') return 'Small';
    if (this.name === 'Big Blind') return 'Big';
    if (this.name && this.name !== '') return 'Boss';
    return undefined;
  }

  // ------------------------------------------------------------- disable
  disable() {
    this.disabled = true;
    for (const v of G.jokers.cards) {
      if (v.facing === 'back') v.flip();
    }
    if (this.name === 'The Water') {
      ease_discard(this.discards_sub);
    }
    if (this.name === 'The Wheel' || this.name === 'The House' || this.name === 'The Mark' || this.name === 'The Fish') {
      for (let i = 0; i < G.hand.cards.length; i++) {
        if (G.hand.cards[i].facing === 'back') G.hand.cards[i].flip();
      }
      for (const v of G.playing_cards) v.ability.wheel_flipped = undefined;
    }
    if (this.name === 'The Needle') {
      ease_hands_played(this.hands_sub);
    }
    if (this.name === 'The Wall') {
      this.chips = this.chips / 2;
      this.chip_text = number_format(this.chips);
    }
    if (this.name === 'Cerulean Bell') {
      for (const v of G.playing_cards) v.ability.forced_selection = undefined;
    }
    if (this.name === 'The Manacle') {
      G.hand.change_size(1);
      draw_from_deck_to_hand(1);
    }
    if (this.name === 'The Serpent') {
      // nothing (Lua has an empty branch)
    }
    if (this.name === 'Violet Vessel') {
      this.chips = this.chips / 3;
      this.chip_text = number_format(this.chips);
    }
    G.E_MANAGER.add_event(() => {
      if (this.boss && G.GAME.chips - G.GAME.blind.chips >= 0) {
        G.STATE = G.STATES.NEW_ROUND;
        G.STATE_COMPLETE = false;
      }
    });
    for (const v of G.playing_cards) this.debuff_card(v);
    for (const v of G.jokers.cards) this.debuff_card(v);
    this.set_text();
    emit('blind', { action: 'disable', key: this.config.blind && this.config.blind.key, name: this.name, chips: this.chips, chip_text: this.chip_text });
    this.wiggle();
  }

  wiggle() {
    emit('blind_juice', { key: this.config.blind && this.config.blind.key });
    play_sound('tarot2', 1, 0.4);
  }

  juice_up() { emit('blind_juice', { key: this.config.blind && this.config.blind.key }); }

  // ---------------------------------------------------------- press_play
  press_play() {
    if (this.disabled) return undefined;
    if (this.name === 'The Hook') {
      G.E_MANAGER.add_event(() => {
        let any_selected;
        const _cards = [];
        for (const v of G.hand.cards) _cards.push(v);
        for (let i = 0; i < 2; i++) {
          if (G.hand.cards[i]) {
            const [selected_card, card_key] = pseudorandom_element(_cards, pseudoseed('hook'));
            G.hand.add_to_highlighted(selected_card, true);
            _cards.splice(card_key - 1, 1);
            any_selected = true;
            play_sound('card1', 1);
          }
        }
        if (any_selected) {
          emit('blind_hook', { cards: G.hand.highlighted.map((c) => c.sort_id) });
          discard_cards_from_highlighted(true);
        }
      });
      this.triggered = true;
      this.juice_up();
      return true;
    }
    if (this.name === 'Crimson Heart') {
      if (G.jokers.cards[0]) {
        this.triggered = true;
        this.prepped = true;
      }
    }
    if (this.name === 'The Fish') {
      this.prepped = true;
    }
    if (this.name === 'The Tooth') {
      G.E_MANAGER.add_event(() => {
        for (let i = 0; i < G.play.cards.length; i++) {
          const c = G.play.cards[i];
          G.E_MANAGER.add_event(() => { if (c) c.juice_up(); });
          ease_dollars(-1);
          card_eval_status_text(c, 'dollars', -1);
        }
      });
      this.triggered = true;
      this.juice_up();
      return true;
    }
    return undefined;
  }

  /** -> [mult, hand_chips, modded] (Lua returns three values). */
  modify_hand(cards, poker_hands, text, mult, hand_chips) {
    if (this.disabled) return [mult, hand_chips, false];
    if (this.name === 'The Flint') {
      this.triggered = true;
      this.juice_up();
      return [Math.max(Math.floor(mult * 0.5 + 0.5), 1), Math.max(Math.floor(hand_chips * 0.5 + 0.5), 0), true];
    }
    return [mult, hand_chips, false];
  }

  debuff_hand(cards, hand, handname, check) {
    if (this.disabled) return undefined;
    if (this.debuff) {
      this.triggered = false;
      if (this.debuff.hand && hand[this.debuff.hand] && hand[this.debuff.hand].length > 0) {
        this.triggered = true;
        return true;
      }
      if (this.debuff.h_size_ge !== undefined && cards.length < this.debuff.h_size_ge) {
        this.triggered = true;
        return true;
      }
      if (this.debuff.h_size_le !== undefined && cards.length > this.debuff.h_size_le) {
        this.triggered = true;
        return true;
      }
      if (this.name === 'The Eye') {
        if (this.hands[handname]) {
          this.triggered = true;
          return true;
        }
        if (!check) this.hands[handname] = true;
      }
      if (this.name === 'The Mouth') {
        if (this.only_hand && this.only_hand !== handname) {
          this.triggered = true;
          return true;
        }
        if (!check) this.only_hand = handname;
      }
    }
    if (this.name === 'The Arm') {
      this.triggered = false;
      if (G.GAME.hands[handname].level > 1) {
        this.triggered = true;
        if (!check) {
          level_up_hand(null, handname, null, -1);
          this.wiggle();
        }
      }
    }
    if (this.name === 'The Ox') {
      this.triggered = false;
      if (handname === G.GAME.current_round.most_played_poker_hand) {
        this.triggered = true;
        if (!check) {
          ease_dollars(-G.GAME.dollars, true);
          this.wiggle();
        }
      }
    }
    return undefined;
  }

  drawn_to_hand() {
    if (!this.disabled) {
      if (this.name === 'Cerulean Bell') {
        let any_forced;
        for (const v of G.hand.cards) if (v.ability.forced_selection) any_forced = true;
        if (!any_forced && G.hand.cards.length) {
          G.hand.unhighlight_all();
          const [forced_card] = pseudorandom_element(G.hand.cards, pseudoseed('cerulean_bell'));
          forced_card.ability.forced_selection = true;
          G.hand.add_to_highlighted(forced_card);
          emit('highlight', { ids: G.hand.highlighted.map((c) => c.sort_id), forced: forced_card.sort_id });
        }
      }
      if (this.name === 'Crimson Heart' && this.prepped && G.jokers.cards[0]) {
        const jokers = [];
        for (let i = 0; i < G.jokers.cards.length; i++) {
          if (!G.jokers.cards[i].debuff || G.jokers.cards.length < 2) jokers.push(G.jokers.cards[i]);
          G.jokers.cards[i].set_debuff(false);
        }
        const [_card] = pseudorandom_element(jokers, pseudoseed('crimson_heart'));
        if (_card) {
          _card.set_debuff(true);
          _card.juice_up();
          this.wiggle();
        }
      }
    }
    this.prepped = undefined;
  }

  stay_flipped(area, card) {
    if (!this.disabled) {
      if (area === G.hand) {
        if (this.name === 'The Wheel' && pseudorandom(pseudoseed('wheel')) < G.GAME.probabilities.normal / 7) return true;
        if (this.name === 'The House' && G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0) return true;
        if (this.name === 'The Mark' && card.is_face(true)) return true;
        if (this.name === 'The Fish' && this.prepped) return true;
      }
    }
    return undefined;
  }

  debuff_card(card, from_blind) {
    if (this.debuff && !this.disabled && card.area !== G.jokers) {
      if (this.debuff.suit && card.is_suit(this.debuff.suit, true)) {
        card.set_debuff(true);
        return;
      }
      if (this.debuff.is_face === 'face' && card.is_face(true)) {
        card.set_debuff(true);
        return;
      }
      if (this.name === 'The Pillar' && card.ability.played_this_ante) {
        card.set_debuff(true);
        return;
      }
      if (this.debuff.value && this.debuff.value === card.base.value) {
        card.set_debuff(true);
        return;
      }
      if (this.debuff.nominal && this.debuff.nominal === card.base.nominal) {
        card.set_debuff(true);
        return;
      }
    }
    if (this.name === 'Crimson Heart' && !this.disabled && card.area === G.jokers) return;
    if (this.name === 'Verdant Leaf' && !this.disabled && card.area !== G.jokers) { card.set_debuff(true); return; }
    card.set_debuff(false);
  }

  // ------------------------------------------------------------ save/load
  save() {
    const blindTable = {
      name: this.name,
      dollars: this.dollars,
      debuff: copy_table(this.debuff),
      pos: this.pos,
      mult: this.mult,
      disabled: this.disabled,
      discards_sub: this.discards_sub,
      hands_sub: this.hands_sub,
      boss: this.boss,
      config_blind: '',
      chips: this.chips,
      chip_text: this.chip_text,
      hands: copy_table(this.hands),
      only_hand: this.only_hand,
      triggered: this.triggered,
      // Not in Lua's save, but needed for a frame-exact resume (Fish/Crimson Heart).
      prepped: this.prepped,
    };
    for (const [k, v] of Object.entries(P_BLINDS)) {
      if (v && v.name && v.name === blindTable.name) blindTable.config_blind = k;
    }
    return JSON.parse(JSON.stringify(blindTable));
  }

  static load(blindTable) {
    const b = new Blind();
    b.load(blindTable);
    return b;
  }

  load(blindTable) {
    this.config.blind = P_BLINDS[blindTable.config_blind] || {};
    this.name = blindTable.name;
    this.dollars = blindTable.dollars;
    this.debuff = blindTable.debuff;
    this.pos = blindTable.pos;
    this.mult = blindTable.mult;
    this.disabled = blindTable.disabled;
    this.discards_sub = blindTable.discards_sub;
    this.hands_sub = blindTable.hands_sub;
    this.boss = blindTable.boss;
    this.chips = blindTable.chips;
    this.chip_text = blindTable.chip_text;
    this.hands = blindTable.hands;
    this.only_hand = blindTable.only_hand;
    this.triggered = blindTable.triggered;
    this.prepped = blindTable.prepped;
    this.blind_set = !!P_BLINDS[blindTable.config_blind];
    if (this.dollars > 0) G.GAME.current_round.dollars_to_be_earned = '$'.repeat(this.dollars);
    this.set_text();
    return this;
  }
}

/** localize{type='raw_descriptions', set='Blind', key, vars} -> array of filled lines (or undefined). */
function raw_blind_description(key, vars) {
  const d = LOC.descriptions.Blind && LOC.descriptions.Blind[key];
  if (!d || !d.text) return undefined;
  return as_list(d.text).map((line) => line.replace(/#(\d+)#/g, (m, n) => (vars && vars[n - 1] !== undefined ? String(vars[n - 1]) : m)));
}
