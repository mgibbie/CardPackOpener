// designs/gen6.js — the owner's Generation 6 Pokermon jokers and the helpers only they use, cut out of
// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every definition is unchanged. Helpers shared with another
// generation are in common.js. The jokers are REGISTERED by ../pokejokers_designs.js (in the old file's order: BATCHES there);
// a NEW joker is just added to JOKERS below and registers after them.
import {
  G, has_enhancement, scale_card, card_eval_status_text, pseudoseed, pseudorandom_element, poke_remove_card, localize, create_card, is_type, POKETYPES,
  has_no_rank, level_evo, can_evolve, emit, P_CENTERS, get_probability_vars, type_tooltip, scaling_evo, item_evo, copy_card,
  playing_card_joker_effects, get_type, pseudorandom, HISUI_REV,
} from '../../api.js';
import { rulesRev } from '../../../../js/mods/pins.js';
import { odds_text } from '../../../../js/engine/odds.js';
import {
  a_chips, a_mult, a_xmult, ancient_count, ancient_third, ancient_tip, consumable_room, deck_convert, discards, discards_used, face_scored, final_hand,
  foreseen, hand_size, hands, hazard_held_x, hazards_in_deck, lucky_odds_vars, ninja_others, protean_set, r3, r9, round_end, scry, scry_tip, spark_on,
  spark_state, sprite, super_luck, tailor, unbroken,
} from './common.js';


/** Honedge / Doublade: +mult_mod Mult per Steel card held when a hand is played. */
const held_steel = () => G.hand.cards.filter((c) => has_enhancement(c, 'm_steel'));
function blade_scale(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    const n = held_steel().length;
    if (n > 0) scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', scalar_factor: n, message_colour: 'MULT' });
  }
  if (context.joker_main && card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
  return undefined;
}
/** A held card's repetition only counts when it did something (Ferrothorn's card_effects guard). */
const held_effective = (context) => !!(context.card_effects && ((context.card_effects[0] && Object.keys(context.card_effects[0]).length) || context.card_effects.length > 1));

// ---------------------------------------------------------------- Gen 6, batch 3: the Gen 6 Legendaries (contentRev 63; 717-721)
/** Yveltal, Oblivion Wing: at the end of each round (the main end_of_round pass; not Blueprint, not a joker retrigger, not on a game
 *  over) 1 random card HELD in hand (the run's seeded stream, seed 'yveltal'; a card already being destroyed this pass — Gulpin's
 *  swallow — is skipped) is destroyed through Pokermon's poke_remove_card (dissolved / shattered, and every joker's remove_playing_cards
 *  runs: Giratina, Spiritomb, Phantump... see it), then the bank `oblivion_Xmult` (from X1, no energy field: never retroactive) gains
 *  `Xmult_mod`. Nothing held, nothing destroyed and nothing gained. */
function oblivion_wing(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return false;
  const held = ((G.hand && G.hand.cards) || []).filter((c) => unbroken(c) && !c.poke_swallowed);
  if (!held.length) return true;
  const [target] = pseudorandom_element(held, pseudoseed('yveltal'));
  target.poke_swallowed = true;
  poke_remove_card(target, card);
  const ex = card.ability.extra;
  ex.oblivion_Xmult = r9(ex.oblivion_Xmult + ex.Xmult_mod);
  card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(r3(ex.oblivion_Xmult)), colour: 'XMULT' });
  return true;
}
/** Zygarde, Cells: the Formes by the Cells collected on the card (`cells`, at most ZYGARDE_COMPLETE). */
export const ZYGARDE_HALF = 50, ZYGARDE_COMPLETE = 100;
export const zygarde_form = (card) => { const n = card.ability.extra.cells || 0; return n >= ZYGARDE_COMPLETE ? 'complete' : n >= ZYGARDE_HALF ? 'half' : 'ten'; };
export const ZYGARDE_FORMES = { ten: { name: '10% Forme', field: 'Xmult' }, half: { name: '50% Forme', field: 'Xmult1' }, complete: { name: 'Complete Forme', field: 'Xmult2' } };
const zygarde_x = (card) => card.ability.extra[ZYGARDE_FORMES[zygarde_form(card)].field];
/** Complete Forme's +hand size (`complete_size`, fixed): given while a Complete Zygarde is held (undebuffed) — on reaching 100 Cells, or
 *  when a Complete one is gained / un-debuffed — and taken back when it leaves or is debuffed (Juggler's way; `complete_given` remembers
 *  that it was given, so it is never given or taken twice). */
export function zygarde_give(card) {
  const ex = card.ability.extra;
  if (ex.complete_given || zygarde_form(card) !== 'complete') return;
  ex.complete_given = true;
  G.hand.change_size(ex.complete_size);
}
const zygarde_size = {
  add_to_deck(self, card) { card.ability.extra.complete_given = false; zygarde_give(card); },
  remove_from_deck(self, card) {
    const ex = card.ability.extra;
    if (!ex.complete_given) return;
    ex.complete_given = false;
    G.hand.change_size(-ex.complete_size);
  },
};
/** Cells: after each hand (the `after` pass, once: not Blueprint, not a joker retrigger, so a retriggered card adds 1 like any other),
 *  +1 Cell per card that scored (the scoring hand, a debuffed card left out: it didn't score), up to 100. Reaching 50 / 100 changes the
 *  Forme (from the next hand: the hand that collects them still scores at the old one) and the art; 100 also gives the +1 hand size. */
function zygarde_cells(card, context) {
  if (!context.after || context.blueprint || context.retrigger_joker) return false;
  const ex = card.ability.extra, was = zygarde_form(card);
  const n = ((context.scoring_hand) || []).filter((c) => !c.debuff).length;
  ex.cells = Math.min(ZYGARDE_COMPLETE, (ex.cells || 0) + n);
  const now = zygarde_form(card);
  if (now !== was) {
    zygarde_give(card);
    card_eval_status_text(card, 'extra', null, null, null, { message: ZYGARDE_FORMES[now].name + '!', colour: 'GREEN' });
  }
  return true;
}
/** Diancie, Diamond Storm: when a Blind is selected, 1 random card of the full deck that is not a Diamond (is_suit with the debuff
 *  bypassed: a Wild card already is one) and not a Stone card (no suit to change) becomes a Diamond (the run's seeded stream, seed
 *  'diancie'); its rank, enhancement, seal and edition stay. None left, nothing. Blueprint copies it (a second card). */
export function diamond_storm(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return false;
  const pool = (G.playing_cards || []).filter((c) => unbroken(c) && !has_enhancement(c, 'm_stone') && !c.is_suit('Diamonds', true));
  if (!pool.length) return true;
  const [pick] = pseudorandom_element(pool, pseudoseed('diancie'));
  pick.change_suit('Diamonds');
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 Diamond', colour: 'MONEY' });
  return true;
}
/** Hoopa, Hyperspace Hole: Unbound for good once HOOPA_AT (15) consumables have been used while it was held (`used`, on the card; any
 *  consumable, Energy included; not Blueprint). */
export const HOOPA_AT = 15;
export const hoopa_unbound = (card) => (card.ability.extra.used || 0) >= HOOPA_AT;
function hoopa_count(card, context) {
  if (!context.using_consumeable || context.blueprint || hoopa_unbound(card)) return false;
  const ex = card.ability.extra;
  ex.used = (ex.used || 0) + 1;
  if (hoopa_unbound(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Unbound!', colour: 'PURPLE' });
  return true;
}
/** At the end of each shop (ending_shop), with a consumable slot free NOW (cards + pending creations < limit; none, nothing — no roll),
 *  creates a random Tarot or Planet (Confined: the set is seeded 'hoopa', the card from that set's own pool), or once Unbound a random
 *  Spectral card. Blueprint copies it (a second card, room permitting). */
function hyperspace_hole(card, context) {
  if (!context.ending_shop) return false;
  if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return true;
  const set = hoopa_unbound(card) ? 'Spectral' : pseudorandom_element(['Tarot', 'Planet'], pseudoseed('hoopa'))[0];
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const c = create_card(set, G.consumeables, null, null, null, null, null, 'hoopa');
    c.add_to_deck();
    G.consumeables.emplace(c);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize(set === 'Spectral' ? 'k_plus_spectral' : set === 'Tarot' ? 'k_plus_tarot' : 'k_plus_planet'), colour: set === 'Tarot' ? 'PURPLE' : set });
  return true;
}
/** Volcanion, Steam Eruption: X(`Xmult` + `Xmult_mod` per discard used this round), read when it scores (a discard before the hand counts). */
const steam_x = (card) => r9(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * discards_used());
// ------------------------------------------------------------ the Gen 6 starters (Chespin / Fennekin / Froakie lines)
/** Fennekin / Braixen / Delphox: +1 discard (the Charmander line's pair) AND +1 Foresight (the Shinx line's), in one add/remove pair
 *  (two spreads would overwrite each other's add_to_deck). */
export const discards_scry = {
  add_to_deck(self, card, from_debuff) { discards.add_to_deck(self, card, from_debuff); scry.add_to_deck(self, card, from_debuff); },
  remove_from_deck(self, card, from_debuff) { discards.remove_from_deck(self, card, from_debuff); scry.remove_from_deck(self, card, from_debuff); },
};
/** Chesnaught, Spiky Shield: "2 or more hands left", counted BEFORE the hand is played (this hand included). run.js takes the hand
 *  (ease_hands_played(-1)) before the jokers score, so while it scores that is hands_left + 1 >= hands_req: every hand but a round's
 *  last (and every hand of a 1-hand round is the last). Out of a round (the shop) it shows the next round's first hand. */
