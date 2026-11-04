// Þe Autumn Circus — modules/MoreConsumables.lua: the tarots, planets and spectrals, plus the More Fluff
// cross-mod Rotarots and Colour (registered only while More Fluff is on too: util.consumable() carries their
// `dependencies`, the registry hides them otherwise). Static fields (set / config / pos / atlas / text / pool
// flags) come from data.js (config.lua + load_checks honoured); behaviour is ported from the Lua below.
//   Tarots (11)     universe, void, happy_squirrel, artist, veteran, drunkard, juggler, bone, collector, cycle, joker
//                   (veteran / bone / collector / cycle have no use(): Balatro's own mod_conv path enhances;
//                   drunkard / juggler are unfinished — yes_pool_flag 'neversetthis', no effect, never usable)
//   Planets (10)    comet, meteor, satellite, moon, station, dysnomia, planet_s / _h / _c / _d (AMM suit levels)
//                   + their Observatory effects (TheAutumnCircus.lua's mc_obs_on/off_* boxes): the planets'
//                   calculate in joker_main while v_observatory is redeemed (the engine scores consumables there)
//   Spectrals (19)  chance, offering, tribute, sacrifice, scry, lotus, phantom, mischief, comedy, tragedy, whimsy,
//                   entropy, wonder, macabre, duplicity, banana, artifice, sunset, quest_bed
//   Rotarots (8)    rot_universe / void / happy_squirrel / artist / veteran ("Sorry nothing": never usable or
//                   in a pool), rot_drunkard / rot_juggler (make the vanilla joker), rot_joker (makes The Joker)
//   Colour (1)      placeholder_grey (the Lua declares `local colours` twice; the second, registered one is it)
// Skipped: shooting_star / chill_moon / rotflip_star / rotflip_moon (SixSuits), journey (Hiker's Stamp is off in
// config.lua), the Umbral / Bakery cards (Aikoyori, SDM0's Stuff). Not ported (cosmetic): art-credit info boxes,
// sounds' pitch maths, the badge DynaText layout (the badge label is kept).
//
// FIX (intended design) list:
//   1. Chance: the seal is `seal_list[math.floor(roll * #seal_list)]` on a 1-based list — index 0 is nil (no seal
//      although the ~20% seal roll hit) and the last seal of the pool (Purple) could never be chosen. It picks
//      floor(roll * n) + 1, every seal equally.
//   2. Mischief: its "each OTHER Joker" guard compares against `chosen_joker`, an undefined global (nil), so the
//      joker being destroyed was stamped too (a stamp, sound and animation on a dissolving card; no lasting
//      effect, its deck effect is undone as it leaves). Only jokers still in the joker row get a stamp.
// Approximation: The Joker tarot's 1-in-100,000 secret appends 1000 chained "+4 Mult" returns; the engine walks
// `extra` chains only ~20 deep, so the 1000 are folded into one "+4000 Mult" link (same score).
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, localize, play_sound, emit, pseudorandom, pseudoseed, pseudorandom_element,
  pseudoshuffle, create_card, copy_card, poll_edition, level_up_hand, update_hand_text, ease_dollars, ease_hands_played,
  attention_text, card_eval_status_text,
} from '../../js/engine/core.js';
import { MOD_LOC } from '../../js/mods/registry.js';
import {
  AMM, data, consumable, chance, prob_vars, pseudorandom_unlocked_hand, favorite_hand, pseudorandom_enhancement,
  playing_card_joker_effects, smods_card,
} from './util.js';
import { stamps } from './systems.js';
import { progressbar } from '../morefluff/util.js';
import { track_last } from '../morefluff/rotarots.js';

