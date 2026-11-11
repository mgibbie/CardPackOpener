// designs/gen3.js — the owner's Generation 3 Pokermon jokers and the helpers only they use, cut out of
// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every definition is unchanged. Helpers shared with another
// generation are in common.js. The jokers are REGISTERED by ../pokejokers_designs.js (in the old file's order: BATCHES there);
// a NEW joker is just added to JOKERS below and registers after them.
import {
  G, scale_card, P_CENTERS, detailed, card_eval_status_text, has_enhancement, has_no_rank, poke_remove_card, ease_dollars, pseudoseed,
  pseudorandom_element, localize, is_type, type_tooltip, energy_values, ease_hands_played, ease_discard, find_card, level_evo, scaling_evo,
  juice_card_until,
} from '../../api.js';
import {
  CASTFORM_FORMS, REGIS, a_chips, a_mult, a_xmult, castform_lock, cosmic, discards, evolved_tarot, first_deal, forecast, giga_awake, hands,
  hands_discards, is_day, next_is_day, primal_on, primal_read, r3, r9, round_end, solo59, sprite, stock_max, sync_kecleons, trio111, unbroken,
  volcarona_sun,
} from './common.js';


/** Spheal line, Rollout: a streak (0..max) of the same poker hand in a row this round; Chips = chips x 2^streak. */
function rollout(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    ex.streak = ex.last_hand === context.scoring_name ? Math.min(ex.max_streak, ex.streak + 1) : 0;
    ex.last_hand = context.scoring_name;
  }
  if (round_end(context) && !context.blueprint) { ex.streak = 0; ex.last_hand = undefined; }
  return undefined;
}
const rollout_chips = (ex) => ex.chips * Math.pow(2, ex.streak || 0);
function rollout_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, chips = rollout_chips(ex);
  if (ex.Xmult && ex.streak >= ex.max_streak) return { message: 'Sheer Cold!', colour: 'XMULT', chip_mod: chips, Xmult_mod: ex.Xmult };
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}

/** Whismur line: how many Glass cards broke (their 1 in 4 shatter; Glass Joker's count — remove_playing_cards, the `shattered`
 *  ones), each growing `ref` by its gain `mod` (Energy scales only the gain; the totals are in fields energize ignores, so a
 *  banked amount keeps what it was worth when earned). Not Blueprint (it scales, as Glass Joker). */
function glass_grow(card, context, ref, mod, message_key) {
  if (context.remove_playing_cards && !context.blueprint && context.removed) {
    const n = context.removed.filter((c) => c.shattered).length;
    if (n > 0) scale_card(card, { ref_value: ref, scalar_value: mod, scalar_factor: n, message_key, message_colour: message_key === 'a_chips' ? 'CHIPS' : message_key === 'a_mult' ? 'MULT' : 'XMULT' });
  }
  return undefined;
}
/** Whismur line: the Chips (Whismur's), the Mult (Loudred's) and the X Mult (Exploud's) this form has. */
function glass_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.glass_chips) r.chip_mod = ex.glass_chips;
  if (ex.glass_mult) r.mult_mod = ex.glass_mult;
  if (ex.glass_Xmult && ex.glass_Xmult !== 1) r.Xmult_mod = ex.glass_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : r.mult_mod ? a_mult(r.mult_mod) : a_chips(r.chip_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : r.mult_mod ? 'MULT' : 'CHIPS';
  return r;
}
const glass_evolved = (card, context, from) => evolved_tarot(card, context, from, 'c_justice');
const glass_tips = (info_queue, evolves) => {
  info_queue.push(P_CENTERS.m_glass);
  if (evolves && detailed()) { info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } }); info_queue.push(P_CENTERS.c_justice); }
};
const stock_mult = (ex) => ex.stockpile_mult * ex.stockpile;
/** Gulpin / Swalot: a scored Diamond card gives +stockpile_mult Mult per Stockpile (Blueprint copies it). */
function stockpile_mult(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && card.ability.extra.stockpile > 0 && context.other_card.is_suit('Diamonds')) {
    return { mult: stock_mult(card.ability.extra), card };
  }
  return undefined;
}
/** Swalot: X1 + Xmult_mod per card the full deck is below the run's starting size (Erosion's count), never below X1. */
const swalot_x = (ex) => {
  const below = G.GAME && G.playing_cards ? (G.GAME.starting_deck_size || 0) - G.playing_cards.length : 0;
  return Math.max(1, 1 + ex.Xmult_mod * Math.max(0, below));
};
const swallowable = (c) => !c.destroyed && !c.shattered && !c.removed && !c.poke_swallowed;
/** Gulpin / Swalot, end of round: swallow the leftmost held Hazard (else the leftmost held Diamond — a debuffed one isn't a Diamond,
 *  as is_suit) through Pokermon's poke_remove_card (dissolve, remove_playing_cards: Qwilfish / Spiritomb count it as any destroyed
 *  card); +1 Stockpile below max. At max, Gulpin leaves the Diamonds alone; Swalot still swallows one for its rank in $. The Hazard's
 *  own 1 in 3 roll later this pass skips it (`poke_swallowed`, enhancement1.js). Once per round: not Blueprint, not a joker retrigger. */
function swallow(card, context, swalot) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  const ex = card.ability.extra, room = ex.stockpile < stock_max(ex);
  let target = G.hand.cards.find((c) => swallowable(c) && has_enhancement(c, 'm_poke_hazard'));
  let dollars = 0;
  if (!target && (room || swalot)) {
    target = G.hand.cards.find((c) => swallowable(c) && c.is_suit('Diamonds'));
    if (target && swalot && !has_no_rank(target)) dollars = target.get_id();
  }
  if (!target) return;
  target.poke_swallowed = true;
  poke_remove_card(target, card);
  if (room) ex.stockpile = ex.stockpile + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: room ? 'Stockpile!' : 'Swallow!', colour: 'MULT' });
  if (dollars > 0) { ease_dollars(dollars); card_eval_status_text(card, 'dollars', dollars); }
}
/** Trapinch / Vibrava, Sand Pit: every card the PLAYER discards (the pre_discard context of a real discard: `hook` is set by every
 *  effect that discards for you — The Hook, Pokermon's seals, Bunco / MoreFluff blinds — and those don't count) banks +chip_mod Chips
 *  on the joker (`sand_chips`, in no energy_values: a banked Chip keeps what it was worth when earned) and counts toward evolution
 *  (`sand_cards`). A discard of N cards counts N. Not Blueprint (it scales). */
