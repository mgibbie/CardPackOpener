/**
 * Sylvie's Silliness 0.11 (NewtTheFish; Steamodded 0.9.x old API, with its own SMODS.Booster),
 * rebuilt natively for Micatro from the clean copy (Projects/Programming/Micatro/Micatro/
 * SylvieSilly0dot11/SylvieSilly.lua — the `mods off` copy has a syntax error). Numbers, rules and
 * text are the mod's; keys are prefixed `sylvie` (the moons already were: c_sylvie_europa).
 *
 *   4 decks    Lemon-Lime, Aurora, Sulfur, Hallowed (Deck OS is commented out in the mod: skipped)
 *   6 blinds   The Prospector, The Gambler, The Pathway, The Backside, The Heatwave, The Frost
 *   8 boosters Suits (x2 art), Jumbo / Mega Suits, Bonus, Jumbo Bonus, Fortune, Jumbo Fortune —
 *              themed packs mixing vanilla Tarots/Planets/Spectrals/Jokers (or Enhanced cards)
 *              with this mod's moons and Bloom (create_pack_card / get_pack_pool)
 *   8 moons    Planet cards: Europa / Io / Callisto / Ganymede (+5 Chips on every card of a suit),
 *              Charon / Hydra / Titan / Euceladus (Bonus / Mult / Stone / Gold cards, now and later)
 *   1 spectral Bloom (a Speed, Investment or Economy Tag)
 *   2 vouchers Stamper, Seal the Deal (Seals on Standard Pack cards)
 *
 * The Lua wraps become hooks / seams: Blind.debuff_card / stay_flipped / disable -> the mod-blind
 * hooks (engine/blind.js); Card.set_edition (Aurora) -> edition_nil; create_card (Stamper /
 * Seal the Deal) -> create_card; Back.apply_to_run -> each deck's apply; Card:open for the themed
 * packs -> the booster's create_card (MOD_PACK_HAND: the hand is drawn, like the Lua's
 * TAROT_PACK); the moons' edits of G.P_CENTER_POOLS.Enhanced[...].config (reset in
 * Game:start_run) -> a per-run G.GAME.sylvie_enh read through the four enhancements' config.
 * The Codex Arcanum / TheAutumnCircus pack-pool additions are kept: they join only when a mod
 * providing those keys is on.
 *
 * INTENDED-DESIGN FIXES (each tested in micatro/tests/mods/sylviesilly_test.mjs):
 *  1. Sulfur Deck's "Jokers appear less often" did nothing: its joker_rate = 4 was read by
 *     neither the base game nor the mod's apply_to_run wrap. The shop's joker rate is 4 (from 20).
 *  2. Charon and Titan ("Affects Current and Future cards") never reached CURRENT Bonus / Stone
 *     cards: set_ability subtracts the OLD center's bonus — the same, already-raised table — so
 *     the card kept its old chips (and a card later re-enhanced away went negative). Current
 *     cards gain the bonus too (also shop / pack cards, so every card's bookkeeping stays right).
 *  3. The moon upgrades lived in the global G.P_CENTERS tables, reset only by Game:start_run — a
 *     continued (saved) run silently lost them for future cards. They are per-run state
 *     (G.GAME.sylvie_enh), saved with the run, and never leak into another run.
 *  4. Europa / Io / Callisto / Ganymede skipped debuffed cards of their suit (is_suit without
 *     bypass_debuff — e.g. Io during The Club upgraded no Clubs): every card of the suit counts.
 *  5. Aurora Deck only gave unenhanced playing cards ('Default') an edition; Enhanced cards from
 *     the same Standard pack never did. "Playing Cards are usually Special": both do.
 *  6. Bloom picked its tag with an unseeded pseudorandom_element (math.random): seeded ('bloom'),
 *     so runs replay.
 *  7. Hallowed Deck's "Playing Cards now appear in the shop" rate (10) was overwritten by its own
 *     Magic Trick voucher, whose apply_to_run sets the rate (4) in a QUEUED event that runs after
 *     the deck's wrap: the shop's playing-card rate is 10, as the deck sets it.
 */