// ------------------------------------------------------------------ text the mod adds at load
// TheAutumnCircus.lua process_loc_text (Observatory boxes, "Shuffled!") and AMM's Stamp loc
// (descriptions.Other['<key>_stamp'], from each stamp's loc_txt). Added only where loc.js has nothing.
const OTHER = (MOD_LOC.descriptions.Other = MOD_LOC.descriptions.Other || {});
const add_other = (k, v) => { if (!OTHER[k]) OTHER[k] = v; };
const OFF = ['{s:0.8}Effect is {C:red,s:0.8}inactive{s:0.8}!', '{s:0.8}Get the {C:attention,s:0.8}Observatory voucher{s:0.8} for:'];
const OBS_TEXT = {
  comet: ['Chooses a hand at random,', 'then gives {X:mult,C:white} X2.25 {} Mult if the', 'played hand is that hand'],
  meteor: ['Chooses two hands at random,', 'then gives {X:mult,C:white} X3.375 {} Mult if the', 'played hand is the first hand,',
    'or gives {X:mult,C:white} X0.66 {} Mult if the', 'played hand is the second hand'],
  station: ['Gives {X:mult,C:white} X1.5 {} Mult if the played', 'hand is most played hand'],
  dysnomia: ['Nothing actually...'],
};
const inactive = (l) => '{C:inactive,s:0.8}' + l.replace(/\{X:mult,C:white\} (\S+) \{\}/, '{X:mult,C:white,s:0.8} $1 {C:inactive,s:0.8}');
for (const [k, text] of Object.entries(OBS_TEXT)) {
  add_other('mc_obs_on_' + k, { name: 'Observatory Effect', text });
  add_other('mc_obs_off_' + k, { name: 'Observatory Effect', text: [...OFF, ...text.map(inactive)] });
}
for (const s of stamps) add_other(s.key + '_stamp', { name: s.display_name, text: s.text });
MOD_LOC.misc.dictionary = MOD_LOC.misc.dictionary || {};
if (!MOD_LOC.misc.dictionary.k_thac_shuffle) MOD_LOC.misc.dictionary.k_thac_shuffle = 'Shuffled!';

// ------------------------------------------------------------------ helpers
const obs = () => !!(G.GAME && G.GAME.used_vouchers && G.GAME.used_vouchers.v_observatory);
const OBS = () => P_CENTERS.v_observatory.config.extra;
const room_or_held = (card) => G.consumeables.cards.length < G.consumeables.config.card_limit || card.area === G.consumeables;
const cfg = (self, card) => (card && card.ability && card.ability.consumeable) || self.config;
const name_text = (set, key) => localize({ type: 'name_text', set, key });
const used_juice = (used) => G.E_MANAGER.add_event(() => { play_sound('tarot1'); used.juice_up(0.3, 0.5); });
/** set_badges: the type badge renamed (the Lua's create_badge("Comet", <the set's colour>)). */
const badge_as = (label) => (self, card, badges) => { badges[0] = { ...(badges[0] || {}), label }; return badges; };
/**
 * A consumable center c_thac_<key>: data.js + behaviour. SMODS defaults: cost 3. The Lua tables that name
 * themselves (`name = "Chance"`) keep that name (pseudoseed(self.ability.name) reads it); their name / subtitle /
 * text become loc_txt (data.lua's Consumables buffer), shown where loc.js has no entry.
 */
function C(key, def = {}) {
  const s = data('Consumables', key);
  const c = consumable(key, def);
  if (!c) return null;
  if (c.cost === undefined) c.cost = 3;
  if (s.name) c.name = s.name;
  if (Array.isArray(s.text)) c.loc_txt = { name: s.subtitle ? [s.name, '{C:autumn,s:0.5}' + s.subtitle] : s.name, text: s.text };
  delete c.text; delete c.subtitle;
  return c;
}
/** The flip / change / flip-back sequence the Lua tarots run over a list of cards (events, in order). */
function flip_all(list) {
  for (let i = 0; i < list().length; i++) G.E_MANAGER.add_event(() => { const c = list()[i]; if (c) { c.flip(); play_sound('card1'); c.juice_up(0.3, 0.3); } });
}
function flip_back(list) {
  for (let i = 0; i < list().length; i++) G.E_MANAGER.add_event(() => { const c = list()[i]; if (c) { c.flip(); play_sound('tarot2', 1, 0.6); c.juice_up(0.3, 0.3); } });
}
const HL = () => G.hand.highlighted;
/** "Creates up to N random <type> cards (Must have room)": Satellite / Scry. */
function create_up_to(card, used, n, type, append) {
  for (let i = 0; i < Math.min(n, G.consumeables.config.card_limit - G.consumeables.cards.length); i++) {
    G.E_MANAGER.add_event(() => {
      if (G.consumeables.config.card_limit > G.consumeables.cards.length) {
        play_sound('timpani');
        const c = create_card(typeof type === 'function' ? type() : type, G.consumeables, null, null, null, null, null, append);
        c.add_to_deck();
        G.consumeables.emplace(c);
        used.juice_up(0.3, 0.5);
      }
    });
  }
}
/** update_hand_text + level_up_hand for one hand (the planets' use). */
function level(used, hand, amount) {
  const h = G.GAME.hands[hand];
  update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, { handname: localize(hand, 'poker_hands'), chips: h.chips, mult: h.mult, level: h.level });
  level_up_hand(used, hand, null, amount);
  update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
}
const xmult = (value) => ({ message: localize({ type: 'variable', key: 'a_xmult', vars: [value] }), Xmult_mod: value });
const obs_info = (key) => (iq) => iq.push({ key: (obs() ? 'mc_obs_on_' : 'mc_obs_off_') + key, set: 'Other' });