function sand_pit(card, context) {
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && context.full_hand && context.full_hand.length) {
    const ex = card.ability.extra, n = context.full_hand.length;
    let gained = 0;
    scale_card(card, {
      ref_value: 'sand_chips', scalar_value: 'chip_mod', scalar_factor: n, no_message: true,
      operation: (t, k, v, change) => { t[k] = r3(v + change); gained = change; },
    });
    ex.sand_cards = (ex.sand_cards || 0) + n;
    card_eval_status_text(card, 'extra', null, null, null, { message: a_chips(r3(gained)), colour: 'CHIPS' });
  }
  return undefined;
}
/** Trapinch / Vibrava / Flygon: the banked Chips, every hand (Blueprint copies them). */
function sand_main(card, context) {
  const ex = card.ability.extra;
  if (!context.joker_main) return undefined;
  const x = ex.Xmult_mod !== undefined ? sandstorm_x(ex) : 1;
  const r = {};
  if (ex.sand_chips > 0) r.chip_mod = ex.sand_chips;
  if (x > 1) r.Xmult_mod = x;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(x) : a_chips(r.chip_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : 'CHIPS';
  return r;
}
/** Flygon, Sandstorm: X(1 + Xmult_mod per discard used this round). A discard USE counts once however many cards it had; effect
 *  discards (hook) never raise discards_used; it is 0 again each round (run.js new round). */
const sandstorm_x = (ex) => r3(1 + ex.Xmult_mod * ((G.GAME && G.GAME.current_round && G.GAME.current_round.discards_used) || 0));

/** Spoink / Grumpig, Pearl: at the end of the round, a random card held in hand with no seal gains a Pink Seal (the run's seeded RNG;
 *  none unsealed: nothing). Once per round: not Blueprint, not a joker retrigger, not on a game over. */
function pearl(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  const bare = G.hand.cards.filter((c) => !c.seal && !c.destroyed && !c.shattered && !c.removed);
  if (!bare.length) return;
  const target = pseudorandom_element(bare, pseudoseed('poke_spoink_pearl'))[0];
  target.set_seal('poke_pink_seal');
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Pearl!', colour: 'pink' });
}
/** Spoink / Grumpig: the banked X Mult (`pink_Xmult`, in no energy field), every hand (Blueprint copies it). */
function pearl_main(card, context) {
  const x = card.ability.extra.pink_Xmult;
  if (context.joker_main && x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
  return undefined;
}
/** Grumpig's gain for the current hand: Xmult_mod for a hand with a Pink Seal trigger, twice that (Black Pearl) when one of them had no
 *  room for its Energy — once per hand, the overflow gain replacing the normal one (G.GAME.hands_played names the hand: it only goes up
 *  after the hand has scored). */
function grumpig_gain(card, overflow) {
  const ex = card.ability.extra, hand_no = G.GAME.hands_played || 0;
  if (ex.pink_hand !== hand_no) { ex.pink_hand = hand_no; ex.pink_gain = 0; }
  const want = overflow ? 2 * ex.Xmult_mod : ex.Xmult_mod;
  if (want <= (ex.pink_gain || 0) + 1e-12) return;
  const add = want - (ex.pink_gain || 0);
  ex.pink_gain = want;
  ex.pink_Xmult = r3(ex.pink_Xmult + add);
  card_eval_status_text(card, 'extra', null, null, null, { message: overflow ? 'Black Pearl!' : localize('k_upgrade_ex'), colour: 'XMULT' });
}
const pink_tip = (info_queue) => info_queue.push({ key: 'poke_pink_seal_seal', set: 'Other' });
/** Castform takes a form: its own Pokermon type (ability.extra.ptype, which energy_matches, is_type and find_pokemon_type read)
 *  becomes the form's. A Tera sticker still overrides it, as on any joker. Its debuff is re-evaluated (as Kecleon's set_type). */
function castform_set_form(card, form) {
  const ex = card.ability.extra, f = CASTFORM_FORMS[form] || CASTFORM_FORMS.normal;
  const changed = ex.form !== form || ex.ptype !== f.ptype;
  ex.form = form;
  ex.ptype = f.ptype;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
}
/** Rainy: the first Club among the scoring cards (a debuffed one isn't a Club: is_suit). */
const first_club = (context) => (context.scoring_hand || []).find((c) => c.is_suit('Clubs'));
/** The half-strength cross-coverage, derived so Energy keeps the ratio: half the Chips; X1 + (X - 1) / 2. */
const sun_half = (ex) => ex.chips / 2;
const moon_half = (ex) => 1 + (ex.Xmult - 1) / 2;

// The owner's Barboach line (Muddy Water / Earthquake): a joker counts when it is Water OR Earth by Pokermon's own is_type (its ptype,
// a Tera sticker, Castform's current form, an add-on's IS_TYPE_RULES), ONCE however many of the two it is, and only while it isn't
// debuffed (a debuffed joker does nothing this hand; NOTE Pelipper / Politoed / Corsola count through find_pokemon_type, which counts
// debuffed jokers too — this line deliberately doesn't). Itself always counts (+1), so the shop / collection card shows the number
// it would give once bought.
const muddy = (j) => !j.debuff && (is_type(j, 'Water') || is_type(j, 'Earth'));
const muddy_others = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && muddy(j)).length;
const muddy_count = (card) => muddy_others(card) + 1;
function muddy_main(card, context) {
  if (!context.joker_main) return undefined;
  const chips = r3(card.ability.extra.chips * muddy_count(card));
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}
/** Whiscash, Earthquake: on the round's first hand, with quake_req+ OTHER Water / Earth Jokers, every scored card retriggers. */
const quake_on = (card) => muddy_others(card) >= card.ability.extra.quake_req;
function quake_state(card) {
  const ex = card.ability.extra, n = muddy_others(card);
  if (n < ex.quake_req) return 'Inactive: ' + n + '/' + ex.quake_req + ' others';
  if (G.GAME && G.GAME.facing_blind && G.GAME.current_round && G.GAME.current_round.hands_played > 0) return 'Used this round';
  return 'Active!';
}
/** Regi Trio: how many OTHER Regi species you have (undebuffed). Distinct species: two Regices (Showman) are one "other Regi" for
 *  a Regirock, and a Regice never counts its own twin. */
export function regi_others(card) {
  const own = card.config.center.key, seen = new Set();
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const k = j.config.center.key;
    if (j !== card && !j.debuff && k !== own && REGIS.includes(k)) seen.add(k);
  }
  return seen.size;
}
/** A Regi's own base conversion (1; Regice's `glass_convert`, +1 per Energy, floored). */
const regi_base = (card) => Math.floor((card.ability.extra.glass_convert || 1) + 1e-9);
/** The Blind being selected / played is a Boss Blind. */
const boss_blind = () => !!(G.GAME && G.GAME.blind && G.GAME.blind.boss);
/** Cards this Regi converts when a Blind is selected: its base, +1 when that Blind is a BOSS Blind (Regi Trio, contentRev 59: solo).
 *  Before r59: + the other Regi species held (regi_others) + 1 with all three and an awake Regigigas (giga_trio_bonus). */
const regi_converts = (card, boss = boss_blind()) => regi_base(card) + (solo59() ? (boss ? 1 : 0) : regi_others(card) + giga_trio_bonus(card));
/** When a Blind is selected: `n` random cards of the FULL deck (G.playing_cards, the run's seeded pseudorandom_element) become `enh`.
 *  Unenhanced cards first; once none is left, any card that isn't already `enh` (overwriting its enhancement; seal and edition kept).
 *  Never a card that already is `enh`. Blueprint copies it (as Marble Joker). */