import { registerMod, isActive, reduceHook } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CARDS_LIST, Card, emit, attention_text, play_sound, pseudorandom, pseudoseed, pseudorandom_element,
  poll_edition, create_card, find_joker, all_cards,
} from '../../js/engine/core.js';
import { centerActive } from '../../js/mods/registry.js';
import { Tag, add_tag } from '../../js/engine/tag.js';

const MOD_ID = 'sylviesilly';
const ART = '/micatro/mods/sylviesilly/assets/2x/';
const on = () => isActive(MOD_ID);

const atlases = {
  sylvie_backs: { src: ART + 'sylvie_backs.png', px: 71, py: 95 },
  sylvie_moons: { src: ART + 'sylvie_moons.png', px: 71, py: 95 },
  sylvie_vouchers: { src: ART + 'sylvie_vouchers.png', px: 71, py: 95 },
  sylvie_blinds: { src: ART + 'sylvie_blinds.png', px: 34, py: 34, frames: 21 },
  sylvie_spectrals: { src: ART + 'sylvie_spectrals.png', px: 71, py: 95 },
  sylvie_boosters: { src: ART + 'sylvie_boosters.png', px: 71, py: 95 },
};
const centers = [];

// ------------------------------------------------------------------ moons: per-run enhancement upgrades
// Game:start_run's RESET values (Bonus 30, Mult 4, Stone 50, Gold 3) are the base game's own.
const ENH = { m_bonus: ['bonus', 'bonus'], m_mult: ['mult', 'mult'], m_stone: ['bonus', 'stone'], m_gold: ['h_dollars', 'gold'] };
/** This run's moon upgrades ({bonus, mult, stone, gold}), or null when the mod is off. */
export function sylvie_enh() { return on() && G.GAME ? G.GAME.sylvie_enh || null : null; }
for (const [key, [field, slot]] of Object.entries(ENH)) {
  const cfg = P_CENTERS[key].config;
  let base = cfg[field];
  Object.defineProperty(cfg, field, {
    enumerable: true, configurable: true,
    get() { const e = sylvie_enh(); return base + (e ? e[slot] : 0); },
    set(v) { const e = sylvie_enh(); base = v - (e ? e[slot] : 0); },
  });
}
/** Raise one enhancement for the rest of the run; current cards follow (fix 2). */
function upgrade_enhancement(key, amount) {
  const [field, slot] = ENH[key];
  G.GAME.sylvie_enh = G.GAME.sylvie_enh || { bonus: 0, mult: 0, stone: 0, gold: 0 };
  G.GAME.sylvie_enh[slot] += amount;
  const seen = new Set();
  for (const v of [...G.playing_cards, ...all_cards()]) {
    if (seen.has(v) || v.config.center !== P_CENTERS[key]) continue;
    seen.add(v);
    if (field === 'bonus') v.ability.bonus = (v.ability.bonus || 0) + amount; // set_ability's own bookkeeping
    else v.ability[field] = P_CENTERS[key].config[field];
  }
}
function moon_text(used, text, colour) {
  G.E_MANAGER.add_event(() => {
    play_sound('timpani');
    used.juice_up();
    emit('moon', { card: used.sort_id, text, colour });
    attention_text(text);
  });
}
const SUIT_MOONS = [
  ['europa', 'Europa', 'Spades', 'Spade', 0],
  ['io', 'Io', 'Clubs', 'Club', 1],
  ['callisto', 'Callisto', 'Hearts', 'Heart', 2],
  ['ganymede', 'Ganymede', 'Diamonds', 'Diamond', 3],
];
const chipboost = 5, bonusboost = 10, multboost = 2;
const moon_badges = (self, card, badges) => { badges[0] = { key: 'moon', label: 'Moon', colour: 'Planet' }; };
const MOON_BASE = { set: 'Planet', consumeable: true, cost: 3, atlas: 'sylvie_moons', set_badges: moon_badges, can_use: () => true };
for (const [slug, name, suit, , x] of SUIT_MOONS) {
  centers.push({
    ...MOON_BASE, key: 'c_sylvie_' + slug, name, effect: 'Upgrade ' + suit, config: { chips: chipboost }, pos: { x, y: 0 },
    loc_vars: (self) => ({ vars: [self.config.chips] }),
    use(self, card, area, copier) {
      const used = copier || card;
      for (const v of G.playing_cards) {
        if (v.is_suit(suit, true)) { // fix 4: debuffed cards of the suit count
          v.ability.perma_bonus = v.ability.perma_bonus || 0;
          v.ability.perma_bonus = v.ability.perma_bonus + chipboost;
        }
      }
      moon_text(used, suit + ' Up!', suit);
    },
  });
}
for (const [slug, name, key, cfgKey, amt, pos, text, colour, effect] of [
  ['charon', 'Charon', 'm_bonus', 'chips', bonusboost, { x: 0, y: 1 }, 'Bonus Up!', 'CHIPS', 'Upgrade Bonus Cards'],
  ['hydra', 'Hydra', 'm_mult', 'mult', multboost, { x: 1, y: 1 }, 'Mult Up!', 'MULT', 'Upgrade Mult Cards'],
  ['titan', 'Titan', 'm_stone', 'chips', 10, { x: 0, y: 2 }, 'Stone Up!', 'CHIPS', 'Upgrade Stone Cards'],
  ['euceladus', 'Euceladus', 'm_gold', 'gold', 1, { x: 1, y: 2 }, 'Gold Up!', 'MONEY', 'Upgrade Gold Cards'],
]) {
  centers.push({
    ...MOON_BASE, key: 'c_sylvie_' + slug, name, effect, config: { [cfgKey]: amt }, pos,
    loc_vars(self, iq) { iq.push({ key, set: 'Enhanced' }); return { vars: [self.config[cfgKey]] }; },
    use(self, card, area, copier) {
      upgrade_enhancement(key, amt);
      moon_text(copier || card, text, colour);
    },
  });
}

