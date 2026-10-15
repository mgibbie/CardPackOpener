// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0280_ralts.lua: Ralts, Kirlia, Gardevoir, Mega Gardevoir,
// Gallade, Mega Gallade. Line-for-line port; static data comes from data.js.
// Gallade's "Planet cards only level your most played hand" and Mega Gallade's "hands can't be
// debuffed" / "most played hand's cards can't be debuffed" are lovely patches: see ../systems.js.
// (The Lua's init() hides PokermonMaelmc's Ralts line when both mods load — no Maelmc here.)
import {
  G, localize, card_eval_status_text, update_hand_text, level_up_hand, create_card, pseudorandom_element, pseudoseed,
  defineNacho, type_tooltip, level_evo, item_evo, calc_most_played_hand, Tag, add_tag, play_sound,
} from '../api.js';

const FILE = 'src/pokemon/0280_ralts.lua';

/** Sum over every poker hand of (level - 1) * per. */
const levels_above_one = (per) => { let n = 0; for (const v of Object.values(G.GAME.hands)) n = n + (v.level - 1) * per; return n; };
const visible_hands = () => G.handlist.filter((k) => G.GAME.hands[k].visible);

defineNacho({
  // Ralts 280
  ralts: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.mult_mod, levels_above_one(card.ability.extra.mult_mod), card.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { mult: levels_above_one(card.ability.extra.mult_mod), card };
      }
      return level_evo(self, card, context, 'j_nacho_kirlia');
    },
  },
  // Kirlia 281
  kirlia: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.mult_mod, levels_above_one(card.ability.extra.mult_mod), card.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { mult: levels_above_one(card.ability.extra.mult_mod), card };
      }
      return item_evo(self, card, context, 'j_nacho_gallade') || level_evo(self, card, context, 'j_nacho_gardevoir');
    },
  },
  // Gardevoir 282
  gardevoir: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.Xmult_mod, 1 + levels_above_one(card.ability.extra.Xmult_mod)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const xmult = 1 + levels_above_one(card.ability.extra.Xmult_mod);
        if (xmult > 1) return { xmult, card };
      }
      return undefined;
    },
  },
  // Mega Gardevoir 282-1
  mega_gardevoir: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ key: 'tag_orbital', set: 'Tag', specific_vars: ['Random Hand', 3] });
      return { vars: [card.ability.extra.blackhole_amount] };
    },
    calculate(self, card, context) {
      // Create an Orbital Tag (random visible hand) on Planet use
      if (context.using_consumeable && context.consumeable && context.consumeable.ability && context.consumeable.ability.set === 'Planet') {
        const tag = new Tag('tag_orbital');
        tag.ability.orbital_hand = pseudorandom_element(visible_hands(), pseudoseed('mega_gardevoir'))[0];
        G.E_MANAGER.add_event(() => { add_tag(tag); play_sound('generic1'); play_sound('holo1'); });
      }
      // Held Planet cards without an edition become Polychrome at end of round
      if (context.end_of_round && !context.blueprint) {
        for (const v of G.consumeables.cards) if (v.ability.set === 'Planet' && !v.edition) v.set_edition({ polychrome: true }, true);
      }
      return undefined;
    },
    // A Negative Black Hole on entry
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) {
        const _card = create_card('Spectral', G.consumeables, null, null, null, null, 'c_black_hole');
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'SECONDARY_SET.Spectral' });
      }
    },
  },
  // Gallade 475
  gallade: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      // A Planet was used: level up the most played hand by one instead (the Planet's own level-up
      // is blocked while Gallade is owned — systems.js level_up_hand hook).
      if (context.using_consumeable && context.consumeable && context.consumeable.ability && context.consumeable.ability.set === 'Planet') {
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_psycho_cut_ex'), colour: 'SECONDARY_SET.Planet' });
        const _hand = calc_most_played_hand();
        card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_level_up_ex') });
        update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, { handname: localize(_hand, 'poker_hands'), chips: G.GAME.hands[_hand].chips, mult: G.GAME.hands[_hand].mult, level: G.GAME.hands[_hand].level });
        level_up_hand(context.blueprint_card || card, _hand, null, 1);
        update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { xmult: 1 + card.ability.extra.Xmult_mod * G.GAME.hands[context.scoring_name].played, card };
      }
      return undefined;
    },
  },
  // Mega Gallade 475-1
  mega_gallade: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { xmult: 1 + card.ability.extra.Xmult_mod * G.GAME.hands[context.scoring_name].played, card };
      }
      return undefined;
    },
  },
}, FILE);