function regi_convert(card, context, enh, seed, word) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const n = regi_converts(card);
  let done = 0;
  for (let i = 0; i < n; i++) {
    const live = (G.playing_cards || []).filter(unbroken);
    const plain = live.filter((c) => c.config.center.key === 'c_base');
    const pool = plain.length ? plain : live.filter((c) => c.config.center.key !== enh);
    if (!pool.length) break;
    const [pick] = pseudorandom_element(pool, pseudoseed(seed));
    pick.set_ability(P_CENTERS[enh], null, true);
    done++;
  }
  if (done) card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+' + done + ' ' + word, colour: 'CHIPS' });
}
const regi_tips = (self, info_queue, card, enh) => { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS[enh]); };
const TRIO_FIELDS = { j_poke_kyogre: { add: 'Xmult_multi' }, j_poke_primal_kyogre: { add: 'Xmult_multi' }, j_poke_primal_groudon: { add: 'Xmult_multi2', old: 'Xmult_multi' } };
/** set_ability: keep only the fields this card's rules rev reads. */
function trio_set(self, card) {
  const f = TRIO_FIELDS[self.key], ex = card.ability.extra;
  if (!f || !ex) return;
  if (trio111()) { if (f.old) delete ex[f.old]; } else delete ex[f.add];
}
/** A card made on an old rev, now on r111: its new field from the base, with the Energy it holds (energize's evolving formula). */
function trio_fields(card) {
  const f = TRIO_FIELDS[card.config.center.key], ex = card.ability.extra;
  if (!f || !trio111() || typeof ex[f.add] === 'number') return;
  const base = card.config.center.config.extra[f.add], per = energy_values[f.add];
  const n = ex.ptype !== 'Colorless' && !card.ability.colorless_sticker ? per * (ex.energy_count || 0) + per / 2 * (ex.c_energy_count || 0) : per * ((ex.energy_count || 0) + (ex.c_energy_count || 0));
  ex[f.add] = base + base * n * (ex.escale || 1);
  if (f.old) delete ex[f.old];
}
/** The X a trio card gives now (the tooltip's too, before trio_fields has run). */
const trio_x = (card) => {
  const f = TRIO_FIELDS[card.config.center.key], ex = card.ability.extra, k = !trio111() && f.old ? f.old : f.add;
  return typeof ex[k] === 'number' ? ex[k] : card.config.center.config.extra[k];
};
/** Kyogre's +hands / Groudon's +d_size each round (the Squirtle / Charmander pairs), except while it is the round's clash loser:
 *  bought (or made) then, it gives nothing this round; sold then, it takes back only what is still given. */
const primal_bonus = (field) => {
  const give = (n) => (field === 'hands' ? ease_hands_played(n) : ease_discard(n));
  const reset = (n) => { if (field === 'hands') G.GAME.round_resets.hands += n; else G.GAME.round_resets.discards += n; };
  return {
    add_to_deck(self, card, from_debuff) {
      const ex = card.ability.extra, n = ex[field];
      reset(n);
      if (from_debuff) return;
      if (!primal_on(card)) { ex.primal_off = G.GAME.round; ex.primal_taken = n; return; }
      give(n);
    },
    remove_from_deck(self, card) {
      const ex = card.ability.extra, n = ex[field], cr = G.GAME.current_round;
      reset(-n);
      const still = ex.primal_off === G.GAME.round && G.GAME.facing_blind ? n - (ex.primal_taken || 0) : n;
      const dec = field === 'hands' ? Math.min(cr.hands_left - 1, still) : Math.min(cr.discards_left, still);
      if (dec > 0) give(-dec);
    },
  };
};
/** Kyogre / Primal Kyogre: before r111 the first deal reads the Primal Clash and the Club retrigger waits on primal_on; from r111 the
 *  Clubs retrigger and give X (trio_x) with no clash. */