// ------------------------------------------------------------------ Bloom
centers.push({
  key: 'c_sylvie_bloom', set: 'Spectral', name: 'Bloom', consumeable: true, cost: 4, config: {}, pos: { x: 0, y: 0 }, atlas: 'sylvie_spectrals',
  can_use: () => true,
  use() {
    G.E_MANAGER.add_event(() => {
      const [bloom_tag_name] = pseudorandom_element(['tag_economy', 'tag_skip', 'tag_investment'], pseudoseed('bloom')); // fix 6
      add_tag(new Tag(bloom_tag_name));
    });
  },
});

// ------------------------------------------------------------------ themed packs
const PACK_POOLS = {
  Suits: {
    TarotPlanet: ['c_moon', 'c_sun', 'c_world', 'c_star', 'c_lovers', 'c_jupiter', 'c_sylvie_europa', 'c_sylvie_io', 'c_sylvie_callisto', 'c_sylvie_ganymede'],
    Joker: ['j_greedy_joker', 'j_lusty_joker', 'j_wrathful_joker', 'j_gluttenous_joker', 'j_droll', 'j_crafty', 'j_smeared', 'j_flower_pot', 'j_rough_gem', 'j_bloodstone', 'j_arrowhead', 'j_onyx_agate', 'j_tribe', 'j_seeing_double', 'j_castle', 'j_ancient', 'j_blackboard'],
    Spectral: ['c_sigil'],
  },
  Bonus: {
    TarotPlanet: ['c_magician', 'c_high_priestess', 'c_heirophant', 'c_lovers', 'c_chariot', 'c_justice', 'c_death', 'c_tower', 'c_devil', 'c_sylvie_charon', 'c_sylvie_hydra', 'c_sylvie_titan'],
    Spectral: ['c_familiar', 'c_grim', 'c_incantation', 'c_cryptid', 'c_talisman', 'c_deja_vu'],
  },
  Fortune: {
    TarotPlanet: ['c_fool', 'c_wheel_of_fortune', 'c_hermit', 'c_temperance', 'c_judgement', 'c_magician', 'c_lovers', 'c_sylvie_euceladus'],
    Joker: ['j_loyalty_card', 'j_8_ball', 'j_misprint', 'j_space', 'j_business', 'j_faceless', 'j_egg', 'j_cloud_9', 'j_hallucination', 'j_golden', 'j_midas_mask', 'j_reserved_parking', 'j_lucky_cat', 'j_trading', 'j_bloodstone', 'j_oops', 'j_idol'],
    Spectral: ['c_immolate', 'c_aura', 'c_trance', 'c_medium', 'c_sylvie_bloom'],
  },
};
/** SMODS.INIT.SylvieSilly: other mods' cards join the pools when those mods are installed (here: on). */
const CROSS_MOD = {
  Fortune: ['c_alchemy_sulfur', 'c_alchemy_antimony', 'c_alchemy_arsenic', 'c_Thac_happy_squirrel', 'c_Thac_void'],
  Bonus: ['c_alchemy_cobalt', 'c_alchemy_bismuth', 'c_Thac_universe', 'c_Thac_artist', 'c_Thac_joker'],
};
export function get_pack_pool(_pack, _type) {
  let _starting_pool = PACK_POOLS[_pack][_type];
  if (_type === 'TarotPlanet' && CROSS_MOD[_pack]) {
    _starting_pool = _starting_pool.concat(CROSS_MOD[_pack].filter((k) => P_CENTERS[k] && P_CENTERS[k].mod && centerActive(P_CENTERS[k])));
  }
  let _pool = [];
  for (const v of _starting_pool) if (!G.GAME.used_jokers[v]) _pool.push(v);
  if (_pool.length === 0) {
    _pool = [];
    if (_type === 'Tarot' || _type === 'Tarot_Planet') _pool.push('c_fool');
    else if (_type === 'Planet') _pool.push('c_pluto');
    else if (_type === 'Spectral') _pool.push('c_incantation');
    else if (_type === 'Joker') _pool.push('j_joker');
    else _pool.push('j_joker');
  }
  return [_pool, '' + G.GAME.round_resets.ante];
}
export function create_pack_card(_pack, _type, area, legendary, _rarity, skip_materialize, soulable, forced_key, key_append) {
  area = area || G.jokers;
  let center;
  if (!forced_key && soulable && !G.GAME.banned_keys.c_soul) {
    if ((_type === 'Tarot' || _type === 'Spectral' || _type === 'Tarot_Planet') && !(G.GAME.used_jokers.c_soul && !find_joker('Showman').length)) {
      if (pseudorandom('soul_' + _type + G.GAME.round_resets.ante) > 0.997) forced_key = 'c_soul';
    }
    if ((_type === 'Planet' || _type === 'Spectral') && !(G.GAME.used_jokers.c_black_hole && !find_joker('Showman').length)) {
      if (pseudorandom('soul_' + _type + G.GAME.round_resets.ante) > 0.997) forced_key = 'c_black_hole';
    }
  }
  if (_type === 'Base') forced_key = 'c_base';
  if (forced_key && !G.GAME.banned_keys[forced_key]) {
    center = P_CENTERS[forced_key];
    _type = center.set !== 'Default' ? center.set : _type;
  } else {
    const [_pool, _pool_key] = get_pack_pool(_pack, _type);
    let [c] = pseudorandom_element(_pool, pseudoseed(_pool_key));
    let it = 1;
    while (c === 'UNAVAILABLE') { it++; [c] = pseudorandom_element(_pool, pseudoseed(_pool_key + '_resample' + it)); }
    center = P_CENTERS[c];
  }
  const front = (_type === 'Base' || _type === 'Enhanced') ? pseudorandom_element(P_CARDS_LIST(), pseudoseed('front' + (key_append || '') + G.GAME.round_resets.ante))[0] : undefined;
  const card = new Card(front, center, { discover: area === G.jokers || area === G.consumeables });
  if (_type === 'Joker') {
    if (G.GAME.modifiers.all_eternal) card.set_eternal(true);
    const edition = poll_edition('edi' + (key_append || '') + G.GAME.round_resets.ante);
    card.set_edition(edition);
  }
  return card;
}
/** The themed packs' Card:open loop body (one card). */
function themed_pack_card(name, booster) {
  let card;
  if (pseudorandom('fortune-pack-tarot') < 0.75) {
    if (pseudorandom('fortune-pack-spectral') < 0.95) card = create_pack_card(name, 'TarotPlanet', G.pack_cards, null, null, true, true, null, 'fort');
    else card = create_pack_card(name, 'Spectral', G.pack_cards, null, null, true, true, null, 'fort');
  } else if (name === 'Fortune' || name === 'Suits') {
    card = create_pack_card(name, 'Joker', G.pack_cards, null, null, true, true, null, 'fort');
  } else {
    card = create_card('Enhanced', G.pack_cards, null, null, null, true, null, 'sta');
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
  }
  return card;
}
const PACKS = [
  ['suit_normal_1', 'Suits Pack', 'Suits', { extra: 3, choose: 1 }, { x: 0, y: 0 }, 5, 1],
  ['suit_normal_2', 'Suits Pack', 'Suits', { extra: 3, choose: 1 }, { x: 1, y: 0 }, 5, 1],
  ['suit_jumbo', 'Jumbo Suits Pack', 'Suits', { extra: 5, choose: 1 }, { x: 2, y: 0 }, 7, 0.75],
  ['suit_mega', 'Mega Suits Pack', 'Suits', { extra: 5, choose: 2 }, { x: 3, y: 0 }, 9, 0.25],
  ['bonus_normal', 'Bonus Pack', 'Bonus', { extra: 3, choose: 1 }, { x: 0, y: 1 }, 5, 1],
  ['bonus_jumbo', 'Jumbo Bonus Pack', 'Bonus', { extra: 5, choose: 1 }, { x: 1, y: 1 }, 7, 0.75],
  ['fortune_normal', 'Fortune Pack', 'Fortune', { extra: 3, choose: 1 }, { x: 2, y: 1 }, 5, 1],
  ['fortune_jumbo', 'Jumbo Fortune Pack', 'Fortune', { extra: 5, choose: 1 }, { x: 3, y: 1 }, 7, 0.75],
];
for (const [slug, name, theme, config, pos, cost, weight] of PACKS) {
  centers.push({
    key: 'p_sylvie_' + slug, set: 'Booster', name, kind: 'Arcana', draw_hand: true, theme, config, pos, cost, weight, atlas: 'sylvie_boosters',
    loc_vars: (self) => ({ vars: reduceHook('booster_loc_vars', [self.config.choose, self.config.extra], self) }),
    create_card: (self, booster) => themed_pack_card(theme, booster),
  });
}