// ======================================================================= tarots
/** veteran / bone / collector / cycle: Balatro's mod_conv enhance (no use() of their own). */
const enh_tarot = (key) => C(key, {
  loc_vars(self, iq, card) {
    const c = cfg(self, card);
    if (P_CENTERS[c.mod_conv]) iq.push(P_CENTERS[c.mod_conv]);
    return { vars: [c.max_highlighted, name_text('Enhanced', c.mod_conv)] };
  },
});
const hee_hoo = () => {
  G.E_MANAGER.add_event(() => { attention_text('Hee hee!'); play_sound('tarot2', 1, 0.4); });
  G.E_MANAGER.add_event(() => { attention_text('Hoo hoo!'); play_sound('tarot2', 1, 0.4); });
};
const tarots = [
  C('universe', {
    loc_vars: (self, iq, card) => ({ vars: [self.config.max_highlighted] }),
    use(self, card, area, copier) {
      used_juice(copier || card);
      flip_all(HL);
      for (let i = 0; i < HL().length; i++) G.E_MANAGER.add_event(() => { HL()[i].set_ability(pseudorandom_enhancement()); });
      flip_back(HL);
      G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
    },
  }),
  C('void', {
    loc_vars: (self) => ({ vars: [self.config.max_highlighted, self.config.extra.dollars] }),
    use(self, card, area, copier) {
      let payout = 0;
      used_juice(copier || card);
      flip_all(HL);
      for (let i = 0; i < HL().length; i++) {
        if (HL()[i].config.center !== P_CENTERS.c_base) payout += card.ability.extra.dollars;
        G.E_MANAGER.add_event(() => { HL()[i].set_ability(P_CENTERS.c_base); });
      }
      flip_back(HL);
      G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
      if (payout > 0) ease_dollars(payout);
    },
  }),
  C('happy_squirrel', {
    loc_vars: (self) => ({ vars: [1, self.config.extra.copies] }),
    use(self, card, area, copier) {
      used_juice(copier || card);
      G.E_MANAGER.add_event(() => {
        const new_cards = [];
        for (let i = 0; i < card.ability.extra.copies; i++) {
          G.playing_card = (G.playing_card || 0) + 1;
          const _card = copy_card(G.hand.highlighted[0], null, null, G.playing_card);
          _card.add_to_deck();
          G.deck.config.card_limit += 1;
          G.playing_cards.push(_card);
          G.hand.emplace(_card);
          emit('materialize', { card: _card.sort_id });
          new_cards.push(_card);
        }
        playing_card_joker_effects(new_cards);
      });
      G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
    },
    can_use: () => G.hand.highlighted.length === 1 && G.hand.highlighted[0].ability.set === 'Default',
  }),
  C('artist', {
    loc_vars: (self) => ({ vars: [self.config.max_highlighted, self.config.extra.targets] }),
    use(self, card, area, copier) {
      const used = copier || card;
      const selected = G.hand.highlighted[0];
      const temp_hand = G.hand.cards.filter((v) => v !== selected).sort((a, b) => (a.playing_card || 0) - (b.playing_card || 0));
      pseudoshuffle(temp_hand, pseudoseed('artist'));
      const targets = temp_hand.slice(0, card.ability.extra.targets);
      flip_all(() => targets);
      used_juice(used);
      G.E_MANAGER.add_event(() => {
        for (let i = targets.length - 1; i >= 0; i--) {
          const t = targets[i];
          t.set_ability(selected.config.center);
          t.set_edition(selected.edition ? { ...selected.edition } : null);
          t.set_seal(selected.seal);
        }
      });
      flip_back(() => targets);
      G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
    },
  }),
  enh_tarot('veteran'),
  // (unfinished: no config, no loc vars — Balatro prints ERROR for a missing #n#, as the game shows it)
  C('drunkard', { loc_vars: () => ({ vars: ['ERROR', 'ERROR'] }) }),
  C('juggler', { loc_vars: () => ({ vars: [] }) }),
  enh_tarot('bone'),
  enh_tarot('collector'),
  enh_tarot('cycle'),
  C('joker', {
    loc_vars: (self) => ({ vars: [self.config.mult] }),
    use(self, card, area, copier) { hee_hoo(); },
    can_use: () => true,
    calculate(self, card, context) {
      if (context.joker_main) {
        const append_extra = (ret, append) => { let r = ret; while (r.extra) r = r.extra; r.extra = append; return ret; };
        const m = card.ability.consumeable.mult;
        const ret = { message: 'Hee hee!', colour: 'PURPLE' };
        append_extra(ret, { message: 'Hoo hoo!', colour: 'ORANGE' });
        if (pseudorandom(pseudoseed('joker_tarot_secret')) < 1 / 100000) {
          append_extra(ret, { message: 'It is time!', colour: 'BLUE' });
          append_extra(ret, { message: 'For my true power!', colour: 'RED' });
          // (approximation, see the header: 1000 x "+4 Mult" as one link)
          append_extra(ret, { message: localize({ type: 'variable', key: 'a_mult', vars: [m * 1000] }), mult_mod: m * 1000 });
          return ret;
        }
        append_extra(ret, { message: localize({ type: 'variable', key: 'a_mult', vars: [m] }), mult_mod: m });
        return ret;
      }
      return undefined;
    },
  }),
];

