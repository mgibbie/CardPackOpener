// Pokermon 3.9.1 — enhancements/enhancement1.lua (on 3.9.1 since batch 10): Hazard (no rank or suit, no chips, always
// scores; 1 in 3 to be destroyed when held at end of round — 3.2.1 was 1 in 6), Seed (new: grows each time it scores,
// becomes a Flower card and pays $15 after 5 growths) and Flower (X2 Mult when the scoring hand has 4 suits — 3 with
// Roserade; X3 with Shaymin / Shaymin Sky. 3.2.1 was X3 always). Only Seed is in the Enhanced pool (weight 5).
// no_rank / no_suit / replace_base_card / always_scores and enhancement `calculate` are engine seams (core.js get_id /
// is_suit / get_chip_bonus / mod_card_calculate, run.js scoring + end_of_round). A quantum Hazard (Mega Steelix's Stone
// cards) rolls its destroy too: js/engine/smods.js quantum_mod_calculate.
// The April Fools Ludicolo card (batch 17; 3.9.1 registers it only with pokemon_aprilfools, ours always, never in a pool): what
// Miror Budicolo turns into (jokers/zzzapril_fools.js). No rank or suit, replaces the base card, always scores: "Ludicolo!".
import {
  G, P_CENTERS, localize, ease_dollars, defineEnhancements, pseudorandom_probability, get_probability_vars,
  poke_remove_card, poke_suit_check, find_card, any, hazard_rules_tip,
} from '../api.js';

const FILE = 'enhancements/enhancement1.lua';
/** Owned, undebuffed jokers whose center has this hook (house: the owner's Cherubi line, jokers/pokejokers_designs.js). None: nothing. */
const hooked = (name) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && typeof j.config.center[name] === 'function');
/** A Seed card bloomed into a Flower: every owned joker's poke_seed_bloom(self, joker, card) hears it (Cherubi counts toward evolving). */
function seed_bloomed(card) {
  for (const j of hooked('poke_seed_bloom')) j.config.center.poke_seed_bloom(j.config.center, j, card);
}
/** The Flower card's rule with the owned jokers' poke_flower_rule(self, joker) -> {suits, x}: the FEWEST suits asked (Roserade's 3 is
 *  a minimum too: never stacking), the BEST X instead of the card's own X2 (Cherrim's Sunshine X2.5). No such joker: upstream's rule. */
function flower_rule(card, self) {
  let suits = any(find_card('j_poke_roserade')) ? 3 : 4;
  let x = card.ability.Xmult_flower ?? self.config.Xmult_flower;
  for (const j of hooked('poke_flower_rule')) {
    const r = j.config.center.poke_flower_rule(j.config.center, j) || {};
    if (typeof r.suits === 'number') suits = Math.min(suits, r.suits);
    if (typeof r.x === 'number') x = Math.max(x, r.x);
  }
  return { suits, x };
}