// ------------------------------------------------------------------ vouchers
centers.push(
  { key: 'v_sylvie_stamper', set: 'Voucher', name: 'Stamper', config: {}, pos: { x: 0, y: 0 }, cost: 10, available: true, atlas: 'sylvie_vouchers' },
  { key: 'v_sylvie_seal_deal', set: 'Voucher', name: 'SealDeal', config: {}, pos: { x: 1, y: 0 }, cost: 10, available: true, requires: ['v_sylvie_stamper'], atlas: 'sylvie_vouchers' },
);

// ------------------------------------------------------------------ decks
const LLD_SUIT = { Ace: 'Spades', 10: 'Spades', 6: 'Spades', King: 'Hearts', 9: 'Hearts', 5: 'Hearts', Queen: 'Clubs', 8: 'Clubs', 4: 'Clubs', Jack: 'Diamonds', 7: 'Diamonds', 3: 'Diamonds' };
centers.push(
  {
    key: 'b_sylvie_lemonlime', set: 'Back', name: 'Lemon-Lime Deck', config: { lldmodifier: true, discards: -1 }, pos: { x: 0, y: 5 }, atlas: 'sylvie_backs',
    apply() {
      G.E_MANAGER.add_event(() => {
        let seal_counter = 1;
        for (const v of G.playing_cards) {
          const s = LLD_SUIT[v.base.value];
          if (s) v.change_suit(s);
          else if (v.base.value === '2') {
            v.set_ability(P_CENTERS.m_wild);
            v.set_seal(seal_counter === 1 ? 'Red' : seal_counter === 2 ? 'Blue' : seal_counter === 3 ? 'Gold' : 'Purple', true, true);
            seal_counter = seal_counter + 1;
          }
        }
      });
    },
  },
  {
    key: 'b_sylvie_aurora', set: 'Back', name: 'Aurora Deck', config: { vouchers: ['v_hone', 'v_glow_up'], auroramodifier: true, consumables: ['c_aura'], joker_slot: -1, hands: -1 }, pos: { x: 2, y: 5 }, atlas: 'sylvie_backs',
    apply(self) { G.GAME.starting_params.auroramodifier = self.config.auroramodifier; },
  },
  {
    key: 'b_sylvie_sulfur', set: 'Back', name: 'Sulfur Deck', config: { consumables: ['c_death'], joker_rate: 4, voucher: 'v_overstock_norm' }, pos: { x: 3, y: 5 }, atlas: 'sylvie_backs',
    apply(self) { G.GAME.joker_rate = self.config.joker_rate; }, // fix 1
  },
  {
    key: 'b_sylvie_hallowed', set: 'Back', name: 'Hallowed Deck', config: { tarot_rate: 0, planet_rate: 0, playing_card_rate: 10, voucher: 'v_magic_trick' }, pos: { x: 1, y: 5 }, atlas: 'sylvie_backs',
    apply(self) {
      G.GAME.tarot_rate = self.config.tarot_rate;
      G.GAME.planet_rate = self.config.planet_rate;
      // fix 7: after Magic Trick's own rate (queued by its apply_to_run), not before it
      G.E_MANAGER.add_event(() => { G.GAME.playing_card_rate = self.config.playing_card_rate; });
    },
  },
);