// ======================================================================= planets
const suit_planet = (key) => C(key, {
  loc_vars(self, iq, card) {
    const suit = (card && card.ability && card.ability.level_suit) || self.config.level_suit;
    const sl = (G.GAME && G.GAME.amm_data && G.GAME.amm_data.suit_levels[suit]) || { level: 1 };
    return {
      vars: [sl.level, AMM.localize_suit(suit), AMM.CONFIG.suit_levels.mult, AMM.CONFIG.suit_levels.chips],
      // (G.C.UI.TEXT_DARK at level 1, else G.C.HAND_LEVELS[min(7, level)]; G.C.SUITS[suit])
      colours: [sl.level <= 1 ? 'default' : { hand_level: Math.min(7, sl.level) }, suit],
    };
  },
  use(self, card, area, copier) { AMM.level_up_suit(copier || card, self.config.level_suit); },
  can_use: () => true,
  set_badges: badge_as('Planet?'),
  in_pool: (self) => (G.playing_cards || []).some((v) => v.is_suit(self.config.level_suit, true)),
});
const planets = [
  C('comet', {
    loc_vars(self, iq) { obs_info('comet')(iq); return { vars: [self.config.strength] }; },
    use(self, card, area, copier) {
      const used = copier || card;
      level(used, pseudorandom_unlocked_hand(), used.ability.consumeable.strength);
    },
    can_use: () => true,
    set_badges: badge_as('Comet'),
    calculate(self, card, context) {
      if (context.joker_main) {
        if (obs() && context.scoring_name === pseudorandom_unlocked_hand(null, 'comet_observatory')) return xmult(OBS() * OBS());
        if (obs()) return { message: localize('k_nope_ex') };
      }
      return undefined;
    },
  }),
  C('meteor', {
    loc_vars(self, iq) { obs_info('meteor')(iq); return { vars: [self.config.strength, self.config.weakness] }; },
    use(self, card, area, copier) {
      const used = copier || card;
      let chosen = pseudorandom_unlocked_hand();
      level(used, chosen, used.ability.consumeable.strength);
      chosen = pseudorandom_unlocked_hand(chosen);
      const h = G.GAME.hands[chosen];
      if (h.level <= 1) {
        update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, { handname: localize(chosen, 'poker_hands'), chips: h.chips, mult: h.mult, level: h.level });
        update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
      } else level(used, chosen, -1 * (used.ability.consumeable.weakness || 1));
    },
    can_use: () => true,
    set_badges: badge_as('Meteor'),
    calculate(self, card, context) {
      if (context.joker_main) {
        const hand_1 = pseudorandom_unlocked_hand(null, 'meteor_observatory');
        const hand_2 = pseudorandom_unlocked_hand(null, 'meteor_observatory');
        if (obs() && context.scoring_name === hand_1) return xmult(OBS() * OBS() * OBS());
        if (obs() && context.scoring_name === hand_2) return xmult(Math.floor((1 / OBS()) * 100) / 100);
        if (obs()) return { message: localize('k_nope_ex') };
      }
      return undefined;
    },
  }),
  C('satellite', {
    loc_vars: (self) => ({ vars: [self.config.planets] }),
    use(self, card, area, copier) { create_up_to(card, copier || card, card.ability.consumeable.planets, 'Planet', 'satellite_planet'); },
    can_use: (self, card) => room_or_held(card),
    set_badges: badge_as('Space Junk'),
  }),
  C('moon', {
    loc_vars: (self) => ({ vars: [self.config.cards] }),
    use(self, card, area, copier) {
      create_up_to(card, copier || card, card.ability.consumeable.cards, () => pseudorandom_element(['Tarot', 'Planet', 'Spectral'], pseudoseed('moon_planet_type'))[0], 'moon_planet');
    },
    can_use: (self, card) => room_or_held(card),
    set_badges: badge_as('Moon'),
  }),
  C('station', {
    loc_vars(self, iq) { obs_info('station')(iq); return { vars: [self.config.strength, favorite_hand()] }; },
    use(self, card, area, copier) {
      const used = copier || card;
      level(used, favorite_hand(), used.ability.consumeable.strength);
    },
    can_use: () => true,
    set_badges: badge_as('Space Junk'),
    calculate(self, card, context) {
      if (context.joker_main && obs() && context.scoring_name === favorite_hand()) return xmult(OBS());
      return undefined;
    },
  }),
  C('dysnomia', {
    loc_vars(self, iq, card) {
      obs_info('dysnomia')(iq);
      const odds = (card && card.ability && card.ability.extra ? card.ability.extra : self.config.extra).odds;
      return { vars: prob_vars(card && card.ability ? card : null, 1, odds) };
    },
    use(self, card, area, copier) {
      const used = copier || card;
      // (pairs(G.GAME.hands) order: the hand list's)
      const keys = [...G.handlist, ...Object.keys(G.GAME.hands).filter((k) => !G.handlist.includes(k))];
      const names = [], levels = [];
      for (const k of keys) if (G.GAME.hands[k] && G.GAME.hands[k].visible) { levels.push(G.GAME.hands[k].level); names.push(k); }
      pseudoshuffle(names, pseudoseed('dysnomia'));
      for (let i = 0; i < levels.length; i++) {
        const h = G.GAME.hands[names[i]];
        h.level = levels[i];
        if (chance(card, 'dysnomia_check', 1, card.ability.extra.odds)) {
          if (pseudorandom(pseudoseed('dysnomia_check2')) < 1 / 2) h.level = Math.max(1, h.level - 1);
          else h.level = h.level + 1;
        }
        level_up_hand(null, names[i], true, 0);
      }
      G.E_MANAGER.add_event(() => { attention_text(localize('k_thac_shuffle')); play_sound('tarot2', 1, 0.4); used.juice_up(0.3, 0.5); });
    },
    can_use: () => true,
    set_badges: badge_as('Moon of a dwarf planet'),
    // (its Observatory effect is "Nothing actually...": the Lua's calculate computes a value and returns nothing)
    calculate: () => undefined,
  }),
  suit_planet('planet_s'),
  suit_planet('planet_h'),
  suit_planet('planet_c'),
  suit_planet('planet_d'),
];