const spiky_on = (card, scoring) => {
  const cr = G.GAME && G.GAME.current_round;
  if (!cr) return false;
  if (!scoring && !(G.GAME.facing_blind)) return (G.GAME.round_resets.hands || 0) >= card.ability.extra.hands_req;
  return (cr.hands_left || 0) + (scoring ? 1 : 0) >= card.ability.extra.hands_req;
};
/** Braixen: the first discard each round (a real one: not The Hook / a seal; pre_discard's `hook`) with a card that shares a rank with
 *  a Foreseen card (the Shinx line's `foreseen`: G.scry_view is the top of the deck before the discard draws) creates a random Tarot
 *  (the run's seeded stream, key_append 'braixen'). It needs room (cards + consumeable_buffer < limit); with no room nothing is made
 *  and the round's chance is NOT used up (a later Foreseen discard with room still makes it). Once made, not again this round
 *  (`tarot_round`). Not Blueprint (blueprint_compat false: its round flag is its own). */
const braixen_used = (card) => card.ability.extra.tarot_round === (G.GAME && G.GAME.round);
function braixen_tarot(card, context) {
  if (!context.pre_discard || context.hook || context.blueprint || context.retrigger_joker || !context.full_hand || braixen_used(card)) return;
  if (!context.full_hand.some((c) => !c.debuff && foreseen(c))) return;
  if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return;
  card.ability.extra.tarot_round = G.GAME.round;
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const t = create_card('Tarot', G.consumeables, null, null, null, null, undefined, 'braixen');
    t.add_to_deck();
    G.consumeables.emplace(t);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: 'Tarot' });
}
const braixen_state = (card) => (G.GAME && G.GAME.facing_blind && braixen_used(card) ? 'Used this round' : 'Active!');
/** Delphox, Mystical Fire: every Tarot used (by anyone, while it is held) banks +Xmult_mod in `fire_Xmult` (no energy field: what is
 *  banked keeps its worth; Energy raises only later gains). Not Blueprint for the gain; Blueprint copies the X. Latias's shape. */
export function mystical_fire(card, context) {
  const ex = card.ability.extra;
  if (context.using_consumeable && context.consumeable && context.consumeable.ability.set === 'Tarot') {
    if (context.blueprint) return undefined;
    ex.fire_Xmult = r3(ex.fire_Xmult + ex.Xmult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    return undefined;
  }
  if (context.joker_main && ex.fire_Xmult > 1) return { message: a_xmult(r3(ex.fire_Xmult)), colour: 'XMULT', Xmult_mod: ex.fire_Xmult };
  return undefined;
}
/** Froakie / Frogadier: the Barboach line's count with one type — a Water Joker by is_type (ptype, a Tera sticker, Castform's form,
 *  Arceus, an add-on's IS_TYPE_RULES), undebuffed; itself always counts (+1), so the shop card shows what it gives once bought. */
const froak_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Water')).length + 1;
function froak_main(card, context) {
  if (!context.joker_main) return undefined;
  const chips = r3(card.ability.extra.chips * froak_count(card));
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}
/** Greninja, Protean: the type most common among the OTHER jokers (undebuffed; each of the 12 types counted by is_type, so a dual-type
 *  joker (Arceus, a Stellar Tera) counts for each of its types). A tie for the most, or no typed joker, -> null (it keeps its type). */
export function protean_pick(card) {
  const n = {};
  for (const j of (G.jokers && G.jokers.cards) || []) {
    if (j === card || j.debuff) continue;
    for (const t of POKETYPES) if (is_type(j, t)) n[t] = (n[t] || 0) + 1;
  }
  const top = Math.max(0, ...Object.values(n));
  if (!top) return null;
  const best = POKETYPES.filter((t) => n[t] === top);
  return best.length === 1 ? best[0] : null;
}
const ninja_x = (card) => r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * ninja_others(card));

// ---------------------------------------------------------------- Gen 6, batch 1 (contentRev 61)
/** The Fletchling line, Gale Wings: the round's FIRST hand (Pachirisu's spark_on: current_round.hands_played === 0 while it scores; a discard
 *  before it doesn't use it up). Talonflame's first scored card (scoring_hand[0], by position: a debuffed one there scores nothing) retriggers
 *  on that hand. The tooltip's state is spark_state's ("Active!" / "Used this round"; the shop: the next round's first hand). */
function gale_retrigger(card, context) {
  if (context.repetition && context.cardarea === G.play && !context.end_of_round && spark_on() && (context.scoring_hand || [])[0] === context.other_card) {
    return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
  }
  return undefined;
}
/** The Scatterbug line: a scored Wild card (has_enhancement: a quantum Wild counts). */
const wild_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_wild'));
/** Vivillon's patterns: upstream 3.9.1 draws 20 on the Gen 6 sheet (pokespriteload.lua `vivillon` base.pos, unnamed there): one is rolled
 *  ONCE, when the card becomes a Vivillon (set_ability initial: created, or evolved from Spewpa — its own seed 'vivillon_pattern'), kept on
 *  ability.extra.form (1-20; 1 is the center's own card). systems/anim.js GEN6_FORM_SPRITES. */
export const VIVILLON_PATTERNS = 20;
/** The Flabébé line's flower colour: rolled once when a card of the line is created (set_ability initial, seed 'flabebe_flower'), kept through
 *  both evolutions (`form`, NAMES_TO_KEEP). Upstream 3.9.1 draws the five colours of each, in this order (the first the center's own card). */
export const FLOWERS = ['red', 'white', 'yellow', 'orange', 'blue'];
const FLOWER_NAME = { red: 'Red', white: 'White', yellow: 'Yellow', orange: 'Orange', blue: 'Blue' };
const flower_of = (card) => (FLOWERS.includes(card.ability.extra.form) ? card.ability.extra.form : 'red');
const queen_scored = (context, area) => !!(context.cardarea === G.play && !context.end_of_round && context.other_card && !has_no_rank(context.other_card)
  && context.other_card.get_id() === 12 && (area === 'repetition' ? context.repetition : context.individual));
/** The Skiddo line: OTHER Grass Jokers (Barboach / Starly's count: is_type, undebuffed; itself never). */
const grass_others = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Grass')).length;
const goat_chips = (card) => r3(card.ability.extra.chips + card.ability.extra.chips1 * grass_others(card));
/** Pancham: evolves after 5 rounds, but only at an end of round while you hold an undebuffed Dark Joker (another one: is_type, so a Dark
 *  Tera sticker counts); otherwise it waits at 0 rounds and evolves at the first end of round with one (Glameow's slot wait). */
const dark_held = (card) => ((G.jokers && G.jokers.cards) || []).some((j) => j !== card && !j.debuff && is_type(j, 'Dark'));
function pancham_evo(self, card, context) {
  const ex = card.ability.extra;
  if (!can_evolve(self, card, context, 'j_poke_pangoro') || card.debuff || ex.rounds === undefined || ex.rounds > 1) return level_evo(self, card, context, 'j_poke_pangoro');
  if (!dark_held(card)) {
    ex.rounds = 0;
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Needs a Dark Joker!', colour: 'FILTER' });
    return undefined;
  }
  return level_evo(self, card, context, 'j_poke_pangoro');
}
/** Furfrou's trims, one per Ante (Glameow's fickle pick: picked when obtained — add_to_deck, if none yet — and again at each Ante change, the
 *  run's seeded pseudorandom_element over the trims MINUS the current one, seeded 'furfrou_trim' + the new Ante; never on creation). Each trim
 *  keys a suit (the spec's: Heart Hearts, Diamond Diamonds, Star Spades, Debutante Clubs). Kept on ability.extra.form, so the view draws the
 *  trim's own 3.9.1 card (systems/anim.js GEN6_FORM_SPRITES); unset (a shop card) it is the Natural card. */
export const TRIMS = {
  heart: { name: 'Heart Trim', suit: 'Hearts' }, diamond: { name: 'Diamond Trim', suit: 'Diamonds' },
  star: { name: 'Star Trim', suit: 'Spades' }, debutante: { name: 'Debutante Trim', suit: 'Clubs' },
};
const TRIM_ORDER = ['heart', 'diamond', 'star', 'debutante'];
export function furfrou_trim(card) {
  const ex = card.ability.extra;
  const left = TRIM_ORDER.filter((t) => t !== ex.form);
  ex.form = pseudorandom_element(left, pseudoseed('furfrou_trim' + G.GAME.round_resets.ante))[0];
  emit('card_changed', { card: card.sort_id });
  return ex.form;
}
const trim_of = (card) => (TRIMS[card.ability.extra.form] ? card.ability.extra.form : null);
const trim_scored = (card, context) => { const t = trim_of(card); return !!(t && context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(TRIMS[t].suit)); };
/** Meowstic: its gender is rolled when it becomes a Meowstic (set_ability initial: evolved from Espurr, or created; seed 'meowstic_gender'),
 *  kept on ability.extra.form ('male' / 'female'). A Male has no number: its Energy fields are dropped, so Energy can't be used on it (never a
 *  silent no-op). */
const tarots_held = () => ((G.consumeables && G.consumeables.cards) || []).filter((c) => c.ability.set === 'Tarot').length;
const meow_x = (card) => r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * tarots_held());
const meow_female = (card) => card.ability.extra.form === 'female';
/** Male Meowstic, Prankster: at end of round (the main pass, not Blueprint), a random Tarot, with consumable room only (Pickup's check; no room,
 *  nothing). The card is the run's seeded create_card. */
function prankster_tarot(card, context) {
  if (!round_end(context) || context.blueprint || meow_female(card) || !consumable_room()) return;
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const c = create_card('Tarot', G.consumeables, null, null, null, null, undefined, 'meowstic');
    c.add_to_deck();
    G.consumeables.emplace(c);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: 'Tarot' });
}

// ------------------------------------------------------------ Gen 6, batch 2 (#682-715)
/** Spritzee / Aromatisse, Healing Aroma: each scored Lucky card (has_enhancement: a quantum Lucky too; a debuffed card never scores
 *  its effects) earns `aroma_money` (fixed: money takes no Energy), whether or not its own rolls hit (Heart Stamp's shape and
 *  dollar_buffer). Blueprint copies it. Aromatisse also has Super Luck (+1 to both Lucky rolls, super_luck above). */