function kyogre_calc(card, context) {
  const ex = card.ability.extra, now = trio111();
  if (now) trio_fields(card);
  if (first_deal(card, context)) { ex.forecast_round = G.GAME.round; if (!now) primal_read(); return undefined; }
  if (context.repetition && !context.end_of_round && context.cardarea === G.play && primal_on(card) && context.other_card.is_suit('Clubs')) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  if (now && context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Clubs')) return { x_mult: trio_x(card), card };
  return undefined;
}
/** Groudon / Primal Groudon: scored Hearts / Diamonds give X (Groudon's Xmult_multi; Primal Groudon's trio_x from r111, X1.5 before). */
function groudon_calc(card, context) {
  const ex = card.ability.extra, now = trio111();
  if (now) trio_fields(card);
  if (first_deal(card, context)) { ex.forecast_round = G.GAME.round; if (!now) primal_read(); return undefined; }
  if (context.individual && context.cardarea === G.play && !context.end_of_round && primal_on(card)
    && (context.other_card.is_suit('Hearts') || context.other_card.is_suit('Diamonds'))) return { x_mult: TRIO_FIELDS[card.config.center.key] ? trio_x(card) : ex.Xmult_multi, card };
  return undefined;
}
/** Rayquaza, Delta Stream (contentRev 59): +hands hand and +d_size discard each round (Kyogre's and Groudon's gifts together;
 *  Accelgor's hands_discards pair). `delta_on` remembers that this card gave them, so one obtained on the old rules (a resumed pre-r59
 *  run: it gave nothing) never takes back what it never gave; such a Rayquaza starts giving them when the next Blind is selected
 *  (delta_wake, live rules). Fixed numbers (energy-inert names). */
const delta_stream = {
  add_to_deck(self, card, from_debuff) {
    if (!solo59()) return;
    card.ability.extra.delta_on = true;
    hands_discards.add_to_deck(self, card, from_debuff);
  },
  remove_from_deck(self, card, from_debuff) {
    if (!card.ability.extra.delta_on) return;
    card.ability.extra.delta_on = false;
    hands_discards.remove_from_deck(self, card, from_debuff);
  },
};
function delta_wake(card, context) {
  if (context.setting_blind && !context.blueprint && solo59() && !card.ability.extra.delta_on) delta_stream.add_to_deck(null, card, false);
}
/** Rayquaza, Dragon Ascent: the played hand contains a Straight or a Flush (a Straight Flush is one hand: it grows once). */
const ascends = (context) => !!context.poker_hands && ((context.poker_hands.Straight || []).length > 0 || (context.poker_hands.Flush || []).length > 0);
/** Latias / Latios: the banked X (`eon_Xmult`, in no energy field: what is banked keeps its worth), each gain `Xmult_mod` (Energy +20%).
 *  Soul Dew (contentRev 59, solo): the OTHER kind (Latias: a Planet; Latios: a Tarot) grows it by half (0.5 x Xmult_mod, so one energy
 *  field scales both). Before r59: with the partner held (undebuffed; find_card) every Tarot OR Planet grew both by the full gain.
 *  Not Blueprint (it copies the X only). */
const soul_dew = (partner) => !!(G.jokers && find_card('j_poke_' + partner).length > 0);
const eon_half = (card) => r9(card.ability.extra.Xmult_mod / 2);
function eon(card, context, own, partner) {
  const ex = card.ability.extra;
  if (context.using_consumeable && !context.blueprint && context.consumeable) {
    const set = context.consumeable.ability.set, other = own === 'Tarot' ? 'Planet' : 'Tarot';
    const gain = set === own ? ex.Xmult_mod : set !== other ? 0 : solo59() ? eon_half(card) : soul_dew(partner) ? ex.Xmult_mod : 0;
    if (gain > 0) {
      ex.eon_Xmult = r3(ex.eon_Xmult + gain);
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    }
    return undefined;
  }
  if (context.joker_main && ex.eon_Xmult > 1) return { message: a_xmult(r3(ex.eon_Xmult)), colour: 'XMULT', Xmult_mod: ex.eon_Xmult };
  return undefined;
}
/** Regi Trio + Regigigas: with all three Regis held and an awake Regigigas (undebuffed), each Regi converts 1 more card per Blind
 *  (once, however many Regigigas). */
function giga_trio_bonus(regi) {
  if (regi_others(regi) < 2) return 0;
  return ((G.jokers && G.jokers.cards) || []).some((j) => !j.debuff && j.config.center.key === 'j_poke_regigigas' && giga_awake(j)) ? 1 : 0;
}

export const JOKERS = {

  // ---------------------------------------------------------------- LINE C: Spheal -> Sealeo -> Walrein (Water, Gen 3)
  // Spheal 363: Rollout +10 Chips, doubled for each consecutive hand of the same poker hand (max 4 doublings). Evolves in 5 rounds.
  spheal: {
    name: 'spheal', poke_sprite391: sprite('Natdex', 4, 24),
    config: { extra: { chips: 10, streak: 0, max_streak: 4, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hand_type', 'reset', 'round_evo'], poke_after: 'glalie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chips, ex.max_streak, rollout_chips(ex), ex.rounds] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context) || level_evo(self, card, context, 'j_poke_sealeo'); },
  },
  // Sealeo 364: +1 hand; Rollout +20 Chips. Evolves in 5 rounds.
  sealeo: {
    name: 'sealeo', poke_sprite391: sprite('Natdex', 6, 24),
    config: { extra: { hands: 1, chips: 20, streak: 0, max_streak: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hands', 'hand_type', 'reset', 'round_evo'], poke_after: 'spheal',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.chips, ex.max_streak, ex.rounds, rollout_chips(ex)] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context) || level_evo(self, card, context, 'j_poke_walrein'); },
    ...hands,
  },
  // Walrein 365: +1 hand; Rollout +40 Chips; Sheer Cold X3 Mult while Rollout is at full power.
  walrein: {
    name: 'walrein', poke_sprite391: sprite('Natdex', 8, 24),
    config: { extra: { hands: 1, chips: 40, streak: 0, max_streak: 4, Xmult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'hands', 'hand_type', 'reset'], poke_after: 'sealeo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.chips, ex.max_streak, ex.Xmult, rollout_chips(ex)] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context); },
    ...hands,
  },

  // ---------------------------------------------------------------- LINE F3: Whismur -> Loudred -> Exploud (Colorless, Gen 3)
  // The owner's design (2026-10-27): each Glass card that breaks (its 1 in 4 shatter, as Glass Joker counts) grows the joker, and
  // every form keeps what the last had. Starting / banked totals: glass_chips / glass_mult / glass_Xmult (in no energy_values:
  // Energy never scales them, so a banked gain keeps its worth); the gain per break: chip_mod / mult_mod / Xmult_mod (Energy +20%
  // of its base each: +4 / +0.6 / +X0.04). The totals carry over on evolution (poke_custom_values_to_keep); Energy too
  // (energy_count, re-applied to the new base gain). Each evolution makes a Negative Justice (Chingling's). 4 rounds, then 5.
  // Whismur 293: +30 Chips; +20 Chips per broken Glass card.
  whismur: {
    name: 'whismur', poke_sprite391: sprite('Natdex', 14, 19),
    config: { extra: { glass_chips: 30, chip_mod: 20, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'enhancements', 'tarot', 'round_evo'], poke_after: 'shedinja',
    poke_custom_values_to_keep: ['glass_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, true); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.chip_mod, ex.rounds] }; },
    calculate(self, card, context) {
      return glass_grow(card, context, 'glass_chips', 'chip_mod', 'a_chips') || glass_main(card, context) || level_evo(self, card, context, 'j_poke_loudred');
    },
  },
  // Loudred 294: Whismur's Chips (+30 fresh) and +4 Mult; +3 Mult per broken Glass card. A Negative Justice when it evolves in.
  loudred: {
    name: 'loudred', poke_sprite391: sprite('Natdex', 16, 19),
    config: { extra: { glass_chips: 30, glass_mult: 4, mult_mod: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'mult', 'scaling', 'enhancements', 'tarot', 'round_evo'], poke_after: 'whismur',
    poke_custom_values_to_keep: ['glass_chips', 'glass_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, true); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.glass_mult, ex.mult_mod, ex.rounds] }; },
    calculate(self, card, context) {
      glass_evolved(card, context, 'whismur');
      return glass_grow(card, context, 'glass_mult', 'mult_mod', 'a_mult') || glass_main(card, context) || level_evo(self, card, context, 'j_poke_exploud');
    },
  },
  // Exploud 295: the Chips and the Mult (+30 / +4 fresh) and X1.5 Mult; +X0.2 per broken Glass card. A Negative Justice when it
  // evolves in.
  exploud: {
    name: 'exploud', poke_sprite391: sprite('Natdex', 18, 19),
    config: { extra: { glass_chips: 30, glass_mult: 4, glass_Xmult: 1.5, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'mult', 'xmult', 'scaling', 'enhancements'], poke_after: 'loudred',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, false); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.glass_mult, ex.glass_Xmult, ex.Xmult_mod] }; },
    calculate(self, card, context) {
      glass_evolved(card, context, 'loudred');
      return glass_grow(card, context, 'glass_Xmult', 'Xmult_mod', 'a_xmult') || glass_main(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE F4: Gulpin -> Swalot (Dark, Gen 3)
  // The owner's design (2026-10-27): Stockpile. At the end of each round it swallows (destroys, Pokermon's poke_remove_card — the
  // Hazard plumbing) 1 Hazard card held in hand, else 1 Diamond card held in hand, gaining 1 Stockpile up to its max (3; each
  // Energy +1: the house energy field `stockpile_max`, systems/energy.js). Scored Diamonds give +2 Mult per Stockpile
  // (`stockpile_mult`: not energized). Gulpin at max swallows only Hazards (a Diamond would be eaten for nothing); it evolves at
  // exactly 3 Stockpile (fixed: Energy never slows it), and the Stockpile carries into Swalot.
  // Gulpin 316: Uncommon $6.
  gulpin: {
    name: 'gulpin', poke_sprite391: sprite('Natdex', 0, 21),
    config: { extra: { stockpile: 0, stockpile_max: 3, stockpile_mult: 2, stockpile_evo: 3 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dark', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'suit', 'diamonds', 'hazards', 'destroy_card', 'scaling_evo'], poke_after: 'roselia',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra;
      return { vars: [ex.stockpile, stock_max(ex), ex.stockpile_mult, stock_mult(ex), ex.stockpile_evo] };
    },
    calculate(self, card, context) {
      const r = stockpile_mult(card, context);
      if (r) return r;
      swallow(card, context, false);
      return scaling_evo(self, card, context, 'j_poke_swalot', card.ability.extra.stockpile, card.ability.extra.stockpile_evo);
    },
  },
  // Swalot 317: Safari $8. Keeps the Stockpile and its Mult; a swallowed Diamond (when no Hazard is held) also pays its rank in $
  // (2-10, J 11, Q 12, K 13, A 14: get_id, as Balatro numbers ranks; fixed, not energized) — even at max. X0.1 Mult per card the
  // deck is below its starting size (Erosion's G.GAME.starting_deck_size; `Xmult_mod`, energized: +X0.02 per Energy), never below X1.
  swalot: {
    name: 'swalot', poke_sprite391: sprite('Natdex', 2, 21),
    config: { extra: { stockpile: 0, stockpile_max: 3, stockpile_mult: 2, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'economy', 'suit', 'diamonds', 'hazards', 'destroy_card', 'full_deck'], poke_after: 'gulpin',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra;
      return { vars: [ex.stockpile, stock_max(ex), ex.stockpile_mult, stock_mult(ex), r3(ex.Xmult_mod), r3(swalot_x(ex))] };
    },
    calculate(self, card, context) {
      const r = stockpile_mult(card, context);
      if (r) return r;
      if (context.joker_main && swalot_x(card.ability.extra) > 1) {
        const x = swalot_x(card.ability.extra);
        return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
      }
      swallow(card, context, true);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F5: Trapinch -> Vibrava -> Flygon (Earth, Gen 3)
  // The owner's design (2026-10-27): Sand Pit. Every card you discard (a real discard: not one an effect makes — `hook`) permanently
  // banks Chips on the joker (`sand_chips`, in no energy_values, so a banked Chip keeps its worth and Energy is never retroactive),
  // which it gives every hand. The gain per card is `chip_mod` (Energy +20% of its base each: Trapinch +0.4, Vibrava +0.6). The bank
  // carries through both evolutions (poke_custom_values_to_keep); Energy too (energy_count, re-applied to the new base). Evolution by
  // cards discarded (`sand_cards`, at end of round): 40, then 60 more (the count starts over).
  // Trapinch 328: Uncommon $6; +2 Chips per discarded card.
  trapinch: {
    name: 'trapinch', poke_sprite391: sprite('Natdex', 24, 21),
    config: { evo_rqmt: 40, extra: { sand_chips: 0, chip_mod: 2, sand_cards: 0 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'discard', 'scaling_evo'], poke_after: 'spinda',
    poke_custom_values_to_keep: ['sand_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.chip_mod), ex.sand_cards || 0, self.config.evo_rqmt] }; },
    calculate(self, card, context) {
      return sand_pit(card, context) || sand_main(card, context) || scaling_evo(self, card, context, 'j_poke_vibrava', card.ability.extra.sand_cards || 0, self.config.evo_rqmt);
    },
  },
  // Vibrava 329: Safari $8. Trapinch's bank, +3 Chips per discarded card; Supersonic: +1 discard each round while held (fixed: d_size
  // is never energized). Evolves after 60 more discarded cards.
  vibrava: {
    name: 'vibrava', poke_sprite391: sprite('Natdex', 26, 21),
    config: { evo_rqmt: 60, extra: { sand_chips: 0, chip_mod: 3, sand_cards: 0, d_size: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'discard', 'scaling_evo'], poke_after: 'trapinch',
    poke_custom_values_to_keep: ['sand_chips'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.chip_mod), ex.sand_cards || 0, self.config.evo_rqmt, ex.d_size] }; },
    calculate(self, card, context) {
      return sand_pit(card, context) || sand_main(card, context) || scaling_evo(self, card, context, 'j_poke_flygon', card.ability.extra.sand_cards || 0, self.config.evo_rqmt);
    },
  },
  // Flygon 330: Safari $10. Gives the whole bank (it banks no more: its power is the X Mult) and, Sandstorm, X(1 + 0.25 per discard
  // used this round): a discard use counts once however many cards; it resets each round. `Xmult_mod` (Energy +20% of its base each:
  // X0.3 / X0.35 / X0.4 per discard). No +1 discard (Vibrava's goes when it evolves).
  flygon: {
    name: 'flygon', poke_sprite391: sprite('Natdex', 28, 21),
    config: { extra: { sand_chips: 0, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'discard', 'reset'], poke_after: 'vibrava',
    poke_custom_values_to_keep: ['sand_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.Xmult_mod), sandstorm_x(ex)] }; },
    calculate(self, card, context) { return sand_main(card, context); },
  },

  // ---------------------------------------------------------------- LINE F6: Spoink -> Grumpig (Psychic, Gen 3)
  // The owner's design (2026-10-27): Pearl. At the end of each round a random card held in hand with no seal gains a Pink Seal
  // (pearl: seeded; none unsealed, nothing). Every Pink Seal trigger (its scoring effect firing, with or without room for the Energy:
  // seals1.js pink_triggered -> the center's poke_pink_trigger hook; Blueprint has none, so it copies the X Mult and never counts)
  // grows the banked X Mult (`pink_Xmult`, in no energy field: never retroactive; kept through evolution). The gains are `Xmult_mod`
  // (Energy +20% of its base each: Spoink X0.1 -> +0.02, Grumpig X0.15 -> +0.03, its Black Pearl twice that -> +0.06).
  // Spoink 325: Common $5; X0.1 per Pink Seal trigger; evolves after 8 triggers (`pink_triggers`, at end of round).
  spoink: {
    name: 'spoink', poke_sprite391: sprite('Natdex', 18, 21),
    config: { evo_rqmt: 8, extra: { pink_Xmult: 1, Xmult_mod: 0.1, pink_triggers: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'seals', 'energy', 'scaling_evo'], poke_after: 'torkoal',
    poke_custom_values_to_keep: ['pink_Xmult'],
    poke_pink_trigger(self, card) {
      const ex = card.ability.extra;
      ex.pink_triggers = (ex.pink_triggers || 0) + 1;
      ex.pink_Xmult = r3(ex.pink_Xmult + ex.Xmult_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); pink_tip(info_queue);
      const ex = card.ability.extra;
      return { vars: [r3(ex.pink_Xmult), r3(ex.Xmult_mod), ex.pink_triggers || 0, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      pearl(card, context);
      return pearl_main(card, context) || scaling_evo(self, card, context, 'j_poke_grumpig', card.ability.extra.pink_triggers || 0, self.config.evo_rqmt);
    },
  },
  // Grumpig 326: Safari $8. Spoink's bank and Pearl; Spoink Dance: Pink Seals trigger on EVERY hand while it is held (seals1.js);
  // X0.15 for each hand in which a Pink Seal triggered (once per hand, not per seal); Black Pearl: X0.3 instead when one of that
  // hand's Pink Seals had no room for its Energy (the overflow gain replaces the normal one: still once per hand).
  grumpig: {
    name: 'grumpig', poke_sprite391: sprite('Natdex', 20, 21),
    config: { extra: { pink_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'seals', 'energy'], poke_after: 'spoink',
    poke_custom_values_to_keep: ['pink_Xmult'],
    poke_pink_trigger(self, card, seal_card, overflow) { grumpig_gain(card, overflow); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); pink_tip(info_queue);
      const ex = card.ability.extra;
      return { vars: [r3(ex.pink_Xmult), r3(ex.Xmult_mod), r3(2 * ex.Xmult_mod)] };
    },
    calculate(self, card, context) {
      pearl(card, context);
      return pearl_main(card, context);
    },
  },

  // ---------------------------------------------------------------- the pair: Lunatone + Solrock (Earth, Gen 3; like Plusle / Minun)
  // The owner's design (2026-10-28). Day and night: within each round the 1st, 3rd and 5th hands are DAY, the 2nd and 4th NIGHT
  // (G.GAME.current_round.hands_played before the hand: even = day). Solrock, Sunlight: +100 Chips on day hands (`chips`). Lunatone,
  // Moonlight: X2 Mult on night hands (`Xmult`). Cosmic Power: with the other one owned (not debuffed; find_card), each also covers
  // the other half of the cycle at half strength — Solrock +chips/2 on night hands, Lunatone X(1 + (Xmult - 1) / 2) on day hands — so
  // every hand gets both. Each copy acts on its own. Energy: chips +30% / Xmult +20% of base; the half values are DERIVED from them,
  // so they stay exactly half (one Energy: +130 / +65 Chips, X2.4 / X1.7). Uncommon $6: single-stage, priced below the usual Rare $7
  // because each alone works half the time. Not Blueprint-restricted. Art: upstream 3.9.1's own cells (Natdex 12 / 14, 22).
  lunatone: {
    name: 'lunatone', poke_sprite391: sprite('Natdex', 12, 22),
    config: { extra: { Xmult: 2 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'hands', 'pair'], poke_after: 'seviper',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(moon_half(ex)), next_is_day() ? 'Day' : 'Night', cosmic(card, 'j_poke_solrock') ? 'active' : 'needs Solrock'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      const x = !is_day() ? ex.Xmult : cosmic(card, 'j_poke_solrock') ? moon_half(ex) : 1;
      if (x === 1) return undefined;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  solrock: {
    name: 'solrock', poke_sprite391: sprite('Natdex', 14, 22),
    config: { extra: { chips: 100 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hands', 'pair'], poke_after: 'lunatone',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), r3(sun_half(ex)), next_is_day() ? 'Day' : 'Night', cosmic(card, 'j_poke_lunatone') ? 'active' : 'needs Lunatone'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      const c = is_day() ? ex.chips : cosmic(card, 'j_poke_lunatone') ? sun_half(ex) : 0;
      if (!c) return undefined;
      return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c };
    },
  },

  // ---------------------------------------------------------------- LINE F7: Barboach -> Whiscash (Water, Gen 3)
  // The owner's design (2026-10-28): a Water / Earth team. Muddy Water: +Chips for each Water or Earth Joker you have, itself included
  // (muddy_count above: a dual-type joker once; Tera stickers and Castform's form through is_type; debuffed jokers don't count). The
  // per-joker Chips is `chips` (Energy +30% of its base each: Barboach 12 -> 15.6 / 19.2 / 22.8, Whiscash 20 -> 26 / 32 / 38). Neither
  // Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 16 / 18, 22).
  // Barboach 339: Common $5; +12 Chips per Water / Earth Joker. Evolves after 5 rounds.
  barboach: {
    name: 'barboach', poke_sprite391: sprite('Natdex', 16, 22),
    config: { extra: { chips: 12, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'types', 'round_evo'], poke_after: 'solrock',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = muddy_count(card);
      return { vars: [r3(ex.chips), n, r3(ex.chips * n), ex.rounds] };
    },
    calculate(self, card, context) { return muddy_main(card, context) || level_evo(self, card, context, 'j_poke_whiscash'); },
  },
  // Whiscash 340: Safari $8; +20 Chips per Water / Earth Joker; Earthquake: with at least 2 OTHER Water / Earth Jokers, the first hand
  // of each round (hands_played === 0) retriggers every scored card once (`retriggers`, fixed: never energized; `quake_req` neither).
  // A Blueprint copying it adds its own retrigger, as on Remoraid / Octillery (the condition is read from Whiscash's row).
  whiscash: {
    name: 'whiscash', poke_sprite391: sprite('Natdex', 18, 22),
    config: { extra: { chips: 20, retriggers: 1, quake_req: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'types', 'retrigger'], poke_after: 'barboach',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = muddy_count(card);
      return { vars: [r3(ex.chips), n, r3(ex.chips * n), ex.quake_req, quake_state(card)] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint && quake_on(card)) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES && quake_on(card), true);
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_played === 0 && quake_on(card)) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return muddy_main(card, context);
    },
  },

  // ---------------------------------------------------------------- Castform 351 (Colorless, Gen 3)
  // The owner's design (2026-10-27): Forecast. When the round's first hand is drawn, Castform reads the weather from the suit held
  // most (forecast: Hearts + Diamonds together vs Clubs vs Spades; Wild counts for all three; debuffed / suitless cards for none;
  // a tie is Normal) and takes that form for the whole round — its type too (Sunny Fire, Rainy Water, Snowy Water: Ice maps to
  // Water, Normal Colorless). After the round (the end_of_round pass, queued so the other jokers' end-of-round effects still see the
  // form) it is Normal again: in the shop it is Colorless. Effects: Sunny, scored Hearts / Diamonds +4 Mult (`mult1`); Rainy, scored
  // Clubs +30 Chips (`chips1`) and the first scored Club retriggers (fixed); Snowy, Spades held in hand X1.1 Mult each (`Xmult_multi`);
  // Normal, +10 Mult (`mult2`). Energy (energize, the usual shares of base): every form's number at once — mult1 / mult2 +40%, chips1
  // +30%, Xmult_multi +5%; Colorless Energy always matches (half strength unless it is Normal, as on any non-Colorless joker), its
  // current form's type matches while it is in that form. Its changing type never counts against a Monotype run (poke_mono_exempt:
  // systems/runbadges.js leaves it out of the check). Art: upstream 3.9.1's own cards — its Natdex card (Normal) and the three
  // weather forms on the Gen 3 sheet (ui.js, systems/anim.js CASTFORM_SPRITES).
  castform: {
    name: 'castform', poke_sprite391: sprite('Natdex', 10, 23),
    config: { extra: { mult1: 4, chips1: 30, retriggers: 1, Xmult_multi: 1.1, mult2: 10, form: 'normal' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'chips', 'xmult', 'retrigger', 'suits', 'types', 'hand_drawn'], poke_after: 'milotic',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, form = CASTFORM_FORMS[ex.form] ? ex.form : 'normal';
      return { vars: [r3(ex.mult1), r3(ex.chips1), r3(ex.Xmult_multi), r3(ex.mult2), CASTFORM_FORMS[form].name], key: form === 'normal' ? undefined : 'j_poke_castform_' + form };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (first_deal(card, context)) {
        ex.forecast_round = G.GAME.round;
        // (before r111 Kyogre / Groudon lock the weather and Rayquaza calms it: castform_lock, null from r111; Volcarona makes it Sunny,
        // except where Kyogre locked it Rainy)
        const lock = castform_lock();
        const form = lock === 'rainy' ? lock : volcarona_sun() ? 'sunny' : lock || forecast(G.hand.cards);
        castform_set_form(card, form);
        card_eval_status_text(card, 'extra', null, null, null, { message: CASTFORM_FORMS[form].name + '!', colour: CASTFORM_FORMS[form].colour });
        return undefined;
      }
      if (round_end(context) && !context.blueprint) {
        G.E_MANAGER.add_event(() => { castform_set_form(card, 'normal'); });
        return undefined;
      }
      const form = ex.form;
      if (form === 'sunny' && context.individual && context.cardarea === G.play && !context.end_of_round
        && (context.other_card.is_suit('Hearts') || context.other_card.is_suit('Diamonds'))) return { mult: ex.mult1, card };
      if (form === 'rainy') {
        if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Clubs')) return { chips: ex.chips1, card };
        if (context.repetition && context.cardarea === G.play && context.other_card === first_club(context)) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (form === 'snowy' && context.individual && context.cardarea === G.hand && !context.end_of_round && context.other_card.is_suit('Spades')) {
        return { x_mult: ex.Xmult_multi, card };
      }
      if (form === 'normal' && context.joker_main) return { message: a_mult(r3(ex.mult2)), colour: 'MULT', mult_mod: ex.mult2 };
      return undefined;
    },
  },

  // ---------------------------------------------------------------- The Regi trio: Regirock 377 / Regice 378 / Registeel 379 (Gen 3)
  // The owner's design (2026-10-28). Three Legendaries ($20; The Soul / the Legendary pool, like Pokermon's other Legendaries), each
  // with a "Body" rule for one enhancement and the same Regi Trio conversion: when a Blind is selected, 1 random card of your full deck
  // becomes that enhancement, 2 on a BOSS Blind (contentRev 59, the owner's solo rule; it was 1 + the OTHER Regi species held)
  // (regi_convert: unenhanced cards first, then any card not already it). Types from the card art: Regirock Earth, Regice Water (Ice), Registeel Metal. Neither Nacho nor
  // Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex 2-7, 25).
  // Regirock 377 (Earth), Stone Body: Stone cards give +100 Chips instead of +50 (hook chip_bonus: regi_chip_bonus; `chips1`, Energy
  // +30%: 130 / 160 / 190) and permanently gain +10 Chips each time they score (perma_bonus, as Rhyhorn / Hiker; `chip_mod`, Energy
  // +20%: 12 / 14 / 16; Blueprint copies it).
  regirock: {
    name: 'regirock', poke_sprite391: sprite('Natdex', 2, 25, [3, 25]),
    config: { extra: { chips1: 100, chip_mod: 10 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'metagross',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_stone'); const ex = card.ability.extra; return { vars: [r3(ex.chips1), r3(ex.chip_mod), regi_base(card)] }; },
    calculate(self, card, context) {
      regi_convert(card, context, 'm_stone', 'regirock', 'Stone');
      if (context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_stone')) {
        const c = context.other_card;
        c.ability.perma_bonus = (c.ability.perma_bonus || 0) + card.ability.extra.chip_mod;
        return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
      }
      return undefined;
    },
  },
  // Regice 378 (Water), Ice Body: Glass cards never shatter (their 1 in 4 break roll, identifier 'glass', is fixed to 0 — SMODS's
  // fix_probability, as Absol fixes every roll; nothing breaks, so Glass Joker / the Whismur line count nothing). Its conversion makes
  // Glass; `glass_convert` is its base 1 (the house energy field, systems/energy.js: +1 per Energy, +0.5 per mismatched Colorless,
  // floored), so each Energy converts 1 more Glass card per Blind.
  regice: {
    name: 'regice', poke_sprite391: sprite('Natdex', 4, 25, [5, 25]),
    config: { extra: { glass_convert: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck', 'chance'], poke_after: 'regirock',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_glass'); return { vars: [regi_base(card), Math.floor(card.ability.extra.glass_convert + 1e-9)] }; },
    calculate(self, card, context) {
      if (context.fix_probability && !context.blueprint && context.identifier === 'glass') return { numerator: 0 };
      regi_convert(card, context, 'm_glass', 'regice', 'Glass');
      return undefined;
    },
  },
  // Registeel 379 (Metal), Iron Body: Steel cards held in hand give X2 Mult instead of X1.5 (hook chip_h_x_mult: regi_h_x_mult — the
  // Steel card's own held effect, so Mime / a Red Seal retrigger it; `Xmult_multi`, the per-card X, Energy +5%: X2.1 / X2.2 / X2.3).
  registeel: {
    name: 'registeel', poke_sprite391: sprite('Natdex', 6, 25, [7, 25]),
    config: { extra: { Xmult_multi: 2 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'regice',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_steel'); return { vars: [r3(card.ability.extra.Xmult_multi), regi_base(card)] }; },
    calculate(self, card, context) { regi_convert(card, context, 'm_steel', 'registeel', 'Steel'); return undefined; },
  },

  // ---------------------------------------------------------------- The Eon duo: Latias 380 / Latios 381 (Psychic, Gen 3)
  // The owner's design (2026-10-28). Legendary $20 each (The Soul / the Legendary pool). Types from the card art: both Psychic (their
  // real Dragon type is the mapping's; the 3.9.1 card draws the Psychic icon). Latias, Mist Ball: permanently gains X0.15 Mult each time
  // you use a Tarot card. Latios, Luster Purge: the same for a Planet card. Soul Dew (contentRev 59, the owner's solo rule; it was "holding
  // BOTH, every Tarot or Planet grows both"): each also grows by HALF from the other kind (Latias X0.075 per Planet, Latios X0.075 per
  // Tarot), alone. A Blueprint copies the X, never the growth. Banked in `eon_Xmult` (no
  // energy field), the gain `Xmult_mod` (Energy +20% of base: 0.15 -> 0.18 / 0.21 / 0.24). Neither Nacho nor Pokermon+ has them. Art:
  // upstream 3.9.1's own cells with their floating souls (Natdex 8 / 10, 25).
  latias: {
    name: 'latias', poke_sprite391: sprite('Natdex', 8, 25, [9, 25]),
    config: { extra: { eon_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'tarot', 'planet'], poke_after: 'registeel',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.eon_Xmult), r3(ex.Xmult_mod), r3(eon_half(card))] }; },
    calculate(self, card, context) { return eon(card, context, 'Tarot', 'latios'); },
  },
  latios: {
    name: 'latios', poke_sprite391: sprite('Natdex', 10, 25, [11, 25]),
    config: { extra: { eon_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'tarot', 'planet'], poke_after: 'latias',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.eon_Xmult), r3(ex.Xmult_mod), r3(eon_half(card))] }; },
    calculate(self, card, context) { return eon(card, context, 'Planet', 'latias'); },
  },

  // ---------------------------------------------------------------- The weather trio: Kyogre 382 / Groudon 383 / Rayquaza 384 (Gen 3)
  // The owner's design (2026-10-28). Legendary $20 each. Types from the card art: Kyogre Water, Groudon Earth, Rayquaza Dragon.
  // Kyogre, Primordial Sea: +1 hand each round; every scored Club retriggers once; Castform is locked Rainy. Groudon, Desolate Land:
  // +1 discard each round; scored Hearts and Diamonds each give X1.25 Mult; Castform is locked Sunny. Primal Clash (both held, no
  // Rayquaza): on the round's first deal (Castform's weather read) the cards held decide — more Clubs: Kyogre's round, more Hearts +
  // Diamonds: Groudon's (Wild both, debuffed / Stone / Hazard neither); a tie: the one with more Energy, else Kyogre. The other one does
  // nothing that round, its +1 hand / discard included (primal_read). Rayquaza, Delta Stream: +1 hand AND +1 discard each round (Kyogre's
  // and Groudon's gifts together; contentRev 59, the owner's solo rule: it only calmed the other two before), and while held Kyogre and
  // Groudon both work every round (no clash; Castform reads its normal forecast, the weather calmed); Dragon Ascent: permanently gains X0.2 Mult each time a played hand
  // contains a Straight or a Flush (once for a Straight Flush). Energy: Groudon's per-card `Xmult_multi` +5% of base (X1.25 -> X1.3125
  // / X1.375 / X1.4375); Rayquaza's gain `Xmult_mod` +20% (0.2 -> 0.24 / 0.28 / 0.32; banked in `ascent_Xmult`, no energy field).
  // Kyogre has no number (+1 hand and the retrigger are fixed): Energy-inert by design (poke_no_energy_field). Neither Nacho nor
  // Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex 12 / 14 / 16, 25).
  // contentRev 111 (SIMPLE_TRIO_REV, the owner's simplification): no weather, no Castform, no Primal Clash, no calm. Kyogre: +1 hand, scored
  // Clubs retrigger once and give X1.25 (`Xmult_multi`, +5%: 1.3125 / 1.375 / 1.4375; no longer Energy-inert); Groudon: +1 discard,
  // Hearts / Diamonds X1.25 (unchanged); Rayquaza: +1 hand / +1 discard and Dragon Ascent (unchanged, its bank kept). Everything above
  // the r111 line stays behind the rules-rev check for runs recorded before it.
  kyogre: {
    name: 'kyogre', poke_sprite391: sprite('Natdex', 12, 25, [13, 25]),
    config: { extra: { hands: 1, retriggers: 1, Xmult_multi: 1.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['hands', 'retrigger', 'xmult', 'suit', 'clubs', 'types'], poke_after: 'latios',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(trio_x(card))] }; },
    set_ability: trio_set,
    calculate(self, card, context) { return kyogre_calc(card, context); },
    ...primal_bonus('hands'),
  },
  groudon: {
    name: 'groudon', poke_sprite391: sprite('Natdex', 14, 25, [15, 25]),
    config: { extra: { d_size: 1, Xmult_multi: 1.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['discard', 'xmult', 'suit', 'hearts', 'diamonds', 'types'], poke_after: 'kyogre',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return groudon_calc(card, context); },
    ...primal_bonus('d_size'),
  },
  rayquaza: {
    name: 'rayquaza', poke_sprite391: sprite('Natdex', 16, 25, [17, 25]),
    config: { extra: { ascent_Xmult: 1, Xmult_mod: 0.2, hands: 1, d_size: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'hand_type', 'types', 'hands', 'discard'], poke_after: 'groudon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.ascent_Xmult), r3(ex.Xmult_mod), ex.hands, ex.d_size] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      delta_wake(card, context);
      if (context.before && context.cardarea === G.jokers && !context.blueprint && ascends(context)) {
        ex.ascent_Xmult = r3(ex.ascent_Xmult + ex.Xmult_mod);
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Dragon Ascent!', colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.ascent_Xmult > 1) return { message: a_xmult(r3(ex.ascent_Xmult)), colour: 'XMULT', Xmult_mod: ex.ascent_Xmult };
      return undefined;
    },
    ...delta_stream,
  },

  // ---------------------------------------------------------------- batch E, the Primal Reversions: Primal Kyogre / Primal Groudon (Gen 3)
  // The owner's "orb version yes" (2026-11-03). Only a Blue Orb / Red Orb used on a Kyogre / Groudon makes one (../primal.js; for good, like
  // the Mega Berry Juice's Mega), so never in a pool: Legendary $20 and stage Legendary, as the other transformed Legendary forms (Urshifu,
  // Solgaleo), NOT poke_mega — the Mega Stone (the Mega Sleeve's endless one too) never targets or reverts a Primal, and the Orb isn't a
  // Mega Evolution. Each is its normal form pushed further and stands on its side of the weather trio (side / primal_read above):
  // Primal Kyogre +2 hands each round, every scored Club retriggers twice, always raining (the rain check, Castform Rainy); Primal Groudon
  // +2 discards each round, scored Hearts / Diamonds X1.5 each, always sunny (the sun check, Castform Sunny). A Primal always wins the
  // Primal Clash against the other's normal form (that one sits out every round); Primal against Primal, the round's first deal decides as
  // before; Rayquaza calms everything. Energy carries over from the normal form (poke_backend_evolve's energy_count): Primal Groudon's per-card
  // X is `Xmult_multi` (+5% of base: X1.575 / X1.65 / X1.725); Primal Kyogre has no number (Energy-inert, as Kyogre). Art: upstream 3.9.1's
  // own Primal cells with their souls (Gen 3 sheet: Primal Groudon {2,7} / {3,7}, Primal Kyogre {4,7} / {5,7}).
  // contentRev 111 (SIMPLE_TRIO_REV): Primal Kyogre +2 hands, scored Clubs retrigger twice and give X1.5 (`Xmult_multi`, +5%: 1.575 / 1.65 /
  // 1.725); Primal Groudon +2 discards, scored Hearts / Diamonds X1.75 (`Xmult_multi2`, +5%: 1.8375 / 1.925 / 2.0125). No rain / sun, no
  // Castform lock, no clash. The Orbs keep their pool gate (only while you hold the Legendary).
  primal_kyogre: {
    name: 'primal_kyogre', poke_sprite391: sprite('Gen03', 4, 7, [5, 7]),
    config: { extra: { hands: 2, retriggers: 2, Xmult_multi: 1.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 3, blueprint_compat: true, custom_pool_func: true,
    attributes: ['hands', 'retrigger', 'xmult', 'suit', 'clubs', 'types'], poke_after: 'kyogre',
    poke_primal: 'kyogre',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(trio_x(card))] }; },
    set_ability: trio_set,
    calculate(self, card, context) { return kyogre_calc(card, context); },
    ...primal_bonus('hands'),
    in_pool() { return false; },
  },
  primal_groudon: {
    name: 'primal_groudon', poke_sprite391: sprite('Gen03', 2, 7, [3, 7]),
    // (Xmult_multi: X1.5 before r111; Xmult_multi2: X1.75 from r111 - trio_set keeps the one this card's rules read)
    config: { extra: { d_size: 2, Xmult_multi: 1.5, Xmult_multi2: 1.75 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 3, blueprint_compat: true, custom_pool_func: true,
    attributes: ['discard', 'xmult', 'suit', 'hearts', 'diamonds', 'types'], poke_after: 'groudon',
    poke_primal: 'groudon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(trio_x(card))] }; },
    set_ability: trio_set,
    calculate(self, card, context) { return groudon_calc(card, context); },
    ...primal_bonus('d_size'),
    in_pool() { return false; },
  },
};