// ===================================================================== spectrals
const eligible_strength_jokers = () => (G.jokers ? G.jokers.cards.filter((v) => v.ability.set === 'Joker' && !v.seal) : []);
/** comedy .. sunset: the Stamp in config.extra onto a random stamp-less joker (stampcarduse / canuse / update). */
const stamp_card = (key) => C(key, {
  loc_vars(self, iq) { iq.push({ key: self.config.extra + '_stamp', set: 'Other' }); return { vars: [] }; },
  use(self, card, area, copier) {
    const used = copier || card;
    const [conv] = pseudorandom_element(eligible_strength_jokers(), pseudoseed(card.ability.name));
    G.E_MANAGER.add_event(() => { play_sound('tarot1'); used.juice_up(0.3, 0.5); });
    G.E_MANAGER.add_event(() => { conv.set_seal(card.ability.extra); });
  },
  can_use: () => eligible_strength_jokers().length > 0,
});
const add_slots = (n) => G.E_MANAGER.add_event(() => { if (G.jokers) G.jokers.config.card_limit += n; });
const spectrals = [
  C('chance', {
    loc_vars: () => ({ vars: [] }),
    use(self, card, area, copier) {
      used_juice(copier || card);
      const HC = () => G.hand.cards;
      flip_all(HC);
      const seal_list = (P_CENTER_POOLS.Seal || []).map((v) => v.key);
      for (let i = 0; i < G.hand.cards.length; i++) {
        G.E_MANAGER.add_event(() => {
          const c = G.hand.cards[i];
          if (!c) return;
          // Suit and Rank randomized
          c.set_base(pseudorandom_element(P_CARDS, pseudoseed('chancetime'))[0]);
          // Enhancement (~ 80% chance)
          if (pseudorandom(pseudoseed('chancetime')) < 0.8) c.set_ability(pseudorandom_enhancement());
          else c.set_ability(P_CENTERS.c_base);
          // Edition: 10% Negative, else a boosted (x2) standard poll
          if (pseudorandom(pseudoseed('chancetime')) < 0.1) c.set_edition({ negative: true });
          else c.set_edition(poll_edition('standard_edition' + G.GAME.round_resets.ante, 2, true));
          // Seal (~ 20% chance)
          const seal_rate = 10;
          const seal_poll = pseudorandom(pseudoseed('stdseal' + G.GAME.round_resets.ante));
          if (seal_poll > 1 - 0.02 * seal_rate) {
            const seal_type = Math.floor(pseudorandom(pseudoseed('stdsealtype' + G.GAME.round_resets.ante)) * seal_list.length);
            // FIX (intended design): the Lua indexes its 1-based list with floor(roll * n) (0 .. n-1): 0 gave no
            // seal and the last seal never came up. Index floor(roll * n) + 1 (JS: seal_list[seal_type]).
            c.set_seal(seal_list[seal_type]);
          } else c.set_seal();
        });
      }
      flip_back(HC);
    },
    can_use: () => G.hand.cards.length > 1,
  }),
  C('offering', {
    loc_vars: (self) => ({ vars: [self.config.extra.destroy, self.config.extra.slots] }),
    use(self, card, area, copier) {
      const used = copier || card;
      const temp_deck = G.playing_cards.slice().sort((a, b) => (a.playing_card || 0) - (b.playing_card || 0));
      pseudoshuffle(temp_deck, pseudoseed('immolate'));
      const destroyed = temp_deck.slice(0, Math.floor(temp_deck.length / card.ability.extra.destroy));
      used_juice(used);
      G.E_MANAGER.add_event(() => {
        for (let i = destroyed.length - 1; i >= 0; i--) {
          const c = destroyed[i];
          if (c.ability.name === 'Glass Card') c.shatter(); else c.start_dissolve();
        }
      });
      for (const j of G.jokers.cards.slice()) j.calculate_joker({ remove_playing_cards: true, removed: destroyed });
      add_slots(card.ability.extra.slots);
    },
    can_use: () => G.playing_cards.length > 1,
  }),
  C('tribute', {
    loc_vars: (self) => ({ vars: [self.config.extra.slots] }),
    use(self, card, area, copier) {
      const destroyed = G.jokers.cards.filter((j) => !j.ability.eternal);
      used_juice(copier || card);
      G.E_MANAGER.add_event(() => { for (let i = destroyed.length - 1; i >= 0; i--) destroyed[i].start_dissolve(); });
      add_slots(card.ability.extra.slots);
    },
    can_use: () => G.jokers.cards.length > 0,
  }),
  C('sacrifice', {
    loc_vars: (self) => ({ vars: [self.config.extra.slots, self.config.extra.hands] }),
    use(self, card, area, copier) {
      const used = copier || card;
      G.E_MANAGER.add_event(() => {
        play_sound('tarot1'); used.juice_up(0.3, 0.5);
        card_eval_status_text(card, 'extra', null, null, null, { message: '-1 Hand', colour: 'BLUE' });
      });
      G.E_MANAGER.add_event(() => {
        G.GAME.round_resets.hands -= card.ability.extra.hands;
        ease_hands_played(-card.ability.extra.hands);
      });
      add_slots(card.ability.extra.slots);
    },
    can_use: () => true,
  }),
  C('scry', {
    // (the Lua returns extra.destroy / extra.slots — nil for Scry; its text has no #n#)
    loc_vars: () => ({ vars: [] }),
    use(self, card, area, copier) { create_up_to(card, copier || card, card.ability.extra.spectrals, 'Spectral', 'scry'); },
    can_use: (self, card) => room_or_held(card),
  }),
  C('lotus', {
    loc_vars: (self, iq, card) => ({ vars: [((card && card.ability && card.ability.extra) || self.config.extra).tarots] }),
    use(self, card, area, copier) {
      const used = copier || card;
      for (let i = 0; i < card.ability.extra.tarots; i++) {
        G.E_MANAGER.add_event(() => {
          play_sound('timpani');
          const c = create_card('Tarot', G.consumeables, null, null, null, null, null, 'lotus');
          c.set_edition({ negative: true });
          c.add_to_deck();
          G.consumeables.emplace(c);
          used.juice_up(0.3, 0.5);
        });
      }
    },
    can_use: () => true,
  }),
  C('phantom', {
    loc_vars: () => ({ vars: [] }),
    use(self, card, area, copier) {
      const c = create_card('Joker', G.jokers, null, null, null, null, null, 'phantom');
      c.set_edition({ negative: true });
      c.set_eternal(false); // just in case
      c.set_perishable(true);
      c.add_to_deck();
      G.jokers.emplace(c);
      for (const j of G.jokers.cards) {
        j.base_cost = 0;
        j.ability.extra_value = 0;
        j.cost = 0;
        j.sell_cost = 0;
        j.sell_cost_label = j.facing === 'back' ? '?' : j.sell_cost;
      }
    },
    can_use: () => true,
  }),
  C('mischief', {
    loc_vars: () => ({ vars: [] }),
    use(self, card, area, copier) {
      // destroy a random joker
      AMM.destroy_random_jokers(G.jokers.cards, 1);
      // add stamps to the rest
      for (const v of G.jokers.cards.slice()) {
        const keyset = AMM.active_stamps().map((s) => s.key);
        // FIX (intended design): the Lua's `chosen_joker` guard is an undefined global, so the joker being
        // destroyed was stamped as well; only a joker still in the row ("each other Joker") gets one.
        G.E_MANAGER.add_event(() => { if (v.area === G.jokers) v.set_seal(pseudorandom_element(keyset, pseudoseed('mischiefs_reward'))[0], false); });
      }
    },
    can_use: () => G.jokers.cards.length > 1,
  }),
  stamp_card('comedy'),
  stamp_card('tragedy'),
  stamp_card('whimsy'),
  stamp_card('entropy'),
  stamp_card('wonder'),
  stamp_card('macabre'),
  stamp_card('duplicity'),
  stamp_card('banana'),
  stamp_card('artifice'),
  stamp_card('sunset'),
  C('quest_bed', {
    loc_vars: () => ({ vars: [] }),
    use(self, card, area, copier) {
      AMM.destroy_random_jokers(G.jokers.cards, 2);
      const keyset = AMM.active_aspects().map((a) => a.key);
      const [god_tier] = pseudorandom_element(keyset, pseudoseed('god_tier'));
      for (const v of G.hand.cards.slice()) G.E_MANAGER.add_event(() => { AMM.set_aspect(v, god_tier, false); });
    },
    can_use: () => G.jokers.cards.length >= 2 && G.hand.cards.length > 1,
  }),
];