function healing_aroma(card, context) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_lucky'))) return undefined;
  const money = card.ability.extra.aroma_money;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + money;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return { dollars: money, card };
}
/** Swirlix / Slurpuff, Sweet Veil: every Tarot used (by anyone, while it is held) banks +mult_mod Mult in `sweet_mult` (no energy field:
 *  what is banked keeps its worth; Energy raises only later gains; carried into Slurpuff), and it gives the bank in joker_main. Not
 *  Blueprint for the gain (Delphox's Mystical Fire shape); Blueprint copies the Mult. */
function sweet_veil(card, context) {
  const ex = card.ability.extra;
  if (context.using_consumeable && context.consumeable && context.consumeable.ability.set === 'Tarot') {
    if (context.blueprint) return undefined;
    ex.sweet_mult = r3(ex.sweet_mult + ex.mult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
    return undefined;
  }
  if (context.joker_main && ex.sweet_mult > 0) return { message: a_mult(r3(ex.sweet_mult)), colour: 'MULT', mult_mod: ex.sweet_mult };
  return undefined;
}
/** Slurpuff: +card_limit consumable slots while held AND undebuffed (Alakazam's slot, given and taken at once; fixed). */
const sweet_slot = {
  add_to_deck(self, card) { G.consumeables.config.card_limit += card.ability.extra.card_limit; },
  remove_from_deck(self, card) { G.consumeables.config.card_limit -= card.ability.extra.card_limit; },
};
/** Inkay: each scored 2, 3, 4 or 5 (a rankless Stone card never) gives +mult Mult. */
const LOW_RANKS = [2, 3, 4, 5];
function inkay_low(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && LOW_RANKS.includes(context.other_card.get_id())) {
    return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}
/** Malamar r73 (the owner's buff, "malamar is so weak please fix"): each scored 2, 3, 4 or 5 (its real rank, not the flipped one; a Stone
 *  card never) ALSO gives X(Xmult_multi), on top of Topsy-Turvy. Card level, so a retrigger gives it again. A move recorded before r73 (a
 *  resumed / replayed run, js/mods/pins.js RULES) never sees it, and a Malamar made on those rules has no `Xmult_multi` at all (its
 *  set_ability deletes it), so an Energy still skips it exactly as before. One made on them and kept past a re-pin gives the base X1.25. */
const malamar_x73 = () => rulesRev('pokermon') >= 73;
function malamar_low_x(card, context) {
  if (!malamar_x73() || !(context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && LOW_RANKS.includes(context.other_card.get_id()))) return undefined;
  const x = card.ability.extra.Xmult_multi;
  return { x_mult: typeof x === 'number' ? x : P_CENTERS.j_poke_malamar.config.extra.Xmult_multi, card };
}
/** Binacle / Barbaracle: each scored 7 gives +chips Chips (Barbaracle also X(Xmult_multi)). */
function seven_rocks(card, context, x) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && context.other_card.get_id() === 7)) return undefined;
  const ex = card.ability.extra;
  return x ? { chips: ex.chips, x_mult: ex.Xmult_multi, card } : { chips: ex.chips, card };
}
/** Skrelp / Dragalge, Poison Point: when a Blind is selected, 1 random card of the full deck becomes a Hazard card (unenhanced first:
 *  the Regis' rule, so a fully enhanced deck loses an enhancement). Blueprint copies it (as Marble Joker). */
export function skrelp_poison(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  if (deck_convert('m_poke_hazard', 'poke_skrelp_hazard')) card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 Hazard', colour: 'PURPLE' });
}
/** Tyrunt / Tyrantrum, Ancient Kings (ancient_tens' shape, read live): 1+ +mult Mult; 2+ X(Xmult); 3+ every scored King retriggers
 *  (`retriggers`, fixed); Tyrantrum 4+ X(Xmult2) too (the tiers multiply). The 3+ tier counts once a HAND (joker_main), never from a
 *  Blueprint or a joker retrigger. */
