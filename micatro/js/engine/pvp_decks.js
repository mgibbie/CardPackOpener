// Micatro Multiplayer stage 7c — the Balatro Multiplayer mod's DECKS and STAKES (re-implemented from their behaviour:
// Desktop/BalatroMultiplayer_ref/ANALYSIS.md Part B §3b Decks / Stakes), as the internal 'pvp_decks' mod. Multiplayer only:
// a lobby picks one with its "Multiplayer deck" / "Multiplayer stake" options, and the mod is active only in a match that
// plays one (engine/pvp.js pvpMods), so every other match — and every solo run — is exactly as before. Art: OUR OWN
// (tools/micatro/gen_mp_art.py -> micatro/assets/textures/pvp/MPDecks.png, MPStakes.png).
//
//   Violet     +1 Voucher slot in the shop; Vouchers 50% off in ante 1, 30% off in ante 2
//   Indigo     choose +1 card from every Booster Pack; packs can't be skipped while a card in them can be taken; no Red Card
//   Orange     starts with 2 The Hanged Man, and opens a free Mega Standard Pack before the first blind
//   Oracle     starts with Clearance Sale + Medium; money is capped at $50 + the interest cap ($75 at first)
//   Gradient   cards also count as one rank higher or lower for Joker effects (Aces and 10s count as face cards too)
//   Heidelberg leaving a shop with a consumable: a random one is copied, Negative
//   Echo       every scoring card is retriggered once (held cards with an effect too); Blinds X1.2, +X0.2 after each Boss
//   Cocktail   copies the effects of 3 other decks, picked from the seed
// Stakes (above Gold, the mod's three; their own rules, not the vanilla stake ladder):
//   Planet     no Small Blind reward, blind scaling 3, Eternal + Perishable jokers in the shop (no -1 discard, no Rentals)
//   Spectral   Planet + Rental jokers, blind scaling 4
//   Spectral+  Spectral + blind scaling 5   (scaling 4 / 5: Steamodded's get_blind_amount, as the mod's game uses)
import {
  G, P_CENTERS, localize, emit, pseudoseed, pseudoshuffle, pseudorandom_element, copy_card, card_eval_status_text,
} from './core.js';
import { registerMod } from '../mods/registry.js';
import { Tag, add_tag } from './tag.js';

export const DECKS_ID = 'pvp_decks';
export const MP_BACKS = ['b_mp_violet', 'b_mp_indigo', 'b_mp_orange', 'b_mp_oracle', 'b_mp_gradient', 'b_mp_heidelberg', 'b_mp_echodeck', 'b_mp_cocktail'];
export const MP_STAKES = ['stake_mp_planet', 'stake_mp_spectral', 'stake_mp_spectralplus'];
/** Does this run play deck `k` (itself, or as one of a Cocktail's three)? */
export const deckIs = (k) => !!(G.GAME && (G.GAME.selected_back_key === k || (G.GAME.cocktail || []).includes(k)));

const D = (key, name, pos, config, beh, text) => ({ key, set: 'Back', name, pos, atlas: 'mtpvp_decks', config, order: 100 + pos.x + pos.y * 4, ...beh, _text: text });
const BACKS = [
  D('b_mp_violet', 'Violet Deck', { x: 0, y: 0 }, {}, {
    apply() { G.GAME.modifiers.extra_vouchers = (G.GAME.modifiers.extra_vouchers || 0) + 1; G.GAME.modifiers.mp_violet = true; },
  }, ['{C:attention}+1{} Voucher slot', 'in the shop', 'Vouchers {C:money}50%{} off in ante {C:attention}1{}', 'and {C:money}30%{} off in ante {C:attention}2{}']),
  D('b_mp_indigo', 'Indigo Deck', { x: 1, y: 0 }, {}, {
    apply() { G.GAME.modifiers.mp_indigo = true; G.GAME.banned_keys.j_red_card = true; },
  }, ['Choose {C:attention}+1{} card from', 'every {C:attention}Booster Pack', 'Packs can\'t be skipped', 'while a card can be taken']),
  D('b_mp_orange', 'Orange Deck', { x: 2, y: 0 }, { consumables: ['c_hanged_man', 'c_hanged_man'] }, {
    apply() { G.GAME.modifiers.mp_orange = true; },
  }, ['Start with {C:attention}2{} copies of', '{C:tarot,T:c_hanged_man}The Hanged Man', 'and a free {C:attention}Mega', '{C:attention}Standard Pack']),
  D('b_mp_oracle', 'Oracle Deck', { x: 3, y: 0 }, { vouchers: ['v_clearance_sale'], consumables: ['c_medium'] }, {
    apply() { G.GAME.modifiers.mp_oracle = 50; },
  }, ['Start with {C:attention,T:v_clearance_sale}Clearance Sale', 'and {C:spectral,T:c_medium}Medium', 'Money is capped at', '{C:money}$50{} + your interest cap']),
  D('b_mp_gradient', 'Gradient Deck', { x: 0, y: 1 }, {}, {
    apply() { G.GAME.modifiers.mp_gradient = true; },
  }, ['Cards are also considered', 'one rank {C:attention}higher{} or {C:attention}lower', 'for all Joker effects']),
  D('b_mp_heidelberg', 'Heidelberg Deck', { x: 1, y: 1 }, {}, {
    apply() { G.GAME.modifiers.mp_heidelberg = true; },
  }, ['When you leave the shop,', 'create a {C:dark_edition}Negative{} copy of', 'a random {C:attention}consumable', 'you hold']),
  D('b_mp_echodeck', 'Echo Deck', { x: 2, y: 1 }, {}, {
    apply() { G.GAME.starting_params.ante_scaling = (G.GAME.starting_params.ante_scaling || 1) * 1.2; G.GAME.modifiers.mp_echo = true; },
  }, ['{C:attention}Retrigger{} every', 'scoring card once', 'Blinds are {X:mult,C:white}X1.2{} bigger,', '{X:mult,C:white}+0.2{} after each {C:attention}Boss']),
  D('b_mp_cocktail', 'Cocktail Deck', { x: 3, y: 1 }, {}, {
    apply(center, back) { applyCocktail(back); },
  }, ['Copies the effects of', '{C:attention}3{} other decks', 'at random']),
];