defineEnhancements({
  hazard: {
    config: { num: 1, dem: 3 }, // (3.9.1: 1 in 3; 3.2.1's data.js says 1 in 6)
    loc_vars(self, info_queue, center) {
      const [num, dem] = get_probability_vars(center, self.config.num, self.config.dem, 'hazard');
      info_queue.push(hazard_rules_tip()); // (house: how Hazards work; systems/utils.js)
      return { vars: [num, dem] };
    },
    in_pool() { return false; },
    calculate(self, card, context) {
      // (house: a Hazard Gulpin / Swalot already swallowed this round — `poke_swallowed` — doesn't roll a second destroy)
      if (context.end_of_round && !context.individual && !context.repetition && context.cardarea === G.hand && context.playing_card_end_of_round && !card.poke_swallowed) {
        if (pseudorandom_probability(card, 'hazard', self.config.num, self.config.dem, 'hazard')) poke_remove_card(card, card);
      }
      return undefined;
    },
  },
  // Seed (3.9.1; art MyDude_YT): AtlasEnhancementsBasic {1,0}; its growth stage shows as cells {2..6,0} (set_sprites).
  seed: {
    key: 'seed',
    atlas: 'AtlasEnhancementsBasic',
    artist: 'MyDude_YT',
    pos: { x: 1, y: 0 },
    config: { extra: { level: 0, level_max: 5, money: 15 } },
    weight: 5,
    loc_vars(self, info_queue, center) {
      info_queue.push(P_CENTERS.m_poke_flower);
      const ex = (center && center.ability && center.ability.extra && typeof center.ability.extra === 'object') ? center.ability.extra : self.config.extra;
      const growth = G.GAME ? (G.GAME.poke_growth_level || 0) : 0;
      return { vars: [ex.level_max, Math.max(0, ex.level_max - ex.level), ex.money, 1 + growth, growth > 0 ? localize('k_poke_times') : localize('k_poke_time')] };
    },
    calculate(self, card, context) {
      if (context.main_scoring && context.cardarea === G.play && card.ability && card.ability.extra && typeof card.ability.extra === 'object') {
        card.ability.extra.level = card.ability.extra.level + 1 + (G.GAME.poke_growth_level || 0);
        const level = card.ability.extra.level, level_max = card.ability.extra.level_max;
        if (level > 0) {
          if (level >= level_max) {
            return {
              extra: { message: localize('k_upgrade_ex'), sound: 'poke_seed_' + Math.min(level_max, level) },
              func() {
                const blooming = card.config.center.key === 'm_poke_seed';
                ease_dollars(card.ability.extra.money);
                card.set_ability(P_CENTERS.m_poke_flower, null, true);
                if (blooming) seed_bloomed(card); // (house: the Cherubi line's evolution count)
              },
            };
          }
          return { extra: { message: localize('k_upgrade_ex'), sound: 'poke_seed_' + level } };
        }
      }
      return undefined;
    },
    /** set_sprites: the cell of the growth stage (Lua: x = min(5, level) + 1). */
    get_pos(self, card) {
      const ex = card && card.ability && card.ability.extra;
      if (ex && typeof ex === 'object' && typeof ex.level === 'number') return { x: Math.min(5, ex.level) + 1, y: 0 };
      return self.pos;
    },
  },
  flower: {
    config: { Xmult_flower: 2 }, // (3.9.1; 3.2.1: extra.Xmult 3)
    loc_vars(self, info_queue, center) {
      return { vars: [(center && center.ability && center.ability.Xmult_flower !== undefined) ? center.ability.Xmult_flower : self.config.Xmult_flower] };
    },
    in_pool() { return false; },
    calculate(self, card, context) {
      if (context.main_scoring && context.cardarea === G.play) {
        // With Roserade (a new 3.9.1 joker, new-jokers sub-batch 14) 3 suits are enough. (House: the owner's Cherrim also asks
        // 3, and gives X2.5 instead of X2 while sunny: flower_rule.)
        const rule = flower_rule(card, self);
        if (poke_suit_check(context.scoring_hand, rule.suits)) {
          let extra = 0;
          if (any(find_card('j_poke_shaymin')) || any(find_card('j_poke_shaymin_sky'))) extra = 1;
          return { x_mult: rule.x + extra };
        }
      }
      return undefined;
    },
  },
  // Ludicolo (3.9.1 April Fools; art: the Miror Budicolo animation's first frame, miror_budicolo.png). data.js has no such
  // enhancement: its static data in full. (Its music track — the Miror B. theme while one is held — is not ported.)
  ludicolo: {
    key: 'ludicolo',
    atlas: 'miror_budicolo',
    pos: { x: 0, y: 0 },
    config: {},
    no_rank: true,
    no_suit: true,
    replace_base_card: true,
    always_scores: true,
    weight: 0,
    loc_vars() { return { vars: [] }; },
    calculate(self, card, context) {
      if (context.main_scoring && context.cardarea === G.play) return { message: localize('poke_ludicolo_ex'), sound: 'poke_ludicolo_cry' };
      return undefined;
    },
    in_pool() { return false; },
  },
}, FILE);