// ================================================================ More Fluff cross-mod
/** A Rotarot / Colour used: More Fluff's lovely rot_fool.toml makes it the 45° Fool's target. */
const rotarot = (key, def) => C(key, { ...def, use(self, card, area, copier) { track_last(card); if (def.use) def.use(self, card, area, copier); } });
const sorry_nothing = (key) => rotarot(key, { loc_vars: () => ({ vars: [] }), can_use: () => false, in_pool: () => false });
/** rot_drunkard / rot_juggler: the vanilla joker (Must have room). */
const rot_make_joker = (key, joker) => rotarot(key, {
  loc_vars(self, iq) { iq.push(P_CENTERS[joker]); return { vars: [] }; },
  use(self, card, area, copier) {
    const used = copier || card;
    for (let i = 0; i < Math.min(1, G.jokers.config.card_limit - G.jokers.cards.length); i++) {
      G.E_MANAGER.add_event(() => {
        if (G.jokers.config.card_limit > G.jokers.cards.length) {
          play_sound('timpani');
          smods_card({ key: joker, area: G.jokers }, true);
          used.juice_up(0.3, 0.5);
        }
      });
    }
  },
  can_use: () => G.jokers.cards.length < G.jokers.config.card_limit,
});
const crossmod = [
  sorry_nothing('rot_universe'),
  sorry_nothing('rot_void'),
  sorry_nothing('rot_happy_squirrel'),
  sorry_nothing('rot_artist'),
  sorry_nothing('rot_veteran'),
  rot_make_joker('rot_drunkard', 'j_drunkard'),
  rot_make_joker('rot_juggler', 'j_juggler'),
  rotarot('rot_joker', {
    loc_vars(self, iq) { iq.push(P_CENTERS.c_thac_joker); return { vars: [] }; },
    use(self, card, area, copier) {
      const used = copier || card;
      for (let i = 0; i < Math.min(1, G.consumeables.config.card_limit - G.consumeables.cards.length); i++) {
        G.E_MANAGER.add_event(() => {
          if (G.consumeables.config.card_limit > G.consumeables.cards.length) {
            play_sound('timpani');
            smods_card({ key: 'c_thac_joker', area: G.consumeables }, true);
            used.juice_up(0.3, 0.5);
          }
        });
      }
    },
    can_use: (self, card) => room_or_held(card),
  }),
  C('placeholder_grey', {
    loc_vars(self, iq, card) {
      const a = card && card.ability && card.ability.upgrade_rounds !== undefined ? card.ability : self.config;
      const [val, max] = progressbar(a.partial_rounds, a.upgrade_rounds);
      if (P_CENTERS.j_thac_placeholder_joker) iq.push(P_CENTERS.j_thac_placeholder_joker);
      return { vars: [a.val, val, max, a.upgrade_rounds] };
    },
    use(self, card) {
      track_last(card);
      for (let i = 0; i < card.ability.val; i++) {
        G.E_MANAGER.add_event(() => {
          smods_card({ set: 'Joker', key: 'j_thac_placeholder_joker', edition: { negative: true }, area: G.jokers }, true);
          card.juice_up(0.3, 0.5);
        });
      }
    },
    // (a Colour card is TAKEN from a pack, never used there: More Fluff's Colour type)
    can_use: (self, card) => card.area !== G.pack_cards,
  }),
];

export const centers = [...tarots, ...planets, ...spectrals, ...crossmod].filter(Boolean);
export const hooks = {};