// ---- Cocktail: 3 other decks from the seed (the vanilla decks and the other Multiplayer decks), their configs + effects
export function cocktailPool() {
  return Object.values(P_CENTERS).filter((c) => c.set === 'Back' && c.key !== 'b_challenge' && c.key !== 'b_mp_cocktail' && (!c.mod || c.mod === DECKS_ID)).sort((a, b) => (a.mod ? 1 : 0) - (b.mod ? 1 : 0) || a.order - b.order).map((c) => c.key);
}
function applyCocktail(back) {
  const pool = cocktailPool();
  pseudoshuffle(pool, pseudoseed('mp_cocktail'));
  const picks = pool.slice(0, 3);
  G.GAME.cocktail = picks;
  emit('cocktail', { decks: picks });
  // each sub-deck applies as it would on its own (its config: vouchers, consumables, hands, dollars...; then its own rules)
  const Back = back.constructor;
  for (const k of picks) {
    const sub = new Back(P_CENTERS[k]);
    sub.apply_to_run();
  }
}

// ---- stakes
const S = (key, name, pos, level, modifiers, text, colour, shiny) => ({ key, name, pos, atlas: 'mtpvp_stakes', applied_stakes: [], stake_level: 1, sticker_level: level, mp_level: level, colour, shiny, modifiers, _text: text });
const planetRules = () => {
  G.GAME.modifiers.no_blind_reward = G.GAME.modifiers.no_blind_reward || {};
  G.GAME.modifiers.no_blind_reward.Small = true;
  G.GAME.modifiers.scaling = 3;
  G.GAME.modifiers.enable_eternals_in_shop = true;
  G.GAME.modifiers.enable_perishables_in_shop = true;
};
const STAKES = [
  S('stake_mp_planet', 'Planet Stake', { x: 0, y: 0 }, 9, () => { planetRules(); G.GAME.stake = 9; },
    ['No reward money for the {C:attention}Small Blind', 'Required score scales faster', 'Shop can have {C:attention}Eternal{} and', '{C:attention}Perishable{} Jokers', '{C:inactive}(no -1 Discard, no Rentals)'], '#5fb8c8'),
  S('stake_mp_spectral', 'Spectral Stake', { x: 1, y: 0 }, 10, () => { planetRules(); G.GAME.modifiers.enable_rentals_in_shop = true; G.GAME.modifiers.scaling = 4; G.GAME.stake = 10; },
    ['Planet Stake, plus', 'Shop can have {C:attention}Rental{} Jokers', 'Required score scales', 'even faster'], '#3a3f5a'),
  S('stake_mp_spectralplus', 'Spectral+ Stake', { x: 2, y: 0 }, 11, () => { planetRules(); G.GAME.modifiers.enable_rentals_in_shop = true; G.GAME.modifiers.scaling = 5; G.GAME.stake = 11; },
    ['Spectral Stake, plus', 'Required score scales', 'faster still'], '#2b2550', true),
];