// ------------------------------------------------------------------ blinds
const ids = (card, list) => list.includes(card.get_id());
const flip_back_hand = () => {
  for (const c of G.hand.cards) if (c.facing === 'back') c.flip();
  for (const v of G.playing_cards) v.ability.wheel_flipped = undefined;
};
const BLIND = (slug, name, y, min, colour, extra) => ({ key: 'bl_sylvie_' + slug, name, dollars: 5, mult: 2, vars: [], debuff: {}, pos: { x: 0, y }, boss: { min, max: 10 }, boss_colour: colour, atlas: 'sylvie_blinds', ...extra });
const blinds = [
  BLIND('prospector', 'The Prospector', 0, 2, '#e57f8d', { debuff_card: (s, b, card) => ['Stone Card', 'Gold Card', 'Steel Card', 'Glass Card'].includes(card.ability.name) }),
  BLIND('gambler', 'The Gambler', 1, 2, '#62679a', { debuff_card: (s, b, card) => ['Mult', 'Bonus', 'Wild Card', 'Lucky Card'].includes(card.ability.name) }),
  BLIND('pathway', 'The Pathway', 2, 1, '#9a8a43', { debuff_card: (s, b, card) => ids(card, [6, 7, 8, 9, 10]) }),
  BLIND('backside', 'The Backside', 3, 1, '#88619a', { debuff_card: (s, b, card) => ids(card, [14, 2, 3, 4, 5]) }),
  BLIND('heatwave', 'The Heatwave', 4, 2, '#b72041', { stay_flipped: (s, b, area, card) => area === G.hand && ids(card, [2, 4, 6, 8, 10]), disable: flip_back_hand }),
  BLIND('frost', 'The Frost', 5, 2, '#5090b7', { stay_flipped: (s, b, area, card) => area === G.hand && ids(card, [14, 3, 5, 7, 9]), disable: flip_back_hand }),
];