function ancient_kings(card, context) {
  const ex = card.ability.extra;
  if (context.repetition && context.cardarea === G.play && context.scoring_hand && !has_no_rank(context.other_card)
    && context.other_card.get_id() === 13 && ancient_count(context, 13) >= 3) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  if (!context.joker_main || !context.scoring_hand) return undefined;
  const n = ancient_count(context, 13);
  if (n < 1) return undefined;
  const r = { mult_mod: ex.mult };
  let x = 1;
  if (n >= 2) x *= ex.Xmult;
  if (n >= 4 && ex.Xmult2 !== undefined) x *= ex.Xmult2;
  if (x !== 1) r.Xmult_mod = r3(x);
  if (n >= 3) ancient_third(card, context);
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(r3(ex.mult));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Amaura / Aurorus, Ancient Queens: 1+ +chips Chips; 2+ the LEFTMOST scored Queen that isn't Glass (nor debuffed) becomes Glass in
 *  `before` (Midas Mask's moment: it scores as Glass this hand), one a hand, never from a Blueprint; 3+ earn $ancient_money (once a
 *  hand, joker_main; fixed); Aurorus 4+ X(Xmult2). The 3+ tier counts once a hand toward evolving. */
const queen_to_glass = (context) => (context.scoring_hand || []).find((c) => !c.debuff && !has_no_rank(c) && c.get_id() === 12 && !has_enhancement(c, 'm_glass'));
function ancient_queens(card, context) {
  const ex = card.ability.extra;
  if (context.before && !context.blueprint && !context.retrigger_joker && context.scoring_hand && ancient_count(context, 12) >= 2) {
    const q = queen_to_glass(context);
    if (q) {
      q.set_ability(P_CENTERS.m_glass, null, true);
      G.E_MANAGER.add_event(() => { q.juice_up(); });
      card_eval_status_text(card, 'extra', null, null, null, { message: 'Glass!', colour: 'CHIPS' });
    }
    return undefined;
  }
  if (!context.joker_main || !context.scoring_hand) return undefined;
  const n = ancient_count(context, 12);
  if (n < 1) return undefined;
  const r = { chip_mod: ex.chips, message: a_chips(r3(ex.chips)), colour: 'CHIPS' };
  if (n >= 4 && ex.Xmult2 !== undefined) { r.Xmult_mod = ex.Xmult2; r.message = a_xmult(r3(ex.Xmult2)); r.colour = 'XMULT'; }
  if (n >= 3) { ancient_third(card, context); if (ex.ancient_money > 0) r.dollars = ex.ancient_money; }
  return r;
}
/** Hawlucha, Flying Press: the FIRST and the LAST scored card (by position in the scoring hand, Cinccino's / Shellos's rule: a debuffed
 *  card there gets nothing, the ends never shift inward) each retrigger `retriggers` time(s); a single scored card is both ends and
 *  retriggers once in all (not twice). Blueprint copies it. */
function flying_press(card, context) {
  if (!(context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand.length)) return undefined;
  const sh = context.scoring_hand, c = context.other_card;
  if (c === sh[0] || c === sh[sh.length - 1]) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
  return undefined;
}
/** Klefki, Key Ring: the run's Voucher record (G.GAME.used_vouchers: every Voucher redeemed this run, read live, so one bought late
 *  counts all those before it; a deck's or challenge's starting Voucher is on that record too). */
export const vouchers_redeemed = () => Object.values((G.GAME && G.GAME.used_vouchers) || {}).filter(Boolean).length;
const key_ring_x = (card) => r3(1 + card.ability.extra.Xmult_mod * vouchers_redeemed());
/** Phantump / Trevenant, Forest's Curse: each playing card destroyed (remove_playing_cards, every destroying path: a Glass card
 *  shattering, Hanged Man, a Hazard's end-of-round roll, Gulpin's swallow...) banks +mult_mod Mult in `curse_mult` (no energy field:
 *  never retroactive; carried into Trevenant), given in joker_main. Trevenant also plants a Seed per destroyed card: a random
 *  UNENHANCED card of the full deck (not one being destroyed) becomes a Seed card; none unenhanced, no Seed (Cherubi's rule: it never
 *  overwrites). Not Blueprint for the gain or the Seeds; Blueprint copies the Mult. */
function forest_curse(card, context, seeds) {
  const ex = card.ability.extra;
  if (context.remove_playing_cards && !context.blueprint && (context.removed || []).length) {
    const n = context.removed.length;
    ex.curse_mult = r3(ex.curse_mult + ex.mult_mod * n);
    let planted = 0;
    if (seeds) {
      for (let i = 0; i < n; i++) {
        const plain = (G.playing_cards || []).filter((c) => unbroken(c) && !context.removed.includes(c) && c.config.center.key === 'c_base');
        if (!plain.length) break;
        const [pick] = pseudorandom_element(plain, pseudoseed('poke_trevenant_seed'));
        pick.set_ability(P_CENTERS.m_poke_seed, null, true);
        planted++;
      }
    }
    card_eval_status_text(card, 'extra', null, null, null, { message: planted ? '+' + planted + ' Seed' : a_mult(ex.curse_mult), colour: planted ? 'GREEN' : 'MULT' });
    return undefined;
  }
  if (context.joker_main && ex.curse_mult > 0) return { message: a_mult(r3(ex.curse_mult)), colour: 'MULT', mult_mod: ex.curse_mult };
  return undefined;
}
/** Noibat / Noivern, Supersonic: Glass cards break twice as often. r69 (the owner's "2 Noiverns still 1/2 to break glass", 2026-11-02):
 *  EACH undebuffed Noibat / Noivern doubles the Glass roll's NUMERATOR in the mod_probability pass (identifier 'glass': a Glass card's
 *  1 in 4, a quantum Glass's too), stacking the way Oops! All 6s does: one copy 2 in 4 (1 in 2), two 4 in 4 (always), and Oops! doubles
 *  it again afterwards; Regice's Ice Body (fix_probability, 0) still wins: with Regice no Glass breaks at all. A debuffed copy is not
 *  asked (calculate_joker skips it); a Tera'd one still is (a sticker changes its type, not its ability). r62-r68 halved the
 *  DENOMINATOR and copies never stacked (1 in 2 at best): a run recorded on those revs replays so (rulesRev). Not Blueprint. */
const glass_den = (t) => (t && t.ability && t.ability.name === 'Glass Card' && typeof t.ability.extra === 'number' ? t.ability.extra : (P_CENTERS.m_glass.config.extra || 4));
const glass_stack69 = () => rulesRev('pokermon') >= 69;
function supersonic(card, context) {
  if (context.mod_probability && !context.blueprint && context.identifier === 'glass') {
    if (glass_stack69()) return { numerator: context.numerator * 2 };
    return { denominator: Math.min(context.denominator, Math.max(1, glass_den(context.trigger_obj) / 2)) };
  }
  return undefined;
}
/** The odds a Glass card breaks now, as text ('1 in 2', 'always', 'never'): every Noibat / Noivern held counted; from the shop, this
 *  card's own doubling added on top (what it would be once bought). */
function glass_odds_vars(card) {
  const held = G.jokers && G.jokers.cards.includes(card);
  let [n, d] = get_probability_vars(card, 1, 4, 'glass');
  if (!held) n *= 2;
  return [odds_text(n, d)];
}
/** Noibat: each Glass card that shatters (remove_playing_cards, the `shattered` ones: Whismur's count) banks +mult_mod Mult in `bat_mult`;
 *  Noivern banks +Xmult_mod X Mult in `bat_Xmult` instead (Noibat's Mult carried and still given) and turns one random card of the
 *  full deck into Glass for each (unenhanced first, then any non-Glass card; never one being destroyed). Banks never retroactive (no
 *  energy field). Not Blueprint for the gains or the Glass; Blueprint copies the score. Every extra shatter also grows the Whismur line
 *  (its own remove_playing_cards count). */
function boomburst(card, context, x) {
  const ex = card.ability.extra;
  if (context.remove_playing_cards && !context.blueprint && context.removed) {
    const broken = context.removed.filter((c) => c.shattered);
    if (!broken.length) return undefined;
    if (x) {
      ex.bat_Xmult = r3(ex.bat_Xmult + ex.Xmult_mod * broken.length);
      let made = 0;
      for (let i = 0; i < broken.length; i++) if (deck_convert('m_glass', 'poke_noivern_glass', context.removed)) made++;
      card_eval_status_text(card, 'extra', null, null, null, { message: made ? '+' + made + ' Glass' : a_xmult(ex.bat_Xmult), colour: 'XMULT' });
    } else {
      ex.bat_mult = r3(ex.bat_mult + ex.mult_mod * broken.length);
      card_eval_status_text(card, 'extra', null, null, null, { message: a_mult(ex.bat_mult), colour: 'MULT' });
    }
    return undefined;
  }
  if (!context.joker_main) return undefined;
  const r = {};
  if (ex.bat_mult > 0) r.mult_mod = ex.bat_mult;
  if (ex.bat_Xmult && ex.bat_Xmult > 1) r.Xmult_mod = ex.bat_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_mult(r3(r.mult_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}

export const JOKERS = {

  // ---------------------------------------------------------------- LINE B: Honedge -> Doublade -> Aegislash (Metal, Gen 6)
  // Honedge 679: gains +1 Mult per Steel card held when a hand is played; evolves at +20 Mult.
  honedge: {
    name: 'honedge', poke_sprite391: sprite('Natdex', 6, 45),
    config: { evo_rqmt: 20, extra: { mult: 0, mult_mod: 1 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'enhancements', 'scaling_evo'], poke_after: 'pyroar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.mult, self.config.evo_rqmt] }; },
    calculate(self, card, context) { return blade_scale(card, context) || scaling_evo(self, card, context, 'j_poke_doublade', card.ability.extra.mult, self.config.evo_rqmt); },
  },
  // Doublade 680: +2 Mult per held Steel card; the first 2 Steel cards held are retriggered. Evolves with a Dusk Stone.
  doublade: {
    name: 'doublade', poke_sprite391: sprite('Natdex', 8, 45),
    config: { extra: { mult: 0, mult_mod: 2, steel_retriggers: 2, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Metal', gen: 6, blueprint_compat: true, item_req: 'duskstone',
    attributes: ['mult', 'scaling', 'enhancements', 'retrigger', 'item_evo'], poke_after: 'honedge',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra;
      return { vars: [ex.mult_mod, ex.steel_retriggers, ex.mult] };
    },
    calculate(self, card, context) {
      const r = blade_scale(card, context);
      if (r) return r;
      // the first `steel_retriggers` Steel cards held (that score: not debuffed), left to right
      if (context.repetition && context.cardarea === G.hand && held_effective(context) && has_enhancement(context.other_card, 'm_steel')) {
        const first = held_steel().filter((c) => !c.debuff).slice(0, card.ability.extra.steel_retriggers);
        if (first.includes(context.other_card)) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return item_evo(self, card, context, 'j_poke_aegislash');
    },
  },
  // Aegislash 681: +20 Mult (kept from Doublade); Stance Change — Blade Forme X2.5 Mult, Shield Forme retriggers every held Steel
  // card. A played hand switches to Blade, a discard to Shield; each round starts in Shield.
  aegislash: {
    name: 'aegislash', poke_sprite391: sprite('Gen06', 6, 8),
    config: { extra: { mult: 20, Xmult: 2.5, retriggers: 1, form: 'shield' } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'enhancements', 'retrigger', 'discard'], poke_after: 'doublade',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra;
      return { vars: [ex.mult, ex.Xmult, ex.form === 'blade' ? 'Blade' : 'Shield'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) {
        if (ex.form === 'blade') return { message: a_xmult(ex.Xmult), colour: 'XMULT', mult_mod: ex.mult, Xmult_mod: ex.Xmult };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      if (context.repetition && context.cardarea === G.hand && ex.form !== 'blade' && held_effective(context) && has_enhancement(context.other_card, 'm_steel')) {
        return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (context.after && context.cardarea === G.jokers && !context.blueprint && ex.form !== 'blade') {
        ex.form = 'blade';
        return { message: 'Blade Forme', colour: 'XMULT' };
      }
      if (context.pre_discard && !context.blueprint && ex.form !== 'shield') {
        ex.form = 'shield';
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Shield Forme', colour: 'FILTER' });
      }
      if (round_end(context) && !context.blueprint) ex.form = 'shield';
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Xerneas 716 (Fairy Legendary, Gen 6)
  // Geomancy: after the round's first hand, played cards give X1.25 Mult when scored. The first playing card destroyed each round
  // comes back as a copy: to the hand during a Blind (outside one — the shop — into the deck).
  xerneas: {
    name: 'xerneas', poke_sprite391: sprite('Gen06', 8, 10, [9, 10]),
    config: { extra: { Xmult_multi: 1.25, revived: false } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'destroy_card', 'playing_card'], poke_after: 'gourgeist',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const charged = !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played > 0);
      return { vars: [card.ability.extra.Xmult_multi, charged ? 'Active!' : 'Charging...'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && G.GAME.current_round.hands_played > 0) {
        return { x_mult: ex.Xmult_multi, card };
      }
      if (context.remove_playing_cards && !context.blueprint && !ex.revived && context.removed && context.removed.length) {
        ex.revived = true;
        const src = context.removed[0];
        const to_hand = !!G.GAME.facing_blind;
        G.playing_card = (G.playing_card && G.playing_card + 1) || 1;
        const id = G.playing_card;
        G.E_MANAGER.add_event(() => {
          const copy = copy_card(src, null, null, id);
          copy.add_to_deck();
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
          G.playing_cards.push(copy);
          (to_hand ? G.hand : G.deck).emplace(copy);
          copy.start_materialize();
          playing_card_joker_effects([copy]);
        });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_copied_ex'), colour: 'pink' });
      }
      if (round_end(context) && !context.blueprint) ex.revived = false;
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Gen 6, batch 3: the Gen 6 Legendaries, 717-721 (contentRev 63)
  // The owner's design ("Yes", 2026-11-02). Legendary $20 each (The Soul / the Legendary pool); each complete ALONE (the owner's solo
  // rule, contentRev 59: no partner clause). Types from the card art (pokermon_art_type.mjs; every form cell checked): Yveltal Dark,
  // Zygarde Dragon (10% / 50% / Complete cells all Dragon), Diancie Fairy, Hoopa Psychic (its Unbound cell Psychic too), Volcanion Fire.
  // Neither Nacho nor Pokermon+ has any. Art: upstream 3.9.1's own cells with their floating souls (Yveltal / Diancie / Volcanion the
  // Natdex sheet {22,47} / {26,47} / {0,48}; Zygarde 10% {2,11}, Hoopa {8,11} the Gen 6 sheet), the forms (Zygarde 50% {4,11} and
  // Complete {6,11}, Hoopa Unbound {10,11}) drawn live by ui.js ownFace (systems/anim.js GEN6_LEGEND_FORMS) from each center's
  // poke_view_form. After Xerneas (716) in Pokédex order.
  //
  // Yveltal 717 (Dark), Oblivion Wing: at the end of each round, destroys 1 random card held in hand (seeded; every joker's
  // remove_playing_cards sees it) and gains X0.25 Mult (`oblivion_Xmult` from X1, no energy field; the gain `Xmult_mod` +20%: 0.3 / 0.35
  // / 0.4, never retroactive). Nothing held, nothing. Blueprint copies the X, never the destroy or the gain.
  yveltal: {
    name: 'yveltal', poke_sprite391: sprite('Natdex', 22, 47, [23, 47]),
    config: { extra: { oblivion_Xmult: 1, Xmult_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dark', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'destroy_card'], poke_after: 'xerneas',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.oblivion_Xmult), r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) {
      if (oblivion_wing(card, context)) return undefined;
      const ex = card.ability.extra;
      if (context.joker_main && ex.oblivion_Xmult > 1) return { message: a_xmult(r3(ex.oblivion_Xmult)), colour: 'XMULT', Xmult_mod: ex.oblivion_Xmult };
      return undefined;
    },
  },
  // Zygarde 718 (Dragon), Cells: +1 Cell for each card that scores while it is held (counted once per hand, after it scores: a retrigger
  // doesn't add one, nor Blueprint; `cells` on the card, at most 100). 10% Forme X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); 50% Forme from 50
  // Cells X2.5 (`Xmult1`: 3 / 3.5 / 4); Complete Forme from 100 Cells X4 (`Xmult2`: 4.8 / 5.6 / 6.4) and +1 hand size (`complete_size`,
  // fixed: given on reaching it, taken back when sold, destroyed or debuffed). The Forme is for good (the Cells never drop) and its art
  // shows (poke_view_form). Blueprint copies the X.
  zygarde: {
    name: 'zygarde', poke_sprite391: sprite('Gen06', 2, 11, [3, 11]),
    config: { extra: { Xmult: 1.5, Xmult1: 2.5, Xmult2: 4, complete_size: 1, cells: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'hand_size'], poke_after: 'yveltal',
    poke_view_form(self, card) { return zygarde_form(card); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [Math.min(ZYGARDE_COMPLETE, ex.cells || 0), r3(ex.Xmult), r3(ex.Xmult1), r3(ex.Xmult2), ex.complete_size, ZYGARDE_FORMES[zygarde_form(card)].name] };
    },
    calculate(self, card, context) {
      if (zygarde_cells(card, context)) return undefined;
      if (context.joker_main) { const x = zygarde_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...zygarde_size,
  },
  // Diancie 719 (Fairy), Diamond Storm: each scored Diamond (is_suit: Wild cards count) earns $1 (`diamond_money`, fixed) and gives X1.2
  // Mult (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38). When a Blind is selected, 1 random non-Diamond card of the full deck (seeded; never a
  // Stone card) becomes a Diamond, keeping its rank, enhancement, seal and edition. Blueprint copies both.
  diancie: {
    name: 'diancie', poke_sprite391: sprite('Natdex', 26, 47, [27, 47]),
    config: { extra: { Xmult_multi: 1.2, diamond_money: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'money', 'suit', 'diamonds', 'playing_card'], poke_after: 'zygarde',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.diamond_money, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (diamond_storm(card, context)) return undefined;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Diamonds')) {
        const ex = card.ability.extra;
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.diamond_money;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: ex.diamond_money, x_mult: ex.Xmult_multi, card };
      }
      return undefined;
    },
  },
  // Hoopa 720 (Psychic), Hyperspace Hole: at the end of each shop, creates a random Tarot or Planet card (must have room). After 15
  // consumables used while it is held (`used`, on the card; any consumable; not Blueprint), Hoopa Unbound for good: its Unbound card shows
  // (Psychic too) and it creates a random Spectral card instead. No number: Energy-inert (poke_no_energy_field). Blueprint copies the creation.
  hoopa: {
    name: 'hoopa', poke_sprite391: sprite('Gen06', 8, 11, [9, 11]),
    config: { extra: { used: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 6, blueprint_compat: true,
    attributes: ['generation', 'tarot', 'planet', 'spectral'], poke_after: 'diancie',
    poke_no_energy_field: true,
    poke_view_form(self, card) { return hoopa_unbound(card) ? 'unbound' : 'confined'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [hoopa_unbound(card) ? 'Hoopa Unbound' : 'Used: ' + Math.min(HOOPA_AT, card.ability.extra.used || 0) + '/' + HOOPA_AT] };
    },
    calculate(self, card, context) {
      hoopa_count(card, context);
      hyperspace_hole(card, context);
      return undefined;
    },
  },
  // Volcanion 721 (Fire), Steam Eruption: +1 discard each round (`d_size`, fixed; the Charmander line's pair). X2 Mult, plus X0.25 for each
  // discard used this round (current_round.discards_used, read when it scores; it resets each round). `Xmult` +20% (2.4 / 2.8 / 3.2),
  // `Xmult_mod` +20% (0.3 / 0.35 / 0.4). Blueprint copies the X.
  volcanion: {
    name: 'volcanion', poke_sprite391: sprite('Natdex', 0, 48, [1, 48]),
    config: { extra: { d_size: 1, Xmult: 2, Xmult_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fire', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'discards'], poke_after: 'hoopa',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult), r3(ex.Xmult_mod), r3(steam_x(card))] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = steam_x(card);
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
    ...discards,
  },
  // ---------------------------------------------------------------- The Gen 6 starters (2026-10-28, the owner's "build" of the missing
  // Gen 5-9 starters): Chespin / Fennekin / Froakie lines. Pokermon's starter conventions: a type perk at every stage (Grass +1 hand size,
  // Fire +1 discard, Water +1 hand: fixed, never energized); Basic Uncommon $5 with `starter` (the Starter Pack), Stage 1 Safari $8, Stage 2
  // Safari $10; 5 rounds then 5 (Chikorita / Cyndaquil / Totodile's timers). Types are the cards' (Grass / Fire / Water). Art: upstream
  // 3.9.1's own cells (Natdex 8-24, 43); nothing to deploy. Neither Nacho nor Pokermon+ has any of them. After Genesect (649; Hydreigon
  // 635 before the Gen 5 Legendaries, contentRev 55), before Bunnelby (659).
  // Chespin 650: +1 hand size; +40 Chips (`chips`, Energy +30%: 52 / 64 / 76). Evolves after 5 rounds.
  chespin: {
    name: 'chespin', poke_sprite391: sprite('Natdex', 8, 43),
    config: { extra: { h_size: 1, chips: 40, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 6, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'chips', 'round_evo'], poke_after: 'genesect',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_quilladin');
    },
    ...hand_size,
  },
  // Quilladin 651: +1 hand size; +80 Chips (104 / 128 / 152). Evolves after 5 rounds.
  quilladin: {
    name: 'quilladin', poke_sprite391: sprite('Natdex', 10, 43),
    config: { extra: { h_size: 1, chips: 80, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'chips', 'round_evo'], poke_after: 'chespin',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_chesnaught');
    },
    ...hand_size,
  },
  // Chesnaught 652: +1 hand size; +150 Chips (195 / 240 / 285); Spiky Shield: X1.5 Mult (`Xmult`, Energy +20%: 1.8 / 2.1 / 2.4) while you
  // have 2 or more hands left, counted BEFORE the hand is played (this one included: every hand but the round's last; spiky_on). The 2
  // (`hands_req`) is fixed.
  chesnaught: {
    name: 'chesnaught', poke_sprite391: sprite('Natdex', 12, 43),
    config: { extra: { h_size: 1, chips: 150, Xmult: 1.5, hands_req: 2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'chips', 'xmult', 'hands'], poke_after: 'quilladin',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.h_size, r3(ex.chips), r3(ex.Xmult), ex.hands_req, spiky_on(card, false) ? 'Active!' : 'Inactive'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      if (spiky_on(card, true)) return { message: 'Spiky Shield!', colour: 'XMULT', chip_mod: ex.chips, Xmult_mod: ex.Xmult };
      return { message: a_chips(r3(ex.chips)), colour: 'CHIPS', chip_mod: ex.chips };
    },
    ...hand_size,
  },
  // Fennekin 653: +1 discard; +1 Foresight (both fixed). No number of its own: it carries Delphox's Mystical Fire gain `Xmult_mod` 0.2
  // (unused until then; Combee's "Energy for later"), so Fire Energy taken now is re-applied on each evolution. Evolves after 5 rounds.
  fennekin: {
    name: 'fennekin', poke_sprite391: sprite('Natdex', 14, 43),
    config: { extra: { d_size: 1, scry: 1, rounds: 5, Xmult_mod: 0.2 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 6, blueprint_compat: false, starter: true,
    attributes: ['starter', 'discard', 'foresight', 'round_evo'], poke_after: 'chesnaught',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.d_size, ex.scry, ex.rounds] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_braixen'); },
    ...discards_scry,
  },
  // Braixen 654: +1 discard; +1 Foresight; the first time each round you discard a card that shares a rank with a Foreseen card, create a
  // Tarot (must have room; braixen_tarot). Carries `Xmult_mod` for Delphox. Evolves after 5 rounds.
  braixen: {
    name: 'braixen', poke_sprite391: sprite('Natdex', 16, 43),
    config: { extra: { d_size: 1, scry: 1, rounds: 5, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 6, blueprint_compat: false,
    attributes: ['starter', 'discard', 'foresight', 'tarot', 'generation', 'round_evo'], poke_after: 'fennekin',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.d_size, ex.scry, ex.rounds, braixen_state(card)] }; },
    calculate(self, card, context) { braixen_tarot(card, context); return level_evo(self, card, context, 'j_poke_delphox'); },
    ...discards_scry,
  },
  // Delphox 655: +1 discard; +1 Foresight; Mystical Fire: permanently gains X0.2 Mult for each Tarot card used (`Xmult_mod`, Energy +20%:
  // 0.24 / 0.28 / 0.32; banked in `fire_Xmult`, no energy field, never raised retroactively).
  delphox: {
    name: 'delphox', poke_sprite391: sprite('Natdex', 18, 43),
    config: { extra: { d_size: 1, scry: 1, Xmult_mod: 0.2, fire_Xmult: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'discard', 'foresight', 'xmult', 'scaling', 'tarot'], poke_after: 'braixen',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.d_size, ex.scry, r3(ex.Xmult_mod), r3(ex.fire_Xmult)] }; },
    calculate(self, card, context) { return mystical_fire(card, context); },
    ...discards_scry,
  },
  // Froakie 656: +1 hand; +30 Chips for each Water Joker, itself included (`chips`, Energy +30%: 39 / 48 / 57; froak_count). Evolves after
  // 5 rounds.
  froakie: {
    name: 'froakie', poke_sprite391: sprite('Natdex', 20, 43),
    config: { extra: { hands: 1, chips: 30, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 6, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'chips', 'types', 'round_evo'], poke_after: 'delphox',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = froak_count(card); return { vars: [ex.hands, r3(ex.chips), n, r3(ex.chips * n), ex.rounds] }; },
    calculate(self, card, context) { return froak_main(card, context) || level_evo(self, card, context, 'j_poke_frogadier'); },
    ...hands,
  },
  // Frogadier 657: +1 hand; +50 Chips for each Water Joker (65 / 80 / 95). Evolves after 5 rounds.
  frogadier: {
    name: 'frogadier', poke_sprite391: sprite('Natdex', 22, 43),
    config: { extra: { hands: 1, chips: 50, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'hands', 'chips', 'types', 'round_evo'], poke_after: 'froakie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = froak_count(card); return { vars: [ex.hands, r3(ex.chips), n, r3(ex.chips * n), ex.rounds] }; },
    calculate(self, card, context) { return froak_main(card, context) || level_evo(self, card, context, 'j_poke_greninja'); },
    ...hands,
  },
  // Greninja 658: +1 hand; Protean: when a Blind is selected (the start of each round; not Blueprint) it becomes the type most common
  // among your other undebuffed Jokers (protean_pick: a tie, or no typed joker, keeps its current type); it keeps that type until the next
  // Blind (through the shop). Water Shuriken: X(1.5 + 0.5 for each OTHER joker of its current type) (`Xmult` / `Xmult_mod`, Energy +20%
  // each: 1.8 / 2.1 / 2.4 and 0.6 / 0.7 / 0.8). Its changing type never breaks Monotype (poke_mono_exempt, Castform's exemption); its
  // current type's Energy matches (Castform's rule), Colorless at half strength unless it is Colorless.
  greninja: {
    name: 'greninja', poke_sprite391: sprite('Natdex', 24, 43),
    config: { extra: { hands: 1, Xmult: 1.5, Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 6, blueprint_compat: true,
    attributes: ['starter', 'hands', 'xmult', 'types'], poke_after: 'frogadier',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.hands, r3(ex.Xmult), r3(ex.Xmult_mod), get_type(card) || ex.ptype, ninja_others(card), ninja_x(card)] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && !context.blueprint && !card.getting_sliced) {
        const t = protean_pick(card);
        if (t && protean_set(card, t)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Protean: ' + t + '!', colour: 'BLUE' });
        return undefined;
      }
      if (context.joker_main) { const x = ninja_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...hands,
  },
  // ---------------------------------------------------------------- Gen 6, batch 1 (the owner's "go ahead", 2026-11-02; contentRev 61)
  // 15 jokers, #661-678. Prices by the DESIGN_GUIDE slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7); evolution by
  // rounds (4 for an early evolver, else 5). Types = the cards'. Energy raises each joker's main number at the standard share; retriggers,
  // hand size, Foresight and the conversions are fixed; a stage with no number carries its evolution's field ("Energy carries to ...").
  // Art: upstream 3.9.1's own cells (Natdex {0..8,44}, {22..28,44}, {2,45}; Gen 6 sheet: Vivillon's 20 patterns, the Flabébé line's five
  // colours, Furfrou's trims, Meowstic Male / Female); nothing to deploy. Neither Nacho nor Pokermon+ has any of them.
  // Fletchling 661 (Colorless, Uncommon $6), Gale Wings: +8 Mult on the round's first hand (`mult` +40%: 11.2 / 14.4 / 17.6). Colorless, so
  // Starly's flock counts it. 4 rounds.
  fletchling: {
    name: 'fletchling', poke_sprite391: sprite('Natdex', 0, 44),
    config: { extra: { mult: 8, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'round_evo'], poke_after: 'diggersby',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), spark_state(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && spark_on()) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_fletchinder');
    },
  },
  // Fletchinder 662 (Fire: its card; Safari $8): X1.5 on the round's first hand (`Xmult` +20%: 1.8 / 2.1 / 2.4). 5 rounds.
  fletchinder: {
    name: 'fletchinder', poke_sprite391: sprite('Natdex', 2, 44),
    config: { extra: { Xmult: 1.5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'round_evo'], poke_after: 'fletchling',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), spark_state(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && spark_on()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return level_evo(self, card, context, 'j_poke_talonflame');
    },
  },
  // Talonflame 663 (Safari $10): X2.5 on the round's first hand (`Xmult` +20%: 3 / 3.5 / 4), and on that hand its first scored card retriggers
  // once (`retriggers`, fixed).
  talonflame: {
    name: 'talonflame', poke_sprite391: sprite('Natdex', 4, 44),
    config: { extra: { Xmult: 2.5, retriggers: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'retrigger'], poke_after: 'fletchinder',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult), spark_state()] }; },
    calculate(self, card, context) {
      const r = gale_retrigger(card, context);
      if (r) return r;
      if (context.joker_main && spark_on()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Scatterbug 664 (Grass, Uncommon $6): each scored Wild card +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 4 rounds.
  scatterbug: {
    name: 'scatterbug', poke_sprite391: sprite('Natdex', 6, 44),
    config: { extra: { mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'talonflame',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_wild); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (wild_scored(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_spewpa');
    },
  },
  // Spewpa 665 (Safari $8): when a Blind is selected, 1 random UNENHANCED card of the full deck becomes Wild (Sewaddle's tailor, its own seed;
  // none unenhanced: nothing; Blueprint copies it). Carries Vivillon's `Xmult_multi` ("Energy carries to Vivillon"). 4 rounds.
  spewpa: {
    name: 'spewpa', poke_sprite391: sprite('Natdex', 8, 44),
    config: { extra: { Xmult_multi: 1.3, rounds: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'scatterbug',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_wild); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) { tailor(card, context, ['m_wild'], 'poke_spewpa_wild'); return level_evo(self, card, context, 'j_poke_vivillon'); },
  },
  // Vivillon 666 (Safari $10): Spewpa's conversion, and each scored Wild card X1.3 (`Xmult_multi` +5%: 1.365 / 1.43 / 1.495). A pattern of 20,
  // rolled once (VIVILLON_PATTERNS), each its own 3.9.1 card.
  vivillon: {
    name: 'vivillon', poke_sprite391: sprite('Gen06', 2, 0),
    config: { extra: { Xmult_multi: 1.3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'spewpa',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_wild); return { vars: [r3(card.ability.extra.Xmult_multi), card.ability.extra.form || 1, VIVILLON_PATTERNS] }; },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = 1 + Math.floor(pseudorandom(pseudoseed('vivillon_pattern')) * VIVILLON_PATTERNS);
    },
    calculate(self, card, context) {
      tailor(card, context, ['m_wild'], 'poke_spewpa_wild');
      if (wild_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Flabébé 669 (Fairy, Uncommon $6), Garden Queen: each scored Queen +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). A flower colour rolled once
  // (FLOWERS), kept through the line, each its own 3.9.1 card. 4 rounds.
  flabebe: {
    name: 'flabebe', poke_sprite391: sprite('Gen06', 10, 3),
    config: { extra: { mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'rank', 'face', 'round_evo'], poke_after: 'pyroar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), FLOWER_NAME[flower_of(card)], ex.rounds] }; },
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom_element(FLOWERS, pseudoseed('flabebe_flower'))[0]; },
    calculate(self, card, context) {
      if (queen_scored(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_floette');
    },
  },
  // Floette 670 (Safari $8): scored Queens retrigger once (`retriggers`, fixed). Carries Florges' `Xmult_multi` ("Energy carries to Florges").
  // 5 rounds.
  floette: {
    name: 'floette', poke_sprite391: sprite('Gen06', 8, 4),
    config: { extra: { retriggers: 1, Xmult_multi: 1.25, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['retrigger', 'rank', 'face', 'round_evo'], poke_after: 'flabebe',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [FLOWER_NAME[flower_of(card)], ex.rounds] }; },
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom_element(FLOWERS, pseudoseed('flabebe_flower'))[0]; },
    calculate(self, card, context) {
      if (queen_scored(context, 'repetition')) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      return level_evo(self, card, context, 'j_poke_florges');
    },
  },
  // Florges 671 (Safari $10): scored Queens retrigger twice (`retriggers` 2, fixed), and each gives X1.25 (`Xmult_multi` +5%: 1.3125 / 1.375 /
  // 1.4375), every time it scores (X1.25 x3 a Queen).
  florges: {
    name: 'florges', poke_sprite391: sprite('Gen06', 8, 5),
    config: { extra: { retriggers: 2, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['retrigger', 'xmult', 'rank', 'face'], poke_after: 'floette',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.retriggers, r3(ex.Xmult_multi), FLOWER_NAME[flower_of(card)]] }; },
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom_element(FLOWERS, pseudoseed('flabebe_flower'))[0]; },
    calculate(self, card, context) {
      if (queen_scored(context, 'repetition')) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      if (queen_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Skiddo 672 (Grass, Common $5): +30 Chips, plus +10 for each OTHER Grass Joker (`chips` / `chips1` +30%: 39 / 48 / 57 and 13 / 16 / 19). 5 rounds.
  skiddo: {
    name: 'skiddo', poke_sprite391: sprite('Natdex', 22, 44),
    config: { extra: { chips: 30, chips1: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'types', 'round_evo'], poke_after: 'florges',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips1), grass_others(card), goat_chips(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = goat_chips(card); return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return level_evo(self, card, context, 'j_poke_gogoat');
    },
  },
  // Gogoat 673 (Safari $8): +1 hand size (fixed; Bulbasaur's add / remove); +60 Chips, plus +20 for each other Grass Joker (78 / 96 / 114 and
  // 26 / 32 / 38).
  gogoat: {
    name: 'gogoat', poke_sprite391: sprite('Natdex', 24, 44),
    config: { extra: { h_size: 1, chips: 60, chips1: 20 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'types', 'hand_size'], poke_after: 'skiddo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.chips), r3(ex.chips1), grass_others(card), goat_chips(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = goat_chips(card); return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return undefined;
    },
    ...hand_size,
  },
  // Pancham 674 (Fighting, Common $5), Iron Fist: each scored face card +3 Mult (`mult` +40%: 4.2 / 5.4 / 6.6). Evolves after 5 rounds, but only
  // at an end of round while you hold an undebuffed Dark Joker (pancham_evo); otherwise it waits.
  pancham: {
    name: 'pancham', poke_sprite391: sprite('Natdex', 26, 44),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'face', 'round_evo', 'condition_evo'], poke_after: 'gogoat',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult), ex.rounds, dark_held(card) ? 'has a Dark Joker' : 'needs a Dark Joker'] };
    },
    calculate(self, card, context) {
      if (face_scored(context)) return { mult: card.ability.extra.mult, card };
      return pancham_evo(self, card, context);
    },
  },
  // Pangoro 675 (Fighting: its card; Safari $8): each scored face card X1.3 (`Xmult_multi` +5%: 1.365 / 1.43 / 1.495).
  pangoro: {
    name: 'pangoro', poke_sprite391: sprite('Natdex', 28, 44),
    config: { extra: { Xmult_multi: 1.3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'face'], poke_after: 'pancham',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (face_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Furfrou 676 (Colorless, Rare $7, single-stage), Trim: a new trim each Ante (TRIMS; never the same twice running), its suit's scored cards
  // +20 Chips and +4 Mult each (`chips` +30%: 26 / 32 / 38; `mult` +40%: 5.6 / 7.2 / 8.8). Each trim draws its own 3.9.1 card.
  furfrou: {
    name: 'furfrou', poke_sprite391: sprite('Gen06', 6, 6),
    config: { extra: { chips: 20, mult: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'mult', 'suit'], poke_after: 'pangoro',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, t = trim_of(card);
      return { vars: [r3(ex.chips), r3(ex.mult), t ? TRIMS[t].name : 'picked when obtained', t ? localize(TRIMS[t].suit, 'suits_plural') : ''], colours: [t ? TRIMS[t].suit : 'inactive'] };
    },
    add_to_deck(self, card) { if (!trim_of(card)) furfrou_trim(card); },
    calculate(self, card, context) {
      // (a new Ante: queued after ease_ante's own event, so the pick is seeded by the new Ante)
      if (context.ante_change && !context.blueprint) {
        G.E_MANAGER.add_event(() => {
          const t = furfrou_trim(card);
          card_eval_status_text(card, 'extra', null, null, null, { message: TRIMS[t].name + '!', colour: 'FILTER' });
        });
        return undefined;
      }
      if (trim_scored(card, context)) return { chips: card.ability.extra.chips, mult: card.ability.extra.mult, card };
      return undefined;
    },
  },
  // Espurr 677 (Psychic, Common $5): +1 Foresight (fixed). Carries Meowstic's `Xmult_mod` ("Energy carries to Meowstic": re-applied to both of
  // a Female's fields; not its `Xmult` too, which evolution would copy over AND re-energize, Fennekin's way). 5 rounds.
  espurr: {
    name: 'espurr', poke_sprite391: sprite('Natdex', 2, 45),
    config: { extra: { scry: 1, Xmult_mod: 0.25, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 6, blueprint_compat: false,
    attributes: ['foresight', 'round_evo'], poke_after: 'furfrou',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.rounds] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_meowstic'); },
    ...scry,
  },
  // Meowstic 678 (Safari $8): its gender rolled when it evolves (or is created), stored, its own 3.9.1 card. Male, Prankster: at end of round
  // a random Tarot (must have room; not Blueprint); no Energy. Female: X1.5, plus X0.25 for each Tarot held (`Xmult` / `Xmult_mod` +20%: 1.8 /
  // 2.1 / 2.4 and 0.3 / 0.35 / 0.4).
  meowstic: {
    name: 'meowstic', poke_sprite391: sprite('Gen06', 2, 8),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'tarot', 'generation'], poke_after: 'espurr',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      if (!meow_female(card)) return { vars: [], key: 'j_poke_meowstic' };
      return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), tarots_held(), meow_x(card)], key: 'j_poke_meowstic_female' };
    },
    set_ability(self, card, initial) {
      if (!initial) return;
      const ex = card.ability.extra;
      ex.form = pseudorandom(pseudoseed('meowstic_gender')) < 0.5 ? 'female' : 'male';
      if (ex.form === 'male') { delete ex.Xmult; delete ex.Xmult_mod; }
    },
    calculate(self, card, context) {
      prankster_tarot(card, context);
      if (context.joker_main && meow_female(card)) { const x = meow_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // ---------------------------------------------------------------- Gen 6, batch 2 (contentRev 62; the owner's "Yes", 2026-11-02), #682-715
  // Spritzee 682 (Fairy, Common $5), Healing Aroma: each scored Lucky card earns $1 (`aroma_money`, fixed: Energy-inert). 5 rounds.
  spritzee: {
    name: 'spritzee', poke_sprite391: sprite('Natdex', 12, 45),
    config: { extra: { aroma_money: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 6, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'enhancements', 'round_evo'], poke_after: 'aegislash',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.aroma_money, ex.rounds] }; },
    calculate(self, card, context) { return healing_aroma(card, context) || level_evo(self, card, context, 'j_poke_aromatisse'); },
  },
  // Aromatisse 683 (Safari $8): each scored Lucky card earns $2, and Aroma Veil: Lucky cards' odds +1 (Pidove's Super Luck: the numerator
  // of both rolls, before Oops! doubles it; stacks with Pidove's line and other copies, +1 each). Money and odds fixed: Energy-inert.
  aromatisse: {
    name: 'aromatisse', poke_sprite391: sprite('Natdex', 14, 45),
    config: { extra: { aroma_money: 2, lucky_odds: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 6, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'chance', 'enhancements'], poke_after: 'spritzee',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.aroma_money, ex.lucky_odds, ...lucky_odds_vars(card)] }; },
    calculate(self, card, context) { return super_luck(card, context) || healing_aroma(card, context); },
  },
  // Swirlix 684 (Fairy, Common $5), Sweet Veil: permanently +1 Mult per Tarot used (`sweet_mult` banked; gain `mult_mod` +20%: 1.2 / 1.4 /
  // 1.6). 5 rounds; the bank carries into Slurpuff.
  swirlix: {
    name: 'swirlix', poke_sprite391: sprite('Natdex', 16, 45),
    config: { extra: { sweet_mult: 0, mult_mod: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'tarot', 'round_evo'], poke_after: 'aromatisse',
    poke_custom_values_to_keep: ['sweet_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.sweet_mult), ex.rounds] }; },
    calculate(self, card, context) { return sweet_veil(card, context) || level_evo(self, card, context, 'j_poke_slurpuff'); },
  },
  // Slurpuff 685 (Safari $8): +2 Mult per Tarot used (`mult_mod` +20%: 2.4 / 2.8 / 3.2) on Swirlix's bank, and +1 consumable slot (fixed).
  slurpuff: {
    name: 'slurpuff', poke_sprite391: sprite('Natdex', 18, 45),
    config: { extra: { sweet_mult: 0, mult_mod: 2, card_limit: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'tarot', 'consumable_slot'], poke_after: 'swirlix',
    poke_custom_values_to_keep: ['sweet_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.card_limit, r3(ex.mult_mod), r3(ex.sweet_mult)] }; },
    calculate(self, card, context) { return sweet_veil(card, context); },
    ...sweet_slot,
  },
  // Inkay 686 (Dark, Common $5): each scored 2, 3, 4 or 5 gives +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  inkay: {
    name: 'inkay', poke_sprite391: sprite('Natdex', 20, 45),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'rank', 'round_evo'], poke_after: 'slurpuff',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return inkay_low(card, context) || level_evo(self, card, context, 'j_poke_malamar'); },
  },
  // Malamar 687 (Safari $8), Topsy-Turvy: every scored card gives the Chips of its flipped rank instead of its own (the chip_bonus hook,
  // malamar_chip_bonus). r73 (the owner's buff): each scored 2, 3, 4 or 5 also gives X1.25 (`Xmult_multi` +5%: 1.313 / 1.375 / 1.438;
  // malamar_low_x). r62-r72 it had no number (Energy-inert): on those rules set_ability deletes the field, so an Energy skips it as before.
  // Blueprint: the flip is a rule (nothing to copy), and it still copies nothing.
  malamar: {
    name: 'malamar', poke_sprite391: sprite('Natdex', 22, 45),
    config: { extra: { Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 6, blueprint_compat: false,
    attributes: ['chips', 'xmult', 'rank', 'modify_card'], poke_after: 'inkay',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const x = card.ability.extra.Xmult_multi; return { vars: [r3(typeof x === 'number' ? x : self.config.extra.Xmult_multi)] }; },
    set_ability(self, card) { if (!malamar_x73()) delete card.ability.extra.Xmult_multi; },
    calculate(self, card, context) { return malamar_low_x(card, context); },
  },
  // Binacle 688 (Earth, Common $5): each scored 7 gives +20 Chips (`chips` +30%: 26 / 32 / 38). 5 rounds.
  binacle: {
    name: 'binacle', poke_sprite391: sprite('Natdex', 24, 45),
    config: { extra: { chips: 20, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'rank', 'round_evo'], poke_after: 'malamar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return seven_rocks(card, context, false) || level_evo(self, card, context, 'j_poke_barbaracle'); },
  },
  // Barbaracle 689 (Safari $8): each scored 7 gives +20 Chips and X1.3 (`chips` +30%: 26 / 32 / 38; `Xmult_multi` +5%: 1.365 / 1.43 / 1.495).
  barbaracle: {
    name: 'barbaracle', poke_sprite391: sprite('Natdex', 26, 45),
    config: { extra: { chips: 20, Xmult_multi: 1.3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'rank'], poke_after: 'binacle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return seven_rocks(card, context, true); },
  },
  // Skrelp 690 (Dark, Common $5), Poison Point: when a Blind is selected, 1 random deck card becomes a Hazard card (unenhanced first); +3
  // Mult per Hazard card in the full deck (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  skrelp: {
    name: 'skrelp', poke_sprite391: sprite('Natdex', 28, 45),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'hazards', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'barbaracle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult * hazards_in_deck()), ex.rounds] }; },
    calculate(self, card, context) {
      skrelp_poison(card, context);
      if (context.joker_main) { const m = r3(card.ability.extra.mult * hazards_in_deck()); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return level_evo(self, card, context, 'j_poke_dragalge');
    },
  },
  // Dragalge 691 (Safari $8): the same conversion; each Hazard card held in hand gives X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38). Its
  // Stage 1 swaps Skrelp's deck count for the held X (the spec's "the same conversion, and ...").
  dragalge: {
    name: 'dragalge', poke_sprite391: sprite('Natdex', 0, 46),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'hazards', 'modify_card', 'full_deck'], poke_after: 'skrelp',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { skrelp_poison(card, context); return hazard_held_x(card, context); },
  },
  // Tyrunt 696 (Dragon: its card; Common $5), Ancient Kings: 1+ +5 Mult (`mult` +40%: 7 / 9 / 11), 2+ X1.25 (`Xmult` +20%: 1.5 / 1.75 / 2),
  // 3+ every scored King retriggers once (fixed). Evolves after its 3+ tier fires 5 times.
  tyrunt: {
    name: 'tyrunt', poke_sprite391: sprite('Natdex', 10, 46),
    config: { evo_rqmt: 5, extra: { rank: 'King', mult: 5, Xmult: 1.25, retriggers: 1, third_times: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'retrigger', 'ancient', 'rank', 'face', 'trigger_evo'], poke_after: 'dragalge',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.mult), r3(ex.Xmult), Math.max(0, self.config.evo_rqmt - (ex.third_times || 0))] };
    },
    calculate(self, card, context) {
      return ancient_kings(card, context) || scaling_evo(self, card, context, 'j_poke_tyrantrum', card.ability.extra.third_times || 0, self.config.evo_rqmt);
    },
  },
  // Tyrantrum 697 (Safari $8): Tyrunt's tiers, the same numbers, and 4+ X2 (`Xmult2` +20%: 2.4 / 2.8 / 3.2).
  tyrantrum: {
    name: 'tyrantrum', poke_sprite391: sprite('Natdex', 12, 46),
    config: { extra: { rank: 'King', mult: 5, Xmult: 1.25, retriggers: 1, Xmult2: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'retrigger', 'ancient', 'rank', 'face'], poke_after: 'tyrunt',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.mult), r3(ex.Xmult), r3(ex.Xmult2)] };
    },
    calculate(self, card, context) { return ancient_kings(card, context); },
  },
  // Amaura 698 (Earth: its card; Common $5), Ancient Queens: 1+ +40 Chips (`chips` +30%: 52 / 64 / 76), 2+ the leftmost scored Queen that
  // isn't Glass becomes Glass (before scoring), 3+ earn $3 (`ancient_money`, fixed). Evolves after its 3+ tier fires 5 times.
  amaura: {
    name: 'amaura', poke_sprite391: sprite('Natdex', 14, 46),
    config: { evo_rqmt: 5, extra: { rank: 'Queen', chips: 40, ancient_money: 3, third_times: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'money', 'ancient', 'rank', 'face', 'modify_card', 'enhancements', 'trigger_evo'], poke_after: 'tyrantrum',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank); info_queue.push(P_CENTERS.m_glass);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.chips), ex.ancient_money, Math.max(0, self.config.evo_rqmt - (ex.third_times || 0))] };
    },
    calculate(self, card, context) {
      return ancient_queens(card, context) || scaling_evo(self, card, context, 'j_poke_aurorus', card.ability.extra.third_times || 0, self.config.evo_rqmt);
    },
  },
  // Aurorus 699 (Safari $8): Amaura's tiers, the same numbers, and 4+ X2 (`Xmult2` +20%: 2.4 / 2.8 / 3.2).
  aurorus: {
    name: 'aurorus', poke_sprite391: sprite('Natdex', 16, 46),
    config: { extra: { rank: 'Queen', chips: 40, ancient_money: 3, Xmult2: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'money', 'ancient', 'rank', 'face', 'modify_card', 'enhancements'], poke_after: 'amaura',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank); info_queue.push(P_CENTERS.m_glass);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.chips), ex.ancient_money, r3(ex.Xmult2)] };
    },
    calculate(self, card, context) { return ancient_queens(card, context); },
  },
  // Hawlucha 701 (Fighting, Rare $7, single-stage), Flying Press: the first and the last scored card each retrigger once (a lone scored card
  // once in all). Retriggers fixed: Energy-inert.
  hawlucha: {
    name: 'hawlucha', poke_sprite391: sprite('Natdex', 20, 46),
    config: { extra: { retriggers: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 6, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger'], poke_after: 'sylveon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) { return flying_press(card, context); },
  },
  // Klefki 707 (Metal, Rare $7, single-stage), Key Ring: X1, plus X0.25 for each Voucher redeemed this run (`Xmult_mod` +20%: 0.3 / 0.35 /
  // 0.4; read from the run's record, so it is never banked: Energy raises every Voucher's share at once).
  klefki: {
    name: 'klefki', poke_sprite391: sprite('Natdex', 2, 47),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'shop'], poke_after: 'hawlucha',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), vouchers_redeemed(), key_ring_x(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = key_ring_x(card); return x > 1 ? { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x } : undefined; }
      return undefined;
    },
  },
  // Phantump 708 (Grass: its card; Common $5), Forest's Curse: permanently +3 Mult per playing card destroyed (`curse_mult` banked; gain
  // `mult_mod` +20%: 3.6 / 4.2 / 4.8). 5 rounds; the bank carries into Trevenant.
  phantump: {
    name: 'phantump', poke_sprite391: sprite('Natdex', 4, 47),
    config: { extra: { curse_mult: 0, mult_mod: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'destroy_card', 'round_evo'], poke_after: 'klefki',
    poke_custom_values_to_keep: ['curse_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.curse_mult), ex.rounds] }; },
    calculate(self, card, context) { return forest_curse(card, context, false) || level_evo(self, card, context, 'j_poke_trevenant'); },
  },
  // Trevenant 709 (Safari $8): +5 Mult per card destroyed (`mult_mod` +20%: 6 / 7 / 8) on Phantump's bank; each destroyed card plants a Seed
  // (a random unenhanced deck card becomes a Seed card).
  trevenant: {
    name: 'trevenant', poke_sprite391: sprite('Natdex', 6, 47),
    config: { extra: { curse_mult: 0, mult_mod: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'destroy_card', 'modify_card', 'enhancements'], poke_after: 'phantump',
    poke_custom_values_to_keep: ['curse_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_seed); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.curse_mult)] }; },
    calculate(self, card, context) { return forest_curse(card, context, true); },
  },
  // Bergmite 712 (Water: its card; Common $5): +50 Chips (`chips` +30%: 65 / 80 / 95). 5 rounds.
  bergmite: {
    // (+ regional batch C: a Earth Energy used on it evolves it into Hisuian Avalugg — systems/energy.js energy_evo_target, from HISUI_REV)
    poke_energy_evo: { etype: 'Earth', into: 'j_poke_hisuian_avalugg', rev: HISUI_REV },
    name: 'bergmite', poke_sprite391: sprite('Natdex', 12, 47),
    config: { extra: { chips: 50, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'round_evo'], poke_after: 'gourgeist',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_avalugg');
    },
  },
  // Avalugg 713 (Safari $8), Iceberg: +150 Chips (`chips` +30%: 195 / 240 / 285) and X1.5 on the round's final hand (`Xmult` +20%: 1.8 /
  // 2.1 / 2.4).
  avalugg: {
    name: 'avalugg', poke_sprite391: sprite('Natdex', 14, 47),
    config: { extra: { chips: 150, Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 6, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'hands'], poke_after: 'bergmite',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult), G.GAME && G.GAME.facing_blind && G.GAME.current_round.hands_left <= 1 ? 'Active!' : 'Inactive'] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra, r = { chip_mod: ex.chips, message: a_chips(r3(ex.chips)), colour: 'CHIPS' };
      if (G.GAME.facing_blind && final_hand()) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      return r;
    },
  },
  // Noibat 714 (Dragon, Common $5), Supersonic: +1 hand size (fixed); Glass cards break twice as often (r69: each copy doubles the
  // numerator, stacking as Oops! does: 1 in 2, two copies always; fixed); each Glass card that breaks permanently gives it +2 Mult (`bat_mult` banked; gain `mult_mod` +20%: 2.4 / 2.8 / 3.2). 5 rounds.
  noibat: {
    name: 'noibat', poke_sprite391: sprite('Natdex', 16, 47),
    config: { extra: { h_size: 1, bat_mult: 0, mult_mod: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_size', 'chance', 'enhancements', 'round_evo'], poke_after: 'avalugg',
    poke_custom_values_to_keep: ['bat_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [ex.h_size, ...glass_odds_vars(card), r3(ex.mult_mod), r3(ex.bat_mult), ex.rounds] }; },
    calculate(self, card, context) { return supersonic(card, context) || boomburst(card, context, false) || level_evo(self, card, context, 'j_poke_noivern'); },
    ...hand_size,
  },
  // Noivern 715 (Safari $8), Boomburst: +2 hand size, Glass still doubled (stacking with every other Noibat / Noivern); each Glass card that breaks permanently gives it X0.1 (`bat_Xmult`
  // banked from X1; gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16; Noibat's Mult kept and still given), and turns a random deck card Glass.
  noivern: {
    name: 'noivern', poke_sprite391: sprite('Natdex', 18, 47),
    config: { extra: { h_size: 2, bat_mult: 0, bat_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'hand_size', 'chance', 'enhancements', 'modify_card'], poke_after: 'noibat',
    poke_custom_values_to_keep: ['bat_mult', 'bat_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [ex.h_size, ...glass_odds_vars(card), r3(ex.Xmult_mod), r3(ex.bat_Xmult), r3(ex.bat_mult)] }; },
    calculate(self, card, context) { return supersonic(card, context) || boomburst(card, context, true); },
    ...hand_size,
  },
};