// ---- Gradient: a Joker's view of a card one rank up / down
const NO_GRADIENT = ['Photograph', 'Faceless Joker', 'Ramen'];
function withOffset(cards, off, fn) {
  const saved = cards.map((c) => c.base.id);
  for (const c of cards) { let id = c.base.id + off; if (id > 14) id = 2; if (id < 2) id = 14; c.base.id = id; }
  try { return fn(); } finally { cards.forEach((c, i) => { c.base.id = saved[i]; }); }
}
let inGradient = false;

const LOC = { Back: {}, Stake: {} };
for (const b of BACKS) { LOC.Back[b.key] = { name: b.name, text: b._text }; delete b._text; }
for (const s of STAKES) { LOC.Stake[s.key] = { name: s.name, text: s._text }; delete s._text; }

registerMod({
  id: DECKS_ID,
  name: 'Multiplayer: Decks & Stakes',
  hidden: true,
  content: {
    atlases: {
      mtpvp_decks: { src: '/micatro/assets/textures/pvp/MPDecks.png', px: 71, py: 95 },
      mtpvp_stakes: { src: '/micatro/assets/textures/pvp/MPStakes.png', px: 29, py: 29 },
    },
    centers: BACKS,
    stakes: STAKES,
    loc: { descriptions: LOC },
  },
  hooks: {
    start_run() {
      // Orange: a free Mega Standard Pack before the first blind (opened like a Tag's pack)
      // (a Standard Tag: its free Mega Standard Pack opens at the first blind choice)
      if (deckIs('b_mp_orange')) add_tag(new Tag('tag_standard'));
    },
    // Violet: Vouchers 50% off in ante 1, 30% off in ante 2
    set_cost(card) {
      if (!deckIs('b_mp_violet') || card.ability.set !== 'Voucher') return;
      const a = G.GAME.round_resets.ante, f = a === 1 ? 0.5 : a === 2 ? 0.7 : 1;
      if (f < 1) card.cost = Math.max(1, Math.floor(f * (card.base_cost + (card.extra_cost || 0) + 0.5) * (100 - (G.GAME.discount_percent || 0)) / 100));
    },
    // Indigo: +1 pick per pack; no skipping while a card can be taken
    pack_choices(n) { return deckIs('b_mp_indigo') ? n + 1 : n; },
    can_skip_booster() {
      if (!deckIs('b_mp_indigo') || !G.pack_cards) return undefined;
      const usable = G.pack_cards.cards.some((c) => (c.ability.set === 'Joker' ? G.jokers.cards.length < G.jokers.config.card_limit : (c.ability.consumeable ? c.can_use_consumeable(true, true) : true)));
      return usable ? false : undefined;
    },
    // Oracle: money capped at $50 + the interest cap
    ease_dollars(mod) {
      if (!deckIs('b_mp_oracle')) return mod;
      const cap = 50 + (G.GAME.interest_cap || 25);
      return Math.min(cap - G.GAME.dollars, mod);
    },
    // Heidelberg: leaving the shop with a consumable -> a Negative copy of a random one
    shop_end() {
      if (!deckIs('b_mp_heidelberg') || !G.consumeables.cards.length) return;
      const [c] = pseudorandom_element(G.consumeables.cards, pseudoseed('mp_heidelberg'));
      const copy = copy_card(c);
      copy.set_edition({ negative: true }, true);
      copy.add_to_deck();
      G.consumeables.emplace(copy);
      card_eval_status_text(copy, 'extra', null, null, null, { message: 'Duplicated!' });
    },
    // Echo: every scoring card once more (held cards: only those with an effect — the engine asks per card)
    deck_repetitions(card, reps) {
      if (!deckIs('b_mp_echodeck')) return;
      reps.push({ seals: { repetitions: 1, message: localize('k_again_ex'), card } });
    },
    // Echo: X0.2 more after each Boss
    end_round() {
      if (deckIs('b_mp_echodeck') && G.GAME.blind && G.GAME.blind.boss) G.GAME.starting_params.ante_scaling += 0.2;
    },
    // Gradient: a joker reading a card tries it one rank up, as is, then one rank down (the first effect wins)
    calculate_joker(card, ctx) {
      if (!deckIs('b_mp_gradient') || inGradient || !ctx || !ctx.other_card || ctx.blueprint || card.ability.set !== 'Joker' || NO_GRADIENT.includes(card.ability.name)) return undefined;
      const cards = [...(G.playing_cards || [])];
      inGradient = true;
      try {
        for (const off of [1, 0, -1]) {
          const r = off === 0 ? card.calculate_joker(ctx) : withOffset(cards, off, () => card.calculate_joker(ctx));
          if (r) return r;
        }
      } finally { inGradient = false; }
      return null;
    },
    is_face(card) { return deckIs('b_mp_gradient') && !inGradient && (card.base.id === 10 || card.base.id === 14) ? true : undefined; },
  },
});