// ------------------------------------------------------------------ hooks
const SEALS = ['Red', 'Purple', 'Gold', 'Blue'];
const hooks = {
  /** create_card wrap: Stamper / Seal the Deal seal Standard Pack cards. */
  create_card(card) {
    if (G.STATE !== G.STATES.STANDARD_PACK || !(card.ability.set === 'Default' || card.ability.set === 'Enhanced') || card.seal) return;
    const uv = G.GAME.used_vouchers;
    if (uv.v_sylvie_stamper && !uv.v_sylvie_seal_deal) {
      if (pseudorandom('stamper_odds') > 0.25) card.set_seal(pseudorandom_element(SEALS, pseudoseed('stamper'))[0]);
    } else if (uv.v_sylvie_seal_deal) {
      card.set_seal(pseudorandom_element(SEALS, pseudoseed('seal_deal'))[0]);
    }
  },
  /** Card.set_edition wrap: on the Aurora Deck a playing card given no edition rolls one (fix 5: Enhanced too). */
  edition_nil(card) {
    if (!G.GAME.starting_params.auroramodifier || !(card.ability.set === 'Default' || card.ability.set === 'Enhanced')) return;
    const r = pseudorandom(pseudoseed('random_edition'));
    if (r > 0.5) card.set_edition({ foil: true });
    else if (r > 0.1) card.set_edition({ holo: true });
    else card.set_edition({ polychrome: true });
  },
};

// ------------------------------------------------------------------ localization (the mod's loc_txt)
const pack_text = (what) => ['Choose {C:attention}#1#{} of up to', what];
const LOC = {
  descriptions: {
    Back: {
      b_sylvie_lemonlime: { name: 'Lemon-Lime Deck', text: ['Divides up the deck!', '{C:red}-1{} discard.', "The {C:attention}2's{} are extra tasty."] },
      b_sylvie_hallowed: { name: 'Hallowed Deck', text: ['{C:planet}Planets{} and {C:purple}Tarots{}', 'no longer appear, while', '{C:attention}Playing Cards{} now', 'appear in the shop.'] },
      b_sylvie_aurora: { name: 'Aurora Deck', text: ['Start with an {C:spectral,T:c_aura}Aura{} card.', '{C:attention}Jokers{} and {C:attention}Playing Cards{}', 'are {C:attention}usually{} {C:dark_edition}Special.', '{C:red}-1{} joker slot, {C:red}-1{} hand.'] },
      b_sylvie_sulfur: { name: 'Sulfur Deck', text: ['Start with a {C:tarot,T:c_death}Death{} card', 'and the {C:attention,T:v_overstock_norm}Overstock{} voucher.', '{C:attention}Jokers{} appear less often.'] },
    },
    Planet: {
      c_sylvie_europa: { name: 'Europa', text: ['{C:attention}Upgrade{} all', '{C:spades}Spade{} cards', 'in your deck', 'by {C:chips}+#1#{} Chips'] },
      c_sylvie_io: { name: 'Io', text: ['{C:attention}Upgrade{} all', '{C:clubs}Club{} cards', 'in your deck', 'by {C:chips}+#1#{} Chips'] },
      c_sylvie_callisto: { name: 'Callisto', text: ['{C:attention}Upgrade{} all', '{C:hearts}Heart{} cards', 'in your deck', 'by {C:chips}+#1#{} Chips'] },
      c_sylvie_ganymede: { name: 'Ganymede', text: ['{C:attention}Upgrade{} all', '{C:diamonds}Diamond{} cards', 'in your deck', 'by {C:chips}+#1#{} Chips'] },
      c_sylvie_charon: { name: 'Charon', text: ['{C:attention}Upgrade{} {C:chips}Bonus Cards{}', 'by {C:chips}+#1#{} chips', 'Affects {C:chips}Current{}', 'and {C:dark_edition}Future{} cards'] },
      c_sylvie_hydra: { name: 'Hydra', text: ['{C:attention}Upgrade{} {C:mult}Mult Cards{}', 'by {C:mult}+#1#{} mult', 'Affects {C:mult}Current{}', 'and {C:dark_edition}Future{} cards'] },
      c_sylvie_titan: { name: 'Titan', text: ['{C:attention}Upgrade{} {C:chips}Stone Cards{}', 'by {C:chips}+#1#{} chips', 'Affects {C:chips}Current{}', 'and {C:dark_edition}Future{} cards'] },
      c_sylvie_euceladus: { name: 'Euceladus', text: ['{C:attention}Upgrade{} {C:money}Gold Cards{}', 'by {C:money}+1{} dollars', 'Affects {C:money}Current{}', 'and {C:dark_edition}Future{} cards'] },
    },
    Spectral: {
      c_sylvie_bloom: { name: 'Bloom', text: ['Create an {C:money}Speed{},', '{C:money}Investment{}, or', '{C:money}Economy Tag'] },
    },
    Booster: {
      p_sylvie_suit_normal_1: { name: 'Suits Pack', text: pack_text('{C:attention}#2# Suit-Themed{} cards.') },
      p_sylvie_suit_normal_2: { name: 'Suits Pack', text: pack_text('{C:attention}#2# Suit-Themed{} cards.') },
      p_sylvie_suit_jumbo: { name: 'Jumbo Suits Pack', text: pack_text('{C:attention}#2# Suit-Themed{} cards.') },
      p_sylvie_suit_mega: { name: 'Mega Suits Pack', text: pack_text('{C:attention}#2# Suit-Themed{} cards.') },
      p_sylvie_bonus_normal: { name: 'Bonus Pack', text: pack_text('{C:attention}#2#{} {X:dark_edition,C:white}Bonus{} cards.') },
      p_sylvie_bonus_jumbo: { name: 'Jumbo Bonus Pack', text: pack_text('{C:attention}#2#{} {X:dark_edition,C:white}Bonus{} cards.') },
      p_sylvie_fortune_normal: { name: 'Fortune Pack', text: pack_text('{C:attention}#2#{} {C:money}Fortune{} cards.') },
      p_sylvie_fortune_jumbo: { name: 'Jumbo Fortune Pack', text: pack_text('{C:attention}#2#{} {C:money}Fortune{} cards.') },
    },
    Voucher: {
      v_sylvie_stamper: { name: 'Stamper', text: ['Increase chance to find', '{C:attention}Playing cards{} with {C:attention}Seals', 'in {C:attention}Standard Packs'] },
      v_sylvie_seal_deal: { name: 'Seal the Deal', text: ['{C:attention}Playing cards{} from', '{C:attention}Standard Packs{} always', 'have {C:attention}Seals'] },
    },
    Blind: {
      bl_sylvie_prospector: { name: 'The Prospector', text: ['All Stone, Steel, Gold, and', 'Glass cards are debuffed'] },
      bl_sylvie_gambler: { name: 'The Gambler', text: ['All Wild, Lucky, Mult, and', 'Bonus cards are debuffed'] },
      bl_sylvie_pathway: { name: 'The Pathway', text: ['All 6, 7, 8, 9, and', '10 cards are debuffed'] },
      bl_sylvie_backside: { name: 'The Backside', text: ['All Ace, 2, 3, 4, and', '5 cards are debuffed'] },
      bl_sylvie_heatwave: { name: 'The Heatwave', text: ['All even cards are', 'drawn face down'] },
      bl_sylvie_frost: { name: 'The Frost', text: ['All odd cards are', 'drawn face down'] },
    },
  },
  misc: { dictionary: { k_suits_pack: 'Suits Pack', k_bonus_pack: 'Bonus Pack', k_fortune_pack: 'Fortune Pack' }, labels: { moon: 'Moon' } },
};

export const SYLVIESILLY = registerMod({
  id: MOD_ID,
  name: "Sylvie's Silliness",
  prefix: 'sylvie',
  version: '0.11',
  by: 'NewtTheFish (rebuilt for Micatro)',
  badge_colour: '#C7387D',
  description: 'Decks, blinds, themed packs, moon planets that buff a suit, and the Bloom spectral.',
  content: { centers, blinds, atlases, loc: LOC },
  hooks,
});

export const STATUS = {
  decks: centers.filter((c) => c.set === 'Back').map((c) => c.key),
  boosters: centers.filter((c) => c.set === 'Booster').map((c) => c.key),
  moons: centers.filter((c) => c.set === 'Planet').map((c) => c.key),
  spectrals: centers.filter((c) => c.set === 'Spectral').map((c) => c.key),
  vouchers: centers.filter((c) => c.set === 'Voucher').map((c) => c.key),
  blinds: blinds.map((b) => b.key),
  PACK_POOLS,
};
