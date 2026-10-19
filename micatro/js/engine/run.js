// Micatro run controller — Balatro's state machine (game.lua update_*),
// state_events.lua (play/discard/scoring/end_round) and the gameplay button
// callbacks, as synchronous player ACTIONS.
//
//   newRun({seed, back, stake})   -> fresh run in BLIND_SELECT
//   act({type, ...})               -> apply one player action, run the event
//                                     queue + state machine until the game is
//                                     waiting on the player again
//
// Everything a viewer needs (UI animation) lands in G.ui_events.

import {
  G, E_MANAGER, P_CENTERS, P_CARDS, P_BLINDS, P_TAGS, P_STAKES, P_CENTER_POOLS, HANDS_PROTO, LOC,
  CardArea, Card, copy_table, next, emit, card_eval_status_text, juice_card, play_sound, localize,
  pseudohash, pseudoseed, pseudorandom, pseudorandom_element, random_string, math_random,
  find_joker, ease_dollars, ease_discard, ease_hands_played, ease_round, ease_chips, ease_ante,
  draw_card, level_up_hand, eval_card, mod_card_calculate, create_card, poll_edition, get_pack,
  calculate_reroll_cost, reset_idol_card, reset_mail_rank, reset_ancient_card, reset_castle_card,
  reset_blinds, get_new_boss, get_next_voucher_key, get_next_tag_key, get_blind_amount,
  mod_chips, mod_mult, set_hand_usage, number_format, probability_roll, mod_context_effect, mod_effect_tail,
} from './core.js';
import { Blind } from './blind.js';
import * as B from './bignum.js';
import { quantum_enhancements } from './core.js';
import { Tag, add_tag } from './tag.js';
import { Back } from './back.js';
import './jokers.js';
import { resolveCardKey } from '../mods/registry.js';
import { activateMods, callHook, reduceHook, firstHook, hasHook, activeConsumableTypes, ACTIVE as ACTIVE_MODS, allOptions, activeModHands, activeModHandParts, MOD_SUITS, feature } from '../mods/registry.js';
import './consumables.js';
import { CUSTOM_DECK_ID, CUSTOM_DECK_BACK, validateDeck } from './customdeck.js';
import { CHALLENGE_ID, findChallenge, prepareChallenge, apply_challenge, challenge_protos, challengeBack, challengeMods } from './challenge.js';
import { SLEEVE_ID, findSleeve, sleeveFor, prepareSleeve, apply_sleeve } from './sleeve.js';

export const STATES = {
  SELECTING_HAND: 1, HAND_PLAYED: 2, DRAW_TO_HAND: 3, GAME_OVER: 4, SHOP: 5, PLAY_TAROT: 6,
  BLIND_SELECT: 7, ROUND_EVAL: 8, TAROT_PACK: 9, PLANET_PACK: 10, MENU: 11, SPECTRAL_PACK: 15,
  STANDARD_PACK: 17, BUFFOON_PACK: 18, NEW_ROUND: 19,
  // Mod boosters (SMODS_BOOSTER_OPENED in Steamodded): with / without the hand drawn.
  MOD_PACK: 20, MOD_PACK_HAND: 21,
};
export const STATE_NAMES = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v, k]));
const PACK_STATES = [STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.SPECTRAL_PACK, STATES.STANDARD_PACK, STATES.BUFFOON_PACK, STATES.MOD_PACK, STATES.MOD_PACK_HAND];
export const HANDLIST = Object.keys(HANDS_PROTO).sort((a, b) => HANDS_PROTO[a].order - HANDS_PROTO[b].order);
const BASE_HANDLIST = HANDLIST.slice();
/**
 * SMODS.PokerHand order (post_inject_class): every hand sorted by mult*chips (+ order_offset), a hand
 * with `above_hand` just above that hand. Rebuilt in place for each run so the active mods' hands are in
 * it; with no mod hands it is exactly the base list. (SMODS's sort ties exactly when a mod hand's score
 * equals its above_hand's — Bunco's Deal over Flush Five — and the mod hand goes above, as declared.)
 */
export function rebuild_handlist() {
  const mod = activeModHands();
  HANDLIST.length = 0;
  if (!mod.length) { HANDLIST.push(...BASE_HANDLIST); return; }
  const all = {};
  for (const k of BASE_HANDLIST) all[k] = HANDS_PROTO[k];
  for (const h of mod) all[h.key] = h;
  const ev = (h) => h.mult * h.chips + (h.order_offset || 0);
  const score = (k) => { const h = all[k]; const a = h.above_hand && all[h.above_hand]; return a ? [ev(a), 1, ev(h)] : [ev(h), 0, 0]; };
  const keys = [...BASE_HANDLIST, ...mod.map((h) => h.key)];
  keys.sort((x, y) => { const a = score(x), b = score(y); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] - a[i]; return keys.indexOf(x) - keys.indexOf(y); });
  HANDLIST.push(...keys);
}

function get_starting_params() {
  return { dollars: 4, hand_size: 8, discards: 3, hands: 4, reroll_cost: 5, joker_slots: 5, ante_scaling: 1, consumable_slots: 2, no_faces: false, erratic_suits_and_ranks: false };
}

export function init_game_object() {
  const bosses_used = {};
  for (const [k, v] of Object.entries(P_BLINDS)) if (v.boss) bosses_used[k] = 0;
  const cards_played = {};
  for (const r of ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King']) cards_played[r] = { suits: {}, total: 0 };
  const hands = {};
  for (const [k, v] of Object.entries(HANDS_PROTO)) {
    hands[k] = { visible: v.visible, order: v.order, mult: v.mult, chips: v.chips, s_mult: v.s_mult, s_chips: v.s_chips, level: v.level, l_mult: v.l_mult, l_chips: v.l_chips, played: 0, played_this_round: 0 };
  }
  // Mod poker hands (SMODS: every hand's order is its place in the sorted hand list).
  const modHands = activeModHands();
  if (modHands.length) {
    for (const h of modHands) {
      hands[h.key] = { visible: h.visible !== false, order: 0, mult: h.mult, chips: h.chips, s_mult: h.mult, s_chips: h.chips, level: h.level ?? 1, l_mult: h.l_mult, l_chips: h.l_chips, played: 0, played_this_round: 0 };
    }
    for (const k of Object.keys(hands)) hands[k].order = HANDLIST.indexOf(k) + 1;
  }
  return {
    won: false,
    round_scores: {
      furthest_ante: { amt: 0 }, furthest_round: { amt: 0 }, hand: { amt: 0 }, poker_hand: { amt: 0 },
      new_collection: { amt: 0 }, cards_played: { amt: 0 }, cards_discarded: { amt: 0 }, times_rerolled: { amt: 0 }, cards_purchased: { amt: 0 },
    },
    stats: { best_hand: 0, best_hand_name: '', furthest_ante: 1, dollars_earned: 0 },
    joker_usage: {}, consumeable_usage: {}, consumeable_usage_total: { tarot: 0, planet: 0, spectral: 0, tarot_planet: 0, all: 0 },
    hand_usage: {}, last_tarot_planet: null, win_ante: 8, stake: 1, modifiers: {},
    starting_params: get_starting_params(), banned_keys: {}, round: 0,
    probabilities: { normal: 1 }, bosses_used, pseudorandom: {}, starting_deck_size: 52, ecto_minus: 1,
    pack_size: 2, skips: 0, STOP_USE: 0, edition_rate: 1, joker_rate: 20, tarot_rate: 4, planet_rate: 4,
    spectral_rate: 0, playing_card_rate: 0, consumeable_buffer: 0, joker_buffer: 0, discount_percent: 0,
    interest_cap: 25, interest_amount: 1, inflation: 0, hands_played: 0, unused_discards: 0,
    perishable_rounds: 5, rental_rate: 3, blind: null, chips: 0, dollars: 0, max_jokers: 0, bankrupt_at: 0,
    current_boss_streak: 0, base_reroll_cost: 5, blind_on_deck: null, sort: 'desc',
    previous_round: { dollars: 4 }, tags: [], tag_tally: 0, pool_flags: {}, used_jokers: {}, used_vouchers: {},
    current_round: {
      current_hand: { chips: 0, mult: 0, chip_total: 0, handname: '', hand_level: '' },
      used_packs: {}, cards_flipped: 0,
      idol_card: { suit: 'Spades', rank: 'Ace' }, mail_card: { rank: 'Ace' }, ancient_card: { suit: 'Spades' }, castle_card: { suit: 'Spades' },
      hands_left: 0, hands_played: 0, discards_left: 0, discards_used: 0, dollars: 0, reroll_cost: 5,
      reroll_cost_increase: 0, jokers_purchased: 0, free_rerolls: 0, round_dollars: 0, most_played_poker_hand: 'High Card',
    },
    round_resets: {
      hands: 1, discards: 1, reroll_cost: 1, temp_reroll_cost: null, temp_handsize: null, ante: 1, blind_ante: 1,
      blind_states: { Small: 'Select', Big: 'Upcoming', Boss: 'Upcoming' },
      blind_choices: { Small: 'bl_small', Big: 'bl_big' }, boss_rerolled: false,
    },
    round_bonus: { next_hands: 0, discards: 0 },
    shop: { joker_max: 2 },
    cards_played,
    hands,
  };
}

/** Run the deferred queue and the state machine until the game waits on the player. */
export function pump() {
  let guard = 0;
  for (;;) {
    E_MANAGER.flush();
    if (G.STATE_COMPLETE) break;
    if (++guard > 500) throw new Error('micatro: state machine did not settle in ' + STATE_NAMES[G.STATE]);
    G.STATE_COMPLETE = true;
    const h = STATE_HANDLERS[G.STATE];
    if (h) h();
  }
}

const STATE_HANDLERS = {
  [STATES.SELECTING_HAND]() {
    if (G.hand.cards.length < 1 && G.deck.cards.length < 1) end_round();
    else check_hand_lock();
  },
  [STATES.HAND_PLAYED]() {
    G.E_MANAGER.add_event(() => {
      if (B.beats(G.GAME.chips, G.GAME.blind.chips) || G.GAME.current_round.hands_left < 1) G.STATE = STATES.NEW_ROUND;
      else G.STATE = STATES.DRAW_TO_HAND;
      G.STATE_COMPLETE = false;
    });
  },
  [STATES.DRAW_TO_HAND]() {
    for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'round_start_bonus' });
    G.E_MANAGER.add_event(() => {
      if (draw_from_deck_to_hand(null)) return;
      if (G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0 && G.GAME.facing_blind) {
        for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ first_hand_drawn: true }));
      }
      // Steamodded's hand_drawn context (mod cards only): the cards this draw brought in
      // (queued so it runs after the draw events above).
      if (ACTIVE_MODS.length) {
        G.E_MANAGER.add_event(() => {
          if (G.GAME.facing_blind && G.drawn_cards && G.drawn_cards.length) {
            const drawn = G.drawn_cards; G.drawn_cards = [];
            calculate_context({ hand_drawn: drawn });
            G.GAME.current_round.any_hand_drawn = true;
          }
        });
      }
      G.E_MANAGER.add_event(() => {
        G.STATE = STATES.SELECTING_HAND;
        G.STATE_COMPLETE = false;
        G.GAME.blind.drawn_to_hand();
      });
    });
  },
  [STATES.NEW_ROUND]() { end_round(); },
  [STATES.ROUND_EVAL]() {
    G.E_MANAGER.add_event(() => {
      G.GAME.facing_blind = null;
      evaluate_round();
    });
  },
  [STATES.SHOP]() { update_shop(); },
  [STATES.BLIND_SELECT]() {
    G.E_MANAGER.add_event(() => {
      // create_UIBox_blind_select / create_UIBox_blind_choice (UI_definitions.lua) own this in Lua.
      const bs = G.GAME.round_resets.blind_states;
      const gone = (s) => s === 'Defeated' || s === 'Skipped' || s === 'Hide';
      G.GAME.blind_on_deck = !gone(bs.Small) ? 'Small' : !gone(bs.Big) ? 'Big' : 'Boss';
      bs[G.GAME.blind_on_deck] = 'Select';
      emit('blind_select', { on_deck: G.GAME.blind_on_deck });
      if (ACTIVE_MODS.length) callHook('blind_on_deck', G.GAME.blind_on_deck); // (a custom deck's skip-disable rolls)
      for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'immediate' });
      for (const t of G.GAME.tags.slice()) if (t.apply_to_run({ type: 'new_blind_choice' })) break;
    });
  },
  [STATES.TAROT_PACK]() { G.E_MANAGER.add_event(() => draw_from_deck_to_hand()); },
  [STATES.SPECTRAL_PACK]() { G.E_MANAGER.add_event(() => draw_from_deck_to_hand()); },
  [STATES.PLANET_PACK]() {},
  [STATES.STANDARD_PACK]() {},
  [STATES.BUFFOON_PACK]() {},
  [STATES.MOD_PACK]() {},
  [STATES.MOD_PACK_HAND]() { G.E_MANAGER.add_event(() => draw_from_deck_to_hand()); },
  [STATES.PLAY_TAROT]() {},
  [STATES.GAME_OVER]() {
    G.GAME.over = true;
    emit('game_over', { won: !!G.GAME.won, ante: G.GAME.round_resets.ante, round: G.GAME.round });
  },
};

/** The Psychic etc. may make the whole hand unplayable — nothing to do: Balatro lets you sit there. */
function check_hand_lock() {}

// --------------------------------------------------------------- new run
export function newRun(args = {}) {
  for (const k of Object.keys(G)) delete G[k];
  // A recipe's keys a mod upgrade renamed (mods/aliases.js) -> their new keys (a key still registered is kept).
  args = { ...args };
  for (const f of ['back', 'sleeve']) if (typeof args[f] === 'string') args[f] = resolveCardKey(args[f]);
  if (typeof args.stake === 'string' && isNaN(Number(args.stake))) args.stake = resolveCardKey(args.stake);
  G.STATES = STATES;
  G.E_MANAGER = E_MANAGER;
  E_MANAGER.queue.length = 0;
  G.handlist = HANDLIST;
  G.ui_events = [];
  G.ui_seq = 0;
  G.sort_id = 0;
  G.playing_card = 0;
  // A custom deck (the native deck editor, engine/customdeck.js): a validated definition, the mods its content
  // needs, and its rules as the internal 'customdeck' mod (never listed in G.GAME.mods).
  const cdeck = args.customDeck ? validateDeck(args.customDeck) : null;
  // A challenge (engine/challenge.js; played at stake 1) or a sleeve (engine/sleeve.js): internal mods too.
  const chal = !cdeck && args.challenge ? findChallenge(args.challenge) : null;
  const sleeve0 = !cdeck && !chal && args.sleeve ? findSleeve(args.sleeve) : null;
  if (chal) args = { ...args, stake: 1 };
  if (chal || sleeve0) { prepareChallenge(chal); prepareSleeve(sleeveFor(sleeve0, args.back)); }
  const runMods = (ids) => (chal ? [...ids, ...challengeMods(chal), CHALLENGE_ID] : sleeve0 ? [...ids, sleeve0.mod, SLEEVE_ID] : ids);
  // Mods first: they decide what the pools contain and may adjust the game object.
  activateMods(runMods(cdeck ? [...(args.mods || []), ...cdeck.mods, CUSTOM_DECK_ID] : (args.mods || [])), args.modOptions || {});
  rebuild_handlist(); // (mod poker hands join the hand list; the base list otherwise)
  G.GAME = init_game_object();
  G.GAME.mods = cdeck ? ACTIVE_MODS.filter((id) => id !== CUSTOM_DECK_ID) : ACTIVE_MODS.slice();
  G.GAME.mod_options = allOptions();
  if (cdeck) { delete G.GAME.mod_options[CUSTOM_DECK_ID]; G.GAME.custom_deck = cdeck; }
  if (chal || sleeve0) { G.GAME.mods = G.GAME.mods.filter((id) => id !== CHALLENGE_ID && id !== SLEEVE_ID); delete G.GAME.mod_options[CHALLENGE_ID]; delete G.GAME.mod_options[SLEEVE_ID]; }
  for (const t of activeConsumableTypes()) G.GAME[t.rate_key] = t.shop_rate || 0;
  callHook('init_game_object', G.GAME);
  // Mod stakes (SMODS.Stake): `stake` may be an active mod stake's key (see mod_stake_chain);
  // it plays at the level of the stakes it applies, then runs its modifiers() below.
  const modStakes = mod_stake_chain(args.stake);
  G.GAME.stake = modStakes ? modStakes.level : (typeof args.stake === 'string' && isNaN(Number(args.stake)) ? 1 : (args.stake || 1));
  if (modStakes) G.GAME.stake_key = args.stake;
  G.GAME.STOP_USE = 0;
  // (a custom deck plays on the neutral Challenge back; its own back is art only)
  const backKey = cdeck ? CUSTOM_DECK_BACK : chal ? challengeBack(chal) : args.back && P_CENTERS[args.back] && P_CENTERS[args.back].set === 'Back' && backAvailable(P_CENTERS[args.back]) ? args.back : 'b_red';
  G.GAME.selected_back = new Back(P_CENTERS[backKey]);
  G.GAME.selected_back_key = backKey;

  const st = G.GAME.stake;
  if (st >= 2) { G.GAME.modifiers.no_blind_reward = G.GAME.modifiers.no_blind_reward || {}; G.GAME.modifiers.no_blind_reward.Small = true; }
  if (st >= 3) G.GAME.modifiers.scaling = 2;
  if (st >= 4) G.GAME.modifiers.enable_eternals_in_shop = true;
  if (st >= 5) G.GAME.starting_params.discards -= 1;
  if (st >= 6) G.GAME.modifiers.scaling = 3;
  if (st >= 7) G.GAME.modifiers.enable_perishables_in_shop = true;
  if (st >= 8) G.GAME.modifiers.enable_rentals_in_shop = true;
  if (modStakes) for (const ms of modStakes.chain) if (typeof ms.modifiers === 'function') ms.modifiers(ms);

  // Areas exist before the back applies (some backs queue joker/consumable adds).
  const sp = G.GAME.starting_params;
  G.consumeables = new CardArea('consumeables', { card_limit: sp.consumable_slots, type: 'consumeable', highlighted_limit: 1 });
  G.jokers = new CardArea('jokers', { card_limit: sp.joker_slots, type: 'joker', highlighted_limit: 1 });
  G.discard = new CardArea('discard', { card_limit: 500, type: 'discard' });
  G.deck = new CardArea('deck', { card_limit: 52, type: 'deck' });
  G.hand = new CardArea('hand', { card_limit: sp.hand_size, type: 'hand', highlighted_limit: 5, sort: 'desc' });
  G.play = new CardArea('play', { card_limit: 5, type: 'play' });
  G.shop_jokers = new CardArea('shop_jokers', { card_limit: G.GAME.shop.joker_max, type: 'shop', highlighted_limit: 1 });
  G.shop_vouchers = new CardArea('shop_vouchers', { card_limit: 1, type: 'shop', highlighted_limit: 1 });
  G.shop_booster = new CardArea('shop_booster', { card_limit: 2, type: 'shop', highlighted_limit: 1 });
  G.pack_cards = new CardArea('pack_cards', { card_limit: 5, type: 'consumeable', highlighted_limit: 1 });
  G.areas = [G.jokers, G.consumeables, G.hand, G.play, G.deck, G.discard, G.shop_jokers, G.shop_vouchers, G.shop_booster, G.pack_cards];
  G.playing_cards = [];

  G.GAME.pseudorandom.seed = (args.seed || random_string(8, Math.random())).toUpperCase();
  G.GAME.seeded = !!args.seed;
  G.GAME.pseudorandom.hashed_seed = pseudohash(G.GAME.pseudorandom.seed);

  G.GAME.blind = new Blind();
  if (sleeve0) G.GAME.selected_sleeve = sleeve0.key; // (decks paired with a sleeve read it: MoreFluff's)
  G.GAME.selected_back.apply_to_run();
  if (sleeve0) apply_sleeve(sleeveFor(sleeve0, backKey)); // (CardSleeves: right after the deck)
  if (chal) apply_challenge(chal); // (Game:start_run: after the back's apply_to_run)

  G.GAME.round_resets.hands = sp.hands;
  G.GAME.round_resets.discards = sp.discards;
  G.GAME.round_resets.reroll_cost = sp.reroll_cost;
  G.GAME.dollars = sp.dollars;
  G.GAME.base_reroll_cost = sp.reroll_cost;
  G.GAME.current_round.reroll_cost = G.GAME.base_reroll_cost;
  // Back effects may have changed starting params (Yellow +$10, Black -1 hand, ...).
  G.jokers.config.card_limit = sp.joker_slots;
  G.consumeables.config.card_limit = sp.consumable_slots;
  G.hand.config.card_limit = sp.hand_size;

  G.GAME.round_resets.blind_tags = {};
  G.GAME.round_resets.blind_choices.Boss = get_new_boss();
  if (ACTIVE_MODS.length) callHook('new_boss_choice');
  G.GAME.current_round.voucher = get_next_voucher_key();
  G.GAME.round_resets.blind_tags.Small = get_next_tag_key();
  G.GAME.round_resets.blind_tags.Big = get_next_tag_key();

  // Deck: every P_CARD, filtered/altered by starting params, sorted by Balatro's proto key.
  let protos = [];
  // A mod suit's cards start in the deck only if the suit allows it (SMODS in_pool {initial_deck = true}).
  const in_start_deck = (k) => { const v = P_CARDS[k]; if (!v.mod) return true; const s = MOD_SUITS[v.suit]; return !!(s && s.in_pool && s.in_pool(s, { initial_deck: true })); };
  for (const k of Object.keys(P_CARDS)) {
    if (k === 'empty' || !in_start_deck(k)) continue;
    let key = k;
    if (sp.erratic_suits_and_ranks) key = pseudorandom_element(Object.fromEntries(Object.entries(P_CARDS).filter(([kk]) => kk !== 'empty' && in_start_deck(kk))), pseudoseed('erratic'))[1];
    if (P_CARDS[key].mod) { const i = key.lastIndexOf('_'); protos.push({ s: key.slice(0, i), r: key.slice(i + 1) }); continue; }
    const _r = key.substring(2, 3), _s = key.substring(0, 1);
    if (sp.no_faces && (_r === 'K' || _r === 'Q' || _r === 'J')) continue;
    protos.push({ s: _s, r: _r });
  }
  if (chal) protos = challenge_protos(chal, protos);
  if (sp.extra_cards) protos = protos.concat(sp.extra_cards);
  const pk = (a) => (a.s || '') + (a.r || '') + (a.e || '') + (a.d || '') + (a.g || '');
  protos.sort((a, b) => (pk(a) < pk(b) ? -1 : pk(a) > pk(b) ? 1 : 0));
  for (const v of protos) {
    G.playing_card += 1;
    const c = new Card(P_CARDS[v.s + '_' + v.r], P_CENTERS[v.e || 'c_base'], { playing_card: G.playing_card });
    c.playing_card = G.playing_card;
    if (v.d) c.set_edition({ [v.d]: true }, true, true);
    if (v.g) c.set_seal(v.g, true);
    G.deck.emplace(c);
    G.playing_cards.push(c);
  }
  G.GAME.starting_deck_size = G.playing_cards.length;
  callHook('start_run');

  G.GAME.current_round.discards_left = G.GAME.round_resets.discards;
  G.GAME.current_round.hands_left = G.GAME.round_resets.hands;
  G.deck.shuffle();
  reset_idol_card();
  reset_mail_rank();
  G.GAME.current_round.ancient_card.suit = null;
  reset_ancient_card();
  reset_castle_card();
  callHook('reset_game_globals', true);

  G.STATE = STATES.BLIND_SELECT;
  G.STATE_COMPLETE = false;
  G.ui_events.length = 0;
  pump();
  emit('run_start', { seed: G.GAME.pseudorandom.seed, back: backKey, stake: G.GAME.stake });
  return G;
}

/**
 * SMODS.Stake for mod stakes (no-op for vanilla runs: a numeric `stake` returns null). A mod stake
 * {key, applied_stakes: ['gold' | mod stake keys], stake_level?, modifiers()} plays at the highest
 * level among the stakes it applies (vanilla 'gold' = 8; a mod stake applied in turn counts its own
 * chain), and its modifiers — plus those of applied mod stakes, lowest first — run after the vanilla
 * stake rules. -> {level, chain: [mod stake centers]} or null.
 */
export function mod_stake_chain(key, depth = 0) {
  if (typeof key !== 'string' || depth > 10) return null;
  const s = P_STAKES[key];
  if (!s || !s.mod || !ACTIVE_MODS.includes(s.mod)) return null;
  let level = typeof s.stake_level === 'number' ? s.stake_level : 1;
  const chain = [];
  for (const a of s.applied_stakes || []) {
    const ak = P_STAKES[a] ? a : 'stake_' + a;
    const sub = mod_stake_chain(ak, depth + 1);
    if (sub) { level = Math.max(level, sub.level); for (const c of sub.chain) if (!chain.includes(c)) chain.push(c); }
    else if (P_STAKES[ak] && typeof P_STAKES[ak].stake_level === 'number') level = Math.max(level, P_STAKES[ak].stake_level);
  }
  chain.push(s);
  return { level, chain };
}

// ---------------------------------------------------------- state events
/** A deck can start a run if it's base content, or its mod is on (and any option it needs, e.g. Pokermon's legacy decks). */
export function backAvailable(c) {
  if (!c || !c.mod) return true;
  if (!ACTIVE_MODS.includes(c.mod)) return false;
  const need = c.mod_option || c.poke_option;
  return !need || !!(G.GAME && G.GAME.mod_options && G.GAME.mod_options[c.mod] && G.GAME.mod_options[c.mod][need]);
}

export function draw_from_deck_to_hand(e) {
  if (!(G.STATE === STATES.TAROT_PACK || G.STATE === STATES.SPECTRAL_PACK || G.STATE === STATES.MOD_PACK_HAND) && G.hand.config.card_limit <= 0 && G.hand.cards.length === 0) {
    G.STATE = STATES.GAME_OVER; G.STATE_COMPLETE = false;
    return true;
  }
  G.drawn_cards = [];
  let hand_space = e || Math.min(G.deck.cards.length, G.hand.config.card_limit - G.hand.cards.length);
  // Mods may change how many cards are drawn (MoreFluff's Snake / The Serpent DX), before The Serpent.
  if (ACTIVE_MODS.length) hand_space = reduceHook('draw_hand_space', hand_space, e);
  if (G.GAME.blind.name === 'The Serpent' && !G.GAME.blind.disabled &&
      (G.GAME.current_round.hands_played > 0 || G.GAME.current_round.discards_used > 0)) {
    hand_space = Math.min(G.deck.cards.length, 3);
  }
  for (let i = 1; i <= hand_space; i++) draw_card(G.deck, G.hand, i * 100 / hand_space, 'up', true);
  // (a Lua G.FUNCS.draw_from_deck_to_hand wrap: Bunco's linked cards follow their group into the hand)
  if (ACTIVE_MODS.length) callHook('draw_from_deck_to_hand', e);
}

function new_round() {
  G.E_MANAGER.add_event(() => {
    const cr = G.GAME.current_round, rr = G.GAME.round_resets;
    cr.discards_left = Math.max(0, rr.discards + G.GAME.round_bonus.discards);
    cr.hands_left = Math.max(1, rr.hands + G.GAME.round_bonus.next_hands);
    if (ACTIVE_MODS.length) callHook('round_counts', 'after', 'new_round'); // (BETMMA's Garbage Bag / Handbag carry-over)
    cr.hands_played = 0;
    cr.discards_used = 0;
    cr.reroll_cost_increase = 0;
    cr.used_packs = {};
    if (ACTIVE_MODS.length) cr.any_hand_drawn = undefined; // SMODS: reset for the next round's first draw
    for (const v of Object.values(G.GAME.hands)) v.played_this_round = 0;
    for (const v of G.playing_cards) v.ability.wheel_flipped = undefined;
    // + SMODS round_resets.free_rerolls (SMODS.change_free_rerolls: Pokermon's Bidoof / Bibarel).
    cr.free_rerolls = find_joker('Chaos the Clown').length + (rr.free_rerolls || 0);
    calculate_reroll_cost(true);
    G.GAME.round_bonus.next_hands = 0;
    G.GAME.round_bonus.discards = 0;
    let blhash = '';
    if (rr.blind === P_BLINDS.bl_small) { rr.blind_states.Small = 'Current'; G.GAME.current_boss_streak = 0; blhash = 'S'; }
    else if (rr.blind === P_BLINDS.bl_big) { rr.blind_states.Big = 'Current'; G.GAME.current_boss_streak = 0; blhash = 'B'; }
    else { rr.blind_states.Boss = 'Current'; blhash = 'L'; }
    G.GAME.subhash = rr.ante + blhash;
    G.GAME.blind.set_blind(rr.blind);
    callHook('new_round');
    for (const j of G.jokers.cards.slice()) {
      const sctx = { setting_blind: true, blind: rr.blind };
      const eff = j.calculate_joker(sctx);
      mod_context_effect(j, eff);
      // Steamodded joker retriggers (MoreFluff's Brass Joker / CBA): an effect may evaluate again.
      if (eff) for (let t = joker_retriggers(j, sctx); t > 0; t--) mod_context_effect(j, j.calculate_joker({ ...sctx, retrigger_joker: true }));
    }
    G.E_MANAGER.add_event(() => {
      G.STATE = STATES.DRAW_TO_HAND;
      G.deck.shuffle('nr' + rr.ante);
      G.STATE_COMPLETE = false;
    });
  });
}

function end_round() {
  // Mods acting as the Lua end_round() is called, before its queued work (MoreFluff: temporary cards go).
  if (ACTIVE_MODS.length) callHook('end_round_start');
  G.E_MANAGER.add_event(() => {
    let game_over = true, game_won = false;
    if (B.beats(G.GAME.chips, G.GAME.blind.chips)) game_over = false;
    for (const j of G.jokers.cards.slice()) {
      // main_eval / beat_boss: Steamodded's end_of_round flags (vanilla jokers ignore them).
      const ectx = { end_of_round: true, game_over, main_eval: true, beat_boss: !!G.GAME.blind.boss };
      let ev = j.calculate_joker(ectx);
      for (let t = ev ? joker_retriggers(j, ectx) + 1 : 0; t > 0; t--) {
        if (ev.saved) { game_over = false; G.GAME.saved_by = j.config.center.key; }
        card_eval_status_text(j, 'jokers', null, null, null, ev);
        mod_effect_tail(j, ev, { dollars: true });
        if (t > 1) { ev = j.calculate_joker({ ...ectx, retrigger_joker: true }); if (!ev) break; } // (Steamodded joker retriggers)
      }
      j.calculate_rental();
      j.calculate_perishable();
    }
    if (ACTIVE_MODS.length) {
      // Mod consumables (e.g. Pokermon's Megastone reset) see end_of_round too, like SMODS.
      for (const c of G.consumeables.cards.slice()) {
        if (!c.config.center.mod || !c.config.center.calculate) continue;
        const ev = c.calculate_joker({ end_of_round: true, game_over, main_eval: true, beat_boss: !!G.GAME.blind.boss });
        if (ev) { card_eval_status_text(c, 'jokers', null, null, null, ev); mod_effect_tail(c, ev, { dollars: true }); }
      }
      // Held playing cards' MOD enhancements / seals see end_of_round too (Pokermon's Hazard).
      for (const hc of G.hand.cards.slice()) mod_card_calculate(hc, { end_of_round: true, cardarea: G.hand, game_over, beat_boss: !!G.GAME.blind.boss });
      callHook('end_round');
    }
    // A mod may say which blind slot this was ('Small' | 'Big' | 'Boss'): only the Boss slot wins / ends
    // the ante (MoreFluff's Superboss puts a regular boss in the Big slot). Vanilla: the blind's type.
    const slot = ACTIVE_MODS.length ? firstHook('blind_slot', G.GAME.blind) : undefined;
    const ante_boss = slot ? slot === 'Boss' : G.GAME.blind.get_type() === 'Boss';
    if (G.GAME.round_resets.ante === G.GAME.win_ante && ante_boss) {
      game_won = true;
      G.GAME.won = true;
    }
    if (game_over) {
      G.STATE = STATES.GAME_OVER;
      G.STATE_COMPLETE = false;
      return;
    }
    G.GAME.unused_discards = (G.GAME.unused_discards || 0) + G.GAME.current_round.discards_left;
    if (G.GAME.blind.get_type() === 'Boss') {
      let _handname = 'High Card', _played = -1, _order = 100;
      for (const k of HANDLIST) {
        const v = G.GAME.hands[k];
        if (v.played > _played || (v.played === _played && _order > v.order)) { _played = v.played; _handname = k; _order = v.order; }
      }
      G.GAME.current_round.most_played_poker_hand = _handname;
      G.GAME.current_boss_streak += 1;
    }
    if (game_won && !G.GAME.win_notified) {
      G.GAME.win_notified = true;
      G.E_MANAGER.add_event(() => { G.GAME.won = true; emit('win', { ante: G.GAME.round_resets.ante, stake: G.GAME.stake, jokers: joker_win_keys() }); });
    }
    for (let i = 0; i < G.hand.cards.length; i++) {
      const hc = G.hand.cards[i];
      const reps = [1];
      for (let j = 0; j < reps.length; j++) {
        if (reps[j] !== 1) card_eval_status_text((reps[j].jokers || reps[j].seals).card, 'jokers', null, null, null, reps[j].jokers || reps[j].seals);
        const effects = [hc.get_end_of_round_effect()];
        for (const jk of G.jokers.cards) {
          const ev = jk.calculate_joker({ cardarea: G.hand, other_card: hc, individual: true, end_of_round: true });
          if (ev) effects.push(ev);
        }
        if (reps[j] === 1) {
          const ev = eval_card(hc, { end_of_round: true, cardarea: G.hand, repetition: true, repetition_only: true });
          if (next(ev) && (next(effects[0]) || effects.length > 1)) for (let h = 0; h < ev.seals.repetitions; h++) reps.push(ev);
          for (const jk of G.jokers.cards) {
            const ev2 = eval_card(jk, { cardarea: G.hand, other_card: hc, repetition: true, end_of_round: true, card_effects: effects });
            // (a joker's eval can be non-empty without a repetition: a mod joker with held values, BETMMA's Balatro Mobile)
            if (next(ev2) && ev2.jokers) for (let h = 0; h < (ev2.jokers.repetitions || 0); h++) reps.push(ev2);
          }
        }
        for (const ef of effects) {
          if (ef.card) juice_card(ef.card);
          if (ef.h_dollars) { ease_dollars(ef.h_dollars); card_eval_status_text(hc, 'dollars', ef.h_dollars); }
          // SMODS: a mod joker's end-of-round held-card effect may pay `dollars` (Chikorita line).
          if (ef.dollars && ef !== effects[0]) { ease_dollars(ef.dollars); card_eval_status_text(hc, 'dollars', ef.dollars); }
          if (ef.extra) card_eval_status_text(hc, 'extra', null, null, null, ef.extra);
        }
      }
    }
    draw_from_hand_to_discard();
    if (ante_boss) {
      G.GAME.voucher_restock = null;
      if (G.GAME.modifiers.set_eternal_ante && G.GAME.round_resets.ante === G.GAME.modifiers.set_eternal_ante) for (const v of G.jokers.cards) v.set_eternal(true);
      if (G.GAME.modifiers.set_joker_slots_ante && G.GAME.round_resets.ante === G.GAME.modifiers.set_joker_slots_ante) G.jokers.config.card_limit = 0;
      ease_ante(1);
    }
    draw_from_discard_to_deck();
    G.E_MANAGER.add_event(() => {
      G.STATE = STATES.ROUND_EVAL;
      G.STATE_COMPLETE = false;
      const rr = G.GAME.round_resets;
      if (slot ? slot === 'Small' : rr.blind === P_BLINDS.bl_small) rr.blind_states.Small = 'Defeated';
      else if (slot ? slot === 'Big' : rr.blind === P_BLINDS.bl_big) rr.blind_states.Big = 'Defeated';
      else {
        G.GAME.current_round.voucher = get_next_voucher_key();
        G.GAME.current_round.extra_vouchers = null; // (SMODS voucher slots: new ones next ante)
        rr.blind_states.Boss = 'Defeated';
        for (const v of G.playing_cards) v.ability.played_this_ante = undefined;
      }
      if (rr.temp_handsize) { G.hand.change_size(-rr.temp_handsize); rr.temp_handsize = null; }
      if (rr.temp_reroll_cost) { rr.temp_reroll_cost = null; calculate_reroll_cost(true); }
      reset_idol_card();
      reset_mail_rank();
      reset_ancient_card();
      reset_castle_card();
      callHook('reset_game_globals', false);
      for (const v of G.playing_cards) { v.ability.discarded = undefined; v.ability.forced_selection = undefined; }
    });
  });
}

function draw_from_play_to_discard() {
  // A mod wrapping G.FUNCS.draw_from_play_to_discard (BETMMA: flipped cards go back to the hand first,
  // and the rest follow in an event, after the hand's queued shatters — a Bulletproof Glass Card stays).
  if (ACTIVE_MODS.length && hasHook('draw_from_play_to_discard')) {
    callHook('draw_from_play_to_discard');
    G.E_MANAGER.add_event(() => { for (const v of G.play.cards.slice()) if (!v.shattered && !v.destroyed) draw_card(G.play, G.discard, 0, 'down', false, v); });
    return;
  }
  for (const v of G.play.cards.slice()) if (!v.shattered && !v.destroyed) draw_card(G.play, G.discard, 0, 'down', false, v);
}
export function draw_from_play_to_hand(cards) {
  for (const c of cards) if (!c.shattered && !c.destroyed) draw_card(G.play, G.hand, 0, 'up', true, c);
}
function draw_from_discard_to_deck() {
  G.E_MANAGER.add_event(() => {
    const n = G.discard.cards.length;
    for (let i = 0; i < n; i++) draw_card(G.discard, G.deck);
  });
}
export function draw_from_hand_to_deck() {
  const n = G.hand.cards.length;
  for (let i = 0; i < n; i++) draw_card(G.hand, G.deck);
}
function draw_from_hand_to_discard() {
  const n = G.hand.cards.length;
  for (let i = 0; i < n; i++) draw_card(G.hand, G.discard);
}

// ----------------------------------------------------------- hand eval
function get_X_same(num, hand) {
  const vals = Array.from({ length: 15 }, () => []);
  for (let i = hand.length - 1; i >= 0; i--) {
    const curr = [hand[i]];
    for (let j = 0; j < hand.length; j++) if (hand[i].get_id() === hand[j].get_id() && i !== j) curr.push(hand[j]);
    if (curr.length === num) { const id = curr[0].get_id(); if (id >= 0) vals[id] = curr; }
  }
  const ret = [];
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i].length) ret.push(vals[i]);
  return ret;
}
export function get_flush(hand) {
  const four = find_joker('Four Fingers').length > 0;
  const need = reduceHook('flush_min', 5 - (four ? 1 : 0), hand);
  // (Steamodded drops vanilla's "more than 5 cards: no flush/straight" — mods let you play more: BETMMA's Slate)
  if ((hand.length > 5 && !ACTIVE_MODS.length) || hand.length < need) return [];
  for (const suit of reduceHook('flush_suits', ['Spades', 'Hearts', 'Clubs', 'Diamonds'], hand)) {
    const t = hand.filter((c) => c.is_suit(suit, null, true));
    if (t.length >= need) return [t];
  }
  return [];
}
function get_straight(hand) {
  const four = find_joker('Four Fingers').length > 0;
  const need = reduceHook('straight_min', 5 - (four ? 1 : 0), hand);
  if ((hand.length > 5 && !ACTIVE_MODS.length) || hand.length < need) return [];
  let t = [];
  const IDS = {};
  for (const c of hand) {
    const id = c.get_id();
    if (id > 1 && id < 15) (IDS[id] = IDS[id] || []).push(c);
  }
  let straight_length = 0, straight = false, skipped_rank = false;
  const can_skip = find_joker('Shortcut').length > 0;
  for (let j = 1; j <= 14; j++) {
    const ids = IDS[j === 1 ? 14 : j];
    if (ids) {
      straight_length++;
      skipped_rank = false;
      for (const v of ids) t.push(v);
    } else if (can_skip && !skipped_rank && j !== 14) {
      skipped_rank = true;
    } else {
      straight_length = 0;
      skipped_rank = false;
      if (!straight) t = [];
      if (straight) break;
    }
    if (straight_length >= need) straight = true;
  }
  if (!straight) return [];
  return [t];
}
function get_highest(hand) {
  let highest = null;
  for (const v of hand) if (!highest || v.get_nominal() > highest.get_nominal()) highest = v;
  return hand.length > 0 ? [[highest]] : [];
}
export function evaluate_poker_hand(hand) {
  const results = {
    'Flush Five': [], 'Flush House': [], 'Five of a Kind': [], 'Straight Flush': [], 'Four of a Kind': [],
    'Full House': [], Flush: [], Straight: [], 'Three of a Kind': [], 'Two Pair': [], Pair: [], 'High Card': [], top: null,
  };
  const parts = {
    _5: get_X_same(5, hand), _4: get_X_same(4, hand), _3: get_X_same(3, hand), _2: get_X_same(2, hand),
    _flush: get_flush(hand), _straight: get_straight(hand), _highest: get_highest(hand),
  };
  const setTop = (k) => { if (!results.top) results.top = results[k]; };
  if (parts._5.length && parts._flush.length) { results['Flush Five'] = parts._5; setTop('Flush Five'); }
  if (parts._3.length && parts._2.length && parts._flush.length) { results['Flush House'].push([...parts._3[0], ...parts._2[0]]); setTop('Flush House'); }
  if (parts._5.length) { results['Five of a Kind'] = parts._5; setTop('Five of a Kind'); }
  if (parts._flush.length && parts._straight.length) {
    const ret = [...parts._flush[0]];
    for (const v of parts._straight[0]) if (!parts._flush[0].includes(v)) ret.push(v);
    results['Straight Flush'] = [ret]; setTop('Straight Flush');
  }
  if (parts._4.length) { results['Four of a Kind'] = parts._4; setTop('Four of a Kind'); }
  if (parts._3.length && parts._2.length) { results['Full House'].push([...parts._3[0], ...parts._2[0]]); setTop('Full House'); }
  if (parts._flush.length) { results.Flush = parts._flush; setTop('Flush'); }
  if (parts._straight.length) { results.Straight = parts._straight; setTop('Straight'); }
  if (parts._3.length) { results['Three of a Kind'] = parts._3; setTop('Three of a Kind'); }
  if (parts._2.length === 2 || (parts._3.length === 1 && parts._2.length === 1)) {
    const a = parts._2[0], b = parts._2[1] || parts._3[0];
    results['Two Pair'].push([...a, ...b]); setTop('Two Pair');
  }
  if (parts._2.length) { results.Pair = parts._2; setTop('Pair'); }
  if (parts._highest.length) { results['High Card'] = parts._highest; setTop('High Card'); }
  // Lua: a table indexed [1..4] by the first four groups (nil-padded) — keep the non-empty ones.
  if (results['Five of a Kind'][0]) results['Four of a Kind'] = results['Five of a Kind'].slice(0, 4);
  if (results['Four of a Kind'][0]) results['Three of a Kind'] = results['Four of a Kind'].slice(0, 3);
  if (results['Three of a Kind'][0]) results.Pair = results['Three of a Kind'].slice(0, 2);
  // Mod poker hands (SMODS.PokerHand / PokerHandPart, e.g. Bunco's Spectrums): evaluated on Steamodded's parts.
  if (ACTIVE_MODS.length) evaluate_mod_hands(results, hand);
  if (ACTIVE_MODS.length) callHook('evaluate_poker_hand', results, hand); // (a Lua evaluate_poker_hand wrap: BETMMA's Ascension)
  return results;
}
/** SMODS get_X_same(num, hand, or_more = true): every rank group of at least `num` cards, highest rank first. */
function get_X_same_or_more(num, hand) {
  const vals = {};
  for (let i = hand.length - 1; i >= 0; i--) {
    const curr = [hand[i]];
    for (let j = 0; j < hand.length; j++) if (hand[i].get_id() === hand[j].get_id() && i !== j) curr.push(hand[j]);
    if (curr.length >= num) { const id = curr[0].get_id(); if (id >= 0) vals[id] = curr; }
  }
  return Object.keys(vals).map(Number).sort((a, b) => b - a).map((id) => vals[id]);
}
/** SMODS.merge_lists(...): the lists' cards in order, without duplicates -> [cards]. */
export function merge_lists(...lists) {
  const out = [];
  for (const l of lists) for (const li of l || []) for (const c of li || []) if (!out.includes(c)) out.push(c);
  return out;
}
function evaluate_mod_hands(results, hand) {
  const mod = activeModHands();
  if (!mod.length) return;
  const parts = {
    _highest: get_highest(hand), _straight: get_straight(hand), _flush: get_flush(hand),
    _2: get_X_same_or_more(2, hand), _3: get_X_same_or_more(3, hand), _4: get_X_same_or_more(4, hand), _5: get_X_same_or_more(5, hand),
  };
  parts._all_pairs = parts._2.length ? [merge_lists(parts._2)] : [];
  for (const p of activeModHandParts()) parts[p.key] = p.func(hand) || [];
  for (const h of mod) results[h.key] = h.evaluate(parts, hand) || [];
  results.top = null;
  for (const k of HANDLIST) if (results[k] && results[k].length) { results.top = results[k]; break; }
}
const HAND_ORDER = ['Flush Five', 'Flush House', 'Five of a Kind', 'Straight Flush', 'Four of a Kind', 'Full House', 'Flush', 'Straight', 'Three of a Kind', 'Two Pair', 'Pair', 'High Card'];
/** -> {text, disp_text, poker_hands, scoring_hand} */
export function get_poker_hand_info(_cards) {
  const poker_hands = evaluate_poker_hand(_cards);
  let scoring_hand = [], text = 'NULL';
  // (with mod hands, the run's hand list orders them; it is HAND_ORDER otherwise)
  for (const h of HANDLIST.length > HAND_ORDER.length ? HANDLIST : HAND_ORDER) if (poker_hands[h] && poker_hands[h].length) { text = h; scoring_hand = poker_hands[h][0].slice(); break; }
  let disp_text = text;
  if (text === 'Straight Flush') {
    let min = 10;
    for (const c of scoring_hand) if (c.get_id() < min) min = c.get_id();
    if (min >= 10) disp_text = 'Royal Flush';
  } else if (ACTIVE_MODS.length) {
    // A mod hand's own display name (SMODS modify_display_text: Bunco's Royal Spectrum).
    const mh = activeModHands().find((h) => h.key === text);
    if (mh && mh.modify_display_text) disp_text = mh.modify_display_text(mh, _cards, scoring_hand) || disp_text;
  }
  return { text, disp_text, loc_disp_text: localize(disp_text, 'poker_hands'), poker_hands, scoring_hand };
}

// ------------------------------------------------- mod contexts / effects
/**
 * misc_functions.lua set_joker_win: the jokers that earn this win (a stake sticker on each, per profile) — every
 * joker held, plus the keys a mod adds for it (Pokermon's previous-evolution stickers: joker_win_keys hook).
 * Reported in the 'win' event (`jokers`, with `stake`) for the client's profile; the run itself doesn't change.
 */
function joker_win_keys() {
  const out = [];
  for (const v of G.jokers.cards) {
    if (!v.config.center_key || v.ability.set !== 'Joker') continue;
    if (!out.includes(v.config.center_key)) out.push(v.config.center_key);
    if (ACTIVE_MODS.length) for (const ks of callHook('joker_win_keys', v)) for (const k of ks || []) if (!out.includes(k)) out.push(k);
  }
  return out;
}

// (mod_context_effect / mod_effect_tail live in core.js, so the vanilla contexts in core / consumables /
// jokers route MOD returns through them too; re-exported here for the mods that import them from run.js.)
export { mod_context_effect, mod_effect_tail };

/**
 * Steamodded / Talisman scoring keys a MOD return may carry beyond the ones the vanilla scoring loops
 * read: x_chips (xchips / Xchip_mod), e_chips / e_mult (echips / emult: ^n), and swap (chips <-> mult);
 * plus, down its `extra` chain, every scoring key (SMODS evaluates each `extra` like a return of its own —
 * MoreFluff's Complexity Creep chains its effects this way). Only for returns from MOD cards
 * (`eff._mod`, set by normalize_mod_effect) or mod enhancements; vanilla scoring is untouched.
 *   opts.held       the held-in-hand loop: the return's own `mult` / `chips` count too (vanilla reads h_mult)
 *   opts.individual the per-card loop: vanilla already applied the first `extra`'s mult_mod / chip_mod / swap
 *   opts.joker      a joker-row context: mod_effect_tail shows the chain's messages
 * -> [hand_chips, mult]
 */
export function mod_score_ops(eff, at, hand_chips, mult, opts = {}) {
  if (!ACTIVE_MODS.length || !eff || typeof eff !== 'object') return [hand_chips, mult];
  const c0 = hand_chips, m0 = mult;
  const say = (message, colour) => card_eval_status_text(at, 'extra', null, null, null, { message, colour });
  const ops = (r, level) => {
    const own = level === 0;
    if (!own || opts.held) {
      const c = r.chips ?? (own ? undefined : r.chip_mod);
      if (c && !(opts.individual && level === 1 && r.chip_mod !== undefined && r.chips === undefined)) { hand_chips = mod_chips(B.add(hand_chips, c)); if (!own && !r.message) say('+' + c, 'CHIPS'); }
      const m = r.mult ?? (own ? undefined : r.mult_mod);
      if (m && !(opts.individual && level === 1 && r.mult_mod !== undefined && r.mult === undefined)) { mult = mod_mult(B.add(mult, m)); if (!own && !r.message) say('+' + m + ' Mult', 'MULT'); }
    }
    const xc = r.x_chips ?? r.xchips ?? r.Xchip_mod;
    if (xc !== undefined && xc !== 1) { hand_chips = mod_chips(B.mul(hand_chips, xc)); if (!r.message) say('X' + xc + ' Chips', 'CHIPS'); }
    if (!own) {
      const xm = r.x_mult ?? r.xmult ?? r.Xmult ?? r.Xmult_mod;
      if (xm !== undefined && xm !== 1) { mult = mod_mult(B.mul(mult, xm)); if (!r.message) say('X' + xm + ' Mult', 'MULT'); }
    }
    const ec = r.e_chips ?? r.echips ?? r.Echip_mod;
    if (ec !== undefined && ec !== 1) { hand_chips = mod_chips(B.pow(hand_chips, ec)); if (!r.message) say('^' + ec + ' Chips', 'DARK_EDITION'); }
    const em = r.e_mult ?? r.emult ?? r.Emult_mod;
    if (em !== undefined && em !== 1) { mult = mod_mult(B.pow(mult, em)); if (!r.message) say('^' + em + ' Mult', 'DARK_EDITION'); }
    if (r.swap && !(opts.individual && level === 1)) { const om = mult; mult = mod_mult(hand_chips); hand_chips = mod_chips(om); if (!own && !r.message) say(localize('k_swap_ex') === 'k_swap_ex' ? 'Swap!' : localize('k_swap_ex')); }
    if (!own && r.message && opts.individual && level > 1) say(r.message, r.colour);
  };
  ops(eff, 0);
  if (eff._mod || opts.held || opts.chain) {
    let x = eff.extra, level = 1, guard = 0;
    while (x && typeof x === 'object' && guard++ < 20) { ops(x, level++); x = x.extra; }
  }
  if (hand_chips !== c0 || mult !== m0) emit('hand_text', { chips: hand_chips, mult });
  return [hand_chips, mult];
}

/**
 * Steamodded's SMODS.calculate_effect(effect, scored_card) for a mod's effect table in a place the
 * vanilla loops don't read it (AMM Aspects / Stamps, unscored cards): every key in SMODS.calculation_keys
 * order - chips, h_chips, chip_mod, x_chips (xchips, Xchip_mod), mult, h_mult, mult_mod, x_mult (Xmult,
 * xmult, x_mult_mod, Xmult_mod), p_dollars, dollars, h_dollars, swap, balance, message, level_up, func,
 * extra (evaluated like its own effect) - with SMODS's default popups (none for the *_mod keys, or
 * with remove_default_message). Outside scoring (hand_chips undefined) the scoring keys are skipped.
 * -> [hand_chips, mult]
 */
export function smods_effect(effect, scored_card, hand_chips, mult, depth = 0) {
  if (!effect || typeof effect !== 'object' || depth > 20) return [hand_chips, mult];
  const has = (k) => effect[k] !== undefined && effect[k] !== null && effect[k] !== false;
  const at = effect.message_card || effect.juice_card || scored_card || effect.card || effect.focus;
  const juice = () => { if (effect.card && effect.card !== scored_card) juice_card(effect.card); };
  const say = (type, amt, ex) => { if (!effect.remove_default_message) card_eval_status_text(at, type, amt, null, null, ex); };
  const scoring = hand_chips !== undefined && mult !== undefined;
  if (scoring) {
    for (const k of ['chips', 'h_chips', 'chip_mod']) if (has(k)) {
      juice(); hand_chips = mod_chips(B.add(hand_chips, effect[k])); emit('hand_text', { chips: hand_chips });
      if (k !== 'chip_mod') { if (effect.chip_message) say('extra', null, effect.chip_message); else say('chips', effect[k]); }
    }
    for (const k of ['x_chips', 'xchips', 'Xchip_mod']) if (has(k) && effect[k] !== 1) {
      juice(); hand_chips = mod_chips(B.mul(hand_chips, effect[k])); emit('hand_text', { chips: hand_chips });
      if (k !== 'Xchip_mod') { if (effect.xchip_message) say('extra', null, effect.xchip_message); else say('extra', null, { message: 'X' + effect[k] + ' Chips', colour: 'CHIPS' }); }
    }
    for (const k of ['mult', 'h_mult', 'mult_mod']) if (has(k)) {
      juice(); mult = mod_mult(B.add(mult, effect[k])); emit('hand_text', { mult });
      if (k !== 'mult_mod') { if (effect.mult_message) say('extra', null, effect.mult_message); else say('mult', effect[k]); }
    }
    for (const k of ['x_mult', 'Xmult', 'xmult', 'x_mult_mod', 'Xmult_mod']) if (has(k) && effect[k] !== 1) {
      juice(); mult = mod_mult(B.mul(mult, effect[k])); emit('hand_text', { mult });
      if (k !== 'Xmult_mod') { if (effect.xmult_message) say('extra', null, effect.xmult_message); else say('x_mult', effect[k]); }
    }
  }
  for (const k of ['p_dollars', 'dollars', 'h_dollars']) if (has(k)) {
    juice(); ease_dollars(effect[k]);
    if (effect.dollar_message) say('extra', null, effect.dollar_message); else say('dollars', effect[k]);
  }
  if (scoring && effect.swap) { juice(); const om = mult; mult = mod_mult(hand_chips); hand_chips = mod_chips(om); emit('hand_text', { chips: hand_chips, mult }); }
  if (scoring && effect.balance) {
    juice(); const tot = B.add(mult, hand_chips); mult = mod_mult(B.div(tot, 2)); hand_chips = mod_chips(B.div(tot, 2)); emit('hand_text', { chips: hand_chips, mult });
    say('extra', null, effect.balance_message || { message: localize('k_balanced'), colour: 'PURPLE' });
  }
  if (effect.message) { juice(); card_eval_status_text(at, 'extra', null, null, null, effect); }
  if (has('level_up')) level_up_hand(scored_card, effect.level_up_hand || G.GAME.last_hand_played, effect.instant, effect.level_up === true ? 1 : effect.level_up);
  if (typeof effect.func === 'function') effect.func();
  if (effect.extra && typeof effect.extra === 'object') [hand_chips, mult] = smods_effect(effect.extra, scored_card, hand_chips, mult, depth + 1);
  return [hand_chips, mult];
}

/**
 * Steamodded's SMODS.calculate_context for contexts the base game doesn't have
 * (post_discard, hand_drawn, poke_evolved, ...): every MOD joker / consumable gets the
 * context (base-game cards don't know these contexts and are skipped), then each active
 * mod's `calculate` hook. Returned effects are evaluated like SMODS.calculate_effect:
 * message, dollars, func, extra. Returns the list of [card, effect] pairs.
 */
export function calculate_context(context) {
  const out = [];
  for (const area of [G.jokers, G.consumeables]) {
    for (const c of area.cards.slice()) {
      if (!c.config.center.mod || !c.config.center.calculate) continue;
      const eff = c.calculate_joker(context);
      if (!eff) continue;
      out.push([c, eff]);
      if (eff.message) card_eval_status_text(eff.message_card || c, 'extra', null, null, null, eff);
      mod_effect_tail(c, eff, { dollars: true });
    }
  }
  for (const r of callHook('calculate', context)) out.push([null, r]);
  return out;
}

/**
 * Steamodded better_calc.toml: a non-playing card destroyed while `getting_sliced` (Ceremonial
 * Dagger, Madness, mod jokers that eat others) fires joker_type_destroyed for mod cards first; a
 * {no_destroy} answer saves it. No-op in vanilla runs. (Nacho's Passimian receives the ability.)
 */
for (const m of ['start_dissolve', 'shatter']) {
  const base = Card.prototype[m];
  Card.prototype[m] = function (...args) {
    if (ACTIVE_MODS.length && this.getting_sliced && this.ability && this.ability.set !== 'Default' && this.ability.set !== 'Enhanced') {
      const flags = calculate_context({ joker_type_destroyed: true, card: this, shatters: m === 'shatter' || undefined });
      if (flags.some(([, e]) => e && e.no_destroy)) { this.getting_sliced = undefined; return undefined; }
    }
    return base.apply(this, args);
  };
}

/**
 * Steamodded joker retriggers (optional feature retrigger_joker, which Nacho turns on): each time a
 * joker's effect is evaluated, mod jokers answering `retrigger_joker_check` (other_card = that joker)
 * with {repetitions} make it evaluate again with `retrigger_joker = true`. -> extra evaluations.
 * Only mod jokers whose calculate mentions retrigger_joker_check are asked; 0 in vanilla runs.
 */
export function joker_retriggers(card, context) {
  if (!ACTIVE_MODS.length || context.retrigger_joker || context.retrigger_joker_check) return 0;
  let n = 0;
  for (const j of G.jokers.cards) {
    const c = j.config.center;
    if (!c.mod || !c.calculate || j.debuff) continue;
    if (c._retrig === undefined) c._retrig = String(c.calculate).includes('retrigger_joker_check');
    if (!c._retrig) continue;
    const r = j.calculate_joker({ retrigger_joker_check: true, other_card: card, other_context: context });
    if (r && r.repetitions) { n += r.repetitions; card_eval_status_text(r.card || j, 'extra', null, null, null, r); }
  }
  // (a mod's own retriggers for this joker: AutumnCircus' Sock and Buskin Stamp)
  n = reduceHook('joker_retriggers', n, card, context);
  return n;
}

// -------------------------------------------------------- evaluate_play
function evaluate_play() {
  const { text, disp_text, poker_hands } = get_poker_hand_info(G.play.cards);
  let { scoring_hand } = get_poker_hand_info(G.play.cards);
  const gh = G.GAME.hands[text];
  gh.played += 1;
  gh.played_this_round += 1;
  G.GAME.last_hand_played = text;
  set_hand_usage(text);
  gh.visible = true;

  const pures = [];
  for (let i = 0; i < G.play.cards.length; i++) {
    if (find_joker('Splash').length || callHook('splash', G.play.cards).includes(true)) scoring_hand[i] = G.play.cards[i];
    // SMODS always_scores enhancements (Pokermon's Hazard) score like Stone Cards.
    else if ((G.play.cards[i].ability.effect === 'Stone Card' || G.play.cards[i].config.center.always_scores) && !scoring_hand.includes(G.play.cards[i])) pures.push(G.play.cards[i]);
  }
  scoring_hand = scoring_hand.filter(Boolean).concat(pures);
  // Lua sorts by screen x; cards in G.play are laid out in area order.
  scoring_hand.sort((a, b) => G.play.cards.indexOf(a) - G.play.cards.indexOf(b));
  emit('scoring_hand', { cards: scoring_hand.map((c) => c.sort_id), hand: text, disp: disp_text });

  let mult, hand_chips;
  const base_ctx = () => ({ full_hand: G.play.cards, scoring_hand, scoring_name: text, poker_hands });

  emit('hand_text', { handname: disp_text, level: gh.level, chips: gh.chips, mult: gh.mult });
  if (!G.GAME.blind.debuff_hand(G.play.cards, poker_hands, text)) {
    mult = mod_mult(gh.mult);
    hand_chips = mod_chips(gh.chips);
    if (G.GAME.first_used_hand_level && G.GAME.first_used_hand_level > 0) {
      level_up_hand(G.deck.cards[0], text, null, G.GAME.first_used_hand_level);
      G.GAME.first_used_hand_level = null;
    }
    for (const j of G.jokers.cards.slice()) {
      const bctx = { cardarea: G.jokers, ...base_ctx(), before: true };
      let effects = eval_card(j, bctx);
      for (let t = effects.jokers ? joker_retriggers(j, bctx) + 1 : 0; t > 0; t--) {
        card_eval_status_text(j, 'jokers', null, null, null, effects.jokers);
        if (effects.jokers.level_up) level_up_hand(j, text);
        mod_effect_tail(j, effects.jokers, { dollars: true });
        if (t > 1) { effects = eval_card(j, { ...bctx, retrigger_joker: true }); if (!effects.jokers) break; } // (Steamodded joker retriggers)
      }
    }
    mult = mod_mult(gh.mult);
    hand_chips = mod_chips(gh.chips);
    // Mods acting on the base score before the blind's modify_hand (Bunco's Chips / Mult Tags). -> [hand_chips, mult]
    if (ACTIVE_MODS.length) [hand_chips, mult] = reduceHook('modify_scoring', [hand_chips, mult], 'before_blind', base_ctx());
    const mh = G.GAME.blind.modify_hand(G.play.cards, poker_hands, text, mult, hand_chips);
    mult = mod_mult(mh[0]); hand_chips = mod_chips(mh[1]);
    if (mh[2]) emit('hand_text', { chips: hand_chips, mult, modded: true });
    emit('hand_text', { chips: hand_chips, mult });
    // Mods may act on the running score here, before any card scores (MoreFluff's before_scoring_ctx:
    // Unregistered Hypercam 2 / Hyperjimbo). -> [hand_chips, mult]
    if (ACTIVE_MODS.length) [hand_chips, mult] = reduceHook('modify_scoring', [hand_chips, mult], 'before_cards', base_ctx());

    // One played card's scoring (its repetitions, effects and edition). `again`: a mod scores it a
    // second time (SMODS.score_card — Bunco's Copper Cards); the play isn't counted twice.
    const score_played_card = (sc, again) => {
      if (!again && sc.ability.effect !== 'Stone Card') {
        const cp = G.GAME.cards_played[sc.base.value];
        if (cp) { cp.total += 1; cp.suits[sc.base.suit] = true; }
      }
      if (sc.debuff) {
        G.GAME.blind.triggered = true;
        emit('blind_juice', {});
        card_eval_status_text(sc, 'debuff');
        return;
      }
      const reps = [1];
      const sev = eval_card(sc, { repetition_only: true, cardarea: G.play, ...base_ctx(), repetition: true });
      if (next(sev)) for (let h = 0; h < sev.seals.repetitions; h++) reps.push(sev);
      for (const j of G.jokers.cards) {
        const rctx = { cardarea: G.play, ...base_ctx(), other_card: sc, repetition: true };
        const ev = eval_card(j, rctx);
        if (next(ev) && ev.jokers) {
          for (let h = 0; h < ev.jokers.repetitions; h++) reps.push(ev);
          for (let t = joker_retriggers(j, rctx); t > 0; t--) {
            const ev2 = eval_card(j, { ...rctx, retrigger_joker: true });
            if (next(ev2) && ev2.jokers) for (let h = 0; h < ev2.jokers.repetitions; h++) reps.push(ev2);
          }
        }
      }
      for (let r = 0; r < reps.length; r++) {
        if (reps[r] !== 1) card_eval_status_text((reps[r].jokers || reps[r].seals).card, 'jokers', null, null, null, reps[r].jokers || reps[r].seals);
        const effects = [eval_card(sc, { cardarea: G.play, full_hand: G.play.cards, scoring_hand, poker_hand: text })];
        for (const j of G.jokers.cards) {
          const ictx = { cardarea: G.play, ...base_ctx(), other_card: sc, individual: true };
          const ev = j.calculate_joker(ictx);
          if (ev) {
            effects.push(ev);
            // Steamodded joker retriggers: a mod joker may make this joker's per-card effect happen again.
            for (let t = joker_retriggers(j, ictx); t > 0; t--) { const ev2 = j.calculate_joker({ ...ictx, retrigger_joker: true }); if (ev2) effects.push(ev2); }
          }
        }
        sc.lucky_trigger = undefined;
        for (const ef of effects) {
          if (ef.chips) { if (ef.card) juice_card(ef.card); hand_chips = mod_chips(B.add(hand_chips, ef.chips)); card_eval_status_text(sc, 'chips', ef.chips); emit('hand_text', { chips: hand_chips }); }
          if (ef.mult) { if (ef.card) juice_card(ef.card); mult = mod_mult(B.add(mult, ef.mult)); card_eval_status_text(sc, 'mult', ef.mult); emit('hand_text', { mult }); }
          if (ef.p_dollars) { if (ef.card) juice_card(ef.card); ease_dollars(ef.p_dollars); card_eval_status_text(sc, 'dollars', ef.p_dollars); }
          if (ef.dollars) { if (ef.card) juice_card(ef.card); ease_dollars(ef.dollars); card_eval_status_text(sc, 'dollars', ef.dollars); }
          if (ef.extra) {
            if (ef.card) juice_card(ef.card);
            if (ef.extra.mult_mod) mult = mod_mult(B.add(mult, ef.extra.mult_mod));
            if (ef.extra.chip_mod) hand_chips = mod_chips(B.add(hand_chips, ef.extra.chip_mod));
            if (ef.extra.swap) { const om = mult; mult = mod_mult(hand_chips); hand_chips = mod_chips(om); }
            if (ef.extra.func) ef.extra.func();
            card_eval_status_text(sc, 'extra', null, null, null, ef.extra);
            emit('hand_text', { chips: hand_chips, mult });
          }
          if (ef.x_mult) { if (ef.card) juice_card(ef.card); mult = mod_mult(B.mul(mult, ef.x_mult)); card_eval_status_text(sc, 'x_mult', ef.x_mult); emit('hand_text', { mult }); }
          if (ACTIVE_MODS.length && (ef._mod || ef === effects[0])) [hand_chips, mult] = mod_score_ops(ef, sc, hand_chips, mult, { individual: true });
          if (ef.edition && (ef.edition.chip_mod || ef.edition.mult_mod || ef.edition.x_mult_mod || !ef.edition.x_chip_mod)) {
            hand_chips = mod_chips(B.add(hand_chips, (ef.edition.chip_mod || 0)));
            mult = B.add(mult, ef.edition.mult_mod || 0);
            mult = mod_mult(B.mul(mult, (ef.edition.x_mult_mod || 1)));
            card_eval_status_text(sc, 'extra', null, null, null, {
              message: ef.edition.chip_mod ? '+' + ef.edition.chip_mod : ef.edition.mult_mod ? '+' + ef.edition.mult_mod + ' Mult' : 'X' + ef.edition.x_mult_mod + ' Mult',
              chip_mod: ef.edition.chip_mod, mult_mod: ef.edition.mult_mod, x_mult_mod: ef.edition.x_mult_mod, edition: true,
            });
            emit('hand_text', { chips: hand_chips, mult });
          }
          // A mod edition's X Chips (Bunco's Glitter), after the card's own effects.
          if (ef.edition && ef.edition.x_chip_mod) {
            hand_chips = mod_chips(B.mul(hand_chips, ef.edition.x_chip_mod));
            card_eval_status_text(sc, 'extra', null, null, null, { message: 'X' + ef.edition.x_chip_mod + ' ' + localize('bunc_chips'), edition: true, colour: 'CHIPS' });
            emit('hand_text', { chips: hand_chips, mult });
          }
          // Mod effects on the card itself after its seal (SMODS trigger order: AMM Aspects), each a full SMODS effect.
          if (ef.post_effects) for (const pe of ef.post_effects) [hand_chips, mult] = smods_effect(pe, sc, hand_chips, mult);
        }
      }
    };
    // SMODS optional feature 'unscored' (a mod turns it on): the played cards that don't score get their own
    // main-scoring pass in play order (cardarea 'unscored': the card's own mod effects, then jokers' individual).
    const unscored_on = ACTIVE_MODS.length > 0 && feature('unscored');
    const score_unscored_card = (uc) => {
      if (uc.debuff) return;
      const uctx = () => ({ cardarea: 'unscored', ...base_ctx() });
      const reps = [1];
      for (let r = 0; r < reps.length; r++) {
        if (reps[r] !== 1) card_eval_status_text((reps[r].jokers || reps[r].seals).card || uc, 'jokers', null, null, null, reps[r].jokers || reps[r].seals);
        const effects = [];
        for (const e of callHook('unscored_card', uc, { ...uctx(), main_scoring: true })) for (const x of [].concat(e)) if (x) effects.push(x);
        for (const j of G.jokers.cards) {
          const ictx = { ...uctx(), other_card: uc, individual: true };
          const ev = j.calculate_joker(ictx);
          if (ev) {
            effects.push(ev);
            for (let t = joker_retriggers(j, ictx); t > 0; t--) { const ev2 = j.calculate_joker({ ...ictx, retrigger_joker: true }); if (ev2) effects.push(ev2); }
          }
        }
        for (const ef of effects) [hand_chips, mult] = smods_effect(ef, uc, hand_chips, mult);
        if (r === 0 && effects.length) {
          const sev = eval_card(uc, { repetition_only: true, ...uctx(), repetition: true });
          if (next(sev) && sev.seals) for (let h = 0; h < (sev.seals.repetitions || 0); h++) reps.push(sev);
          for (const j of G.jokers.cards) {
            const ev = eval_card(j, { ...uctx(), other_card: uc, repetition: true, card_effects: effects });
            if (next(ev) && ev.jokers) for (let h = 0; h < (ev.jokers.repetitions || 0); h++) reps.push(ev);
          }
        }
      }
    };
    if (unscored_on) { for (const c of G.play.cards.slice()) { if (scoring_hand.includes(c)) score_played_card(c); else score_unscored_card(c); } }
    else for (let i = 0; i < scoring_hand.length; i++) score_played_card(scoring_hand[i]);
    // Mods may score played cards again once they've all scored (SMODS.score_card from a post-effect: Bunco's Copper).
    if (ACTIVE_MODS.length) callHook('rescore_cards', scoring_hand, base_ctx(), (c) => score_played_card(c, true));

    // Mods acting once the played cards have scored (BETMMA's Double Flipped Card: flipped ones are held now)
    if (ACTIVE_MODS.length) callHook('played_cards_scored');
    // Held-in-hand effects (one held card's scoring; mods may score more cards as held: G.scoring.score_held)
    const score_held_card = (hc) => {
      const reps = [1];
      for (let r = 0; r < reps.length; r++) {
        if (reps[r] !== 1) card_eval_status_text((reps[r].jokers || reps[r].seals).card, 'jokers', null, null, null, reps[r].jokers || reps[r].seals);
        const effects = [eval_card(hc, { cardarea: G.hand, ...base_ctx() })];
        for (const j of G.jokers.cards) {
          const ictx = { cardarea: G.hand, ...base_ctx(), other_card: hc, individual: true };
          const ev = j.calculate_joker(ictx);
          if (ev) {
            effects.push(ev);
            for (let t = joker_retriggers(j, ictx); t > 0; t--) { const ev2 = j.calculate_joker({ ...ictx, retrigger_joker: true }); if (ev2) effects.push(ev2); }
          }
        }
        if (reps[r] === 1) {
          const sev = eval_card(hc, { repetition_only: true, cardarea: G.hand, ...base_ctx(), repetition: true, card_effects: effects });
          if (next(sev) && (next(effects[0]) || effects.length > 1)) for (let h = 0; h < sev.seals.repetitions; h++) reps.push(sev);
          for (const j of G.jokers.cards) {
            const rctx = { cardarea: G.hand, ...base_ctx(), other_card: hc, repetition: true, card_effects: effects };
            const ev = eval_card(j, rctx);
            if (next(ev) && ev.jokers) {
              for (let h = 0; h < ev.jokers.repetitions; h++) reps.push(ev);
              for (let t = joker_retriggers(j, rctx); t > 0; t--) {
                const ev2 = eval_card(j, { ...rctx, retrigger_joker: true });
                if (next(ev2) && ev2.jokers) for (let h = 0; h < (ev2.jokers.repetitions || 0); h++) reps.push(ev2);
              }
            }
          }
        }
        for (const ef of effects) {
          if (ef.card) juice_card(ef.card);
          if (ef.dollars) { ease_dollars(ef.dollars); card_eval_status_text(hc, 'dollars', ef.dollars); }
          if (ef.h_mult) { mult = mod_mult(B.add(mult, ef.h_mult)); card_eval_status_text(hc, 'h_mult', ef.h_mult); emit('hand_text', { mult }); }
          if (ef.h_chips) { hand_chips = mod_chips(B.add(hand_chips, ef.h_chips)); card_eval_status_text(hc, 'chips', ef.h_chips); emit('hand_text', { chips: hand_chips }); }
          if (ef.x_mult) { mult = mod_mult(B.mul(mult, ef.x_mult)); card_eval_status_text(hc, 'x_mult', ef.x_mult); emit('hand_text', { mult }); }
          if (ACTIVE_MODS.length && (ef._mod || ef === effects[0])) [hand_chips, mult] = mod_score_ops(ef, hc, hand_chips, mult, { held: ef !== effects[0] });
          if (ef.message) card_eval_status_text(hc, 'extra', null, null, null, ef);
          // (mod effects on the card itself after its seal: AMM Aspects)
          if (ef.post_effects) for (const pe of ef.post_effects) [hand_chips, mult] = smods_effect(pe, hc, hand_chips, mult);
        }
      }
    };
    // SMODS.score_card for mods during scoring (AMM's Void Aspect scores a held card as played; AutumnCircus'
    // Twisted Mind scores graveyard cards as held). score_played doesn't count the card as played again.
    G.scoring = { score_played: (c) => score_played_card(c, true), score_held: (c) => score_held_card(c) };
    for (let i = 0; i < G.hand.cards.length; i++) score_held_card(G.hand.cards[i]);
    if (ACTIVE_MODS.length) callHook('held_cards_scored', base_ctx());

    // Mod card areas scored like held cards (Pokermon's scry view: the top of the deck).
    for (const area of ACTIVE_MODS.length ? [].concat(...callHook('scoring_areas')) : []) {
      for (const sc of area.cards.slice()) {
        const reps = [1];
        for (const j of G.jokers.cards) {
          const ev = j.calculate_joker({ cardarea: area, ...base_ctx(), other_card: sc, repetition: true });
          if (ev && ev.repetitions) for (let h = 0; h < ev.repetitions; h++) reps.push(ev);
        }
        for (let r = 0; r < reps.length; r++) {
          if (reps[r] !== 1) card_eval_status_text(reps[r].card || sc, 'jokers', null, null, null, reps[r]);
          for (const j of G.jokers.cards) {
            const ef = j.calculate_joker({ cardarea: area, ...base_ctx(), other_card: sc, individual: true });
            if (!ef) continue;
            const at = ef.message_card || sc;
            const ch = (ef.chips || 0) + (ef.chip_mod || 0) + (ef.h_chips || 0);
            const mu = (ef.mult || 0) + (ef.mult_mod || 0) + (ef.h_mult || 0);
            const xm = ef.x_mult ?? ef.xmult ?? ef.Xmult ?? ef.Xmult_mod ?? ef.x_mult_mod;
            if (ch) hand_chips = mod_chips(B.add(hand_chips, ch));
            if (mu) mult = mod_mult(B.add(mult, mu));
            if (xm !== undefined && xm !== 1) mult = mod_mult(B.mul(mult, xm));
            if (ef.dollars) ease_dollars(ef.dollars);
            if (ef.message) card_eval_status_text(at, 'extra', null, null, null, ef);
            else if (ch) card_eval_status_text(at, 'chips', ch);
            else if (mu) card_eval_status_text(at, 'mult', mu);
            else if (xm !== undefined) card_eval_status_text(at, 'x_mult', xm);
            if (ch || mu || xm !== undefined) emit('hand_text', { chips: hand_chips, mult });
            mod_effect_tail(j, { func: ef.func, extra: ef.extra });
          }
        }
      }
    }

    // Joker main effects (jokers, then consumables — Observatory)
    const n = G.jokers.cards.length + G.consumeables.cards.length;
    for (let i = 0; i < n; i++) {
      const _card = G.jokers.cards[i] || G.consumeables.cards[i - G.jokers.cards.length];
      if (!_card) continue;
      // (a mod may stop consumables' editions scoring here — Bunco: they give a Tag when used instead)
      const edition_effects = (ACTIVE_MODS.length && _card.ability.consumeable && callHook('consumable_edition_scores', _card).includes(false)) ? {} : eval_card(_card, { cardarea: G.jokers, ...base_ctx(), edition: true });
      if (edition_effects.jokers) {
        edition_effects.jokers.edition = true;
        if (edition_effects.jokers.chip_mod) {
          hand_chips = mod_chips(B.add(hand_chips, edition_effects.jokers.chip_mod));
          card_eval_status_text(_card, 'jokers', null, null, null, { message: '+' + edition_effects.jokers.chip_mod, chip_mod: edition_effects.jokers.chip_mod, edition: true });
          emit('hand_text', { chips: hand_chips });
        }
        if (edition_effects.jokers.mult_mod) {
          mult = mod_mult(B.add(mult, edition_effects.jokers.mult_mod));
          card_eval_status_text(_card, 'jokers', null, null, null, { message: '+' + edition_effects.jokers.mult_mod + ' Mult', mult_mod: edition_effects.jokers.mult_mod, edition: true });
          emit('hand_text', { mult });
        }
      }
      // (mod runs: the running score rides along — Lua's globals hand_chips / mult, read by Bunco's Critic)
      const mctx = ACTIVE_MODS.length ? { cardarea: G.jokers, ...base_ctx(), joker_main: true, hand_chips, mult } : { cardarea: G.jokers, ...base_ctx(), joker_main: true };
      // SMODS: a joker's own seal (an AMM Stamp) calculates before the joker (trigger order: edition, seals, jokers).
      if (ACTIVE_MODS.length && _card.seal) for (const se of callHook('joker_seal', _card, mctx)) [hand_chips, mult] = smods_effect(se, _card, hand_chips, mult);
      let effects = eval_card(_card, mctx);
      for (let t = effects.jokers ? joker_retriggers(_card, mctx) + 1 : 0; t > 0; t--) {
        if (effects.jokers.mult_mod) mult = mod_mult(B.add(mult, effects.jokers.mult_mod));
        if (effects.jokers.chip_mod) hand_chips = mod_chips(B.add(hand_chips, effects.jokers.chip_mod));
        if (effects.jokers.Xmult_mod) mult = mod_mult(B.mul(mult, effects.jokers.Xmult_mod));
        if (effects.jokers.dollars && _card.config.center.mod) ease_dollars(effects.jokers.dollars);
        card_eval_status_text(_card, 'jokers', null, null, null, effects.jokers);
        emit('hand_text', { chips: hand_chips, mult });
        if (ACTIVE_MODS.length && effects.jokers._mod) [hand_chips, mult] = mod_score_ops(effects.jokers, _card, hand_chips, mult, { joker: true });
        mod_effect_tail(_card, { func: effects.jokers.func, extra: effects.jokers.extra });
        // Steamodded joker retriggers (MoreFluff's Brass Joker / CBA): the joker evaluates again.
        if (t > 1) { effects = eval_card(_card, { ...mctx, retrigger_joker: true }); if (!effects.jokers) break; }
      }
      for (const v of G.jokers.cards) {
        // Steamodded also names a consumable `other_consumeable` (Mega Alakazam).
        const octx = { ...base_ctx(), other_joker: _card, other_consumeable: _card.ability.consumeable ? _card : undefined };
        let effect = v.calculate_joker(octx);
        for (let t = effect ? joker_retriggers(v, octx) + 1 : 0; t > 0; t--) {
          let changed = false;
          if (effect.mult_mod) { mult = mod_mult(B.add(mult, effect.mult_mod)); changed = true; }
          if (effect.chip_mod) { hand_chips = mod_chips(B.add(hand_chips, effect.chip_mod)); changed = true; }
          if (effect.Xmult_mod) { mult = mod_mult(B.mul(mult, effect.Xmult_mod)); changed = true; }
          if (changed) { card_eval_status_text(v, 'jokers', null, null, null, effect); emit('hand_text', { chips: hand_chips, mult }); }
          if (ACTIVE_MODS.length && effect._mod) [hand_chips, mult] = mod_score_ops(effect, v, hand_chips, mult, { joker: true });
          // Steamodded joker retriggers: the joker evaluates again (retrigger_joker = true).
          if (t > 1) { effect = v.calculate_joker({ ...octx, retrigger_joker: true }); if (!effect) break; }
        }
      }
      if (edition_effects.jokers && edition_effects.jokers.x_mult_mod) {
        mult = mod_mult(B.mul(mult, edition_effects.jokers.x_mult_mod));
        card_eval_status_text(_card, 'jokers', null, null, null, { message: 'X' + edition_effects.jokers.x_mult_mod + ' Mult', x_mult_mod: edition_effects.jokers.x_mult_mod, edition: true });
        emit('hand_text', { mult });
      }
      // A mod edition's X Chips (Bunco's Glitter: SMODS post_joker), where X Mult goes.
      if (edition_effects.jokers && edition_effects.jokers.x_chip_mod) {
        hand_chips = mod_chips(B.mul(hand_chips, edition_effects.jokers.x_chip_mod));
        card_eval_status_text(_card, 'jokers', null, null, null, { message: 'X' + edition_effects.jokers.x_chip_mod + ' ' + localize('bunc_chips'), edition: true, colour: 'CHIPS' });
        emit('hand_text', { chips: hand_chips });
      }
    }

    // Steamodded's final_scoring_step context for mod cards (after the jokers, before the deck's
    // Plasma step). Effects that change chips/mult aren't applied yet — add them when a joker needs it.
    if (ACTIVE_MODS.length) calculate_context({ ...base_ctx(), final_scoring_step: true });
    // ... and may change the score there (MoreFluff's Clutch Tag: X4 Mult). -> [hand_chips, mult]
    if (ACTIVE_MODS.length) [hand_chips, mult] = reduceHook('modify_scoring', [hand_chips, mult], 'final_scoring_step', base_ctx());
    const [nu_chip, nu_mult] = G.GAME.selected_back.trigger_effect({ context: 'final_scoring_step', chips: hand_chips, mult }) || [];
    mult = mod_mult(nu_mult ?? mult);
    hand_chips = mod_chips(nu_chip ?? hand_chips);
    if (nu_chip !== undefined) emit('hand_text', { chips: hand_chips, mult, balanced: true });

    const cards_destroyed = [];
    for (const sc of scoring_hand) {
      let destroyed = null;
      for (const j of G.jokers.cards) {
        // Mod jokers also get Steamodded's destroy_card form (cardarea G.play; {remove = true} destroys).
        if (j.config.center.mod) {
          const r = j.calculate_joker({ destroying_card: sc, destroy_card: sc, cardarea: G.play, full_hand: G.play.cards, scoring_hand });
          destroyed = r && (r === true || r.remove) ? r : null;
        } else destroyed = j.calculate_joker({ destroying_card: sc, full_hand: G.play.cards });
        if (destroyed) break;
      }
      // Steamodded: the card's own MOD enhancement / seal may destroy it ({remove = true}: MoreFluff's Brass / Yucky Card).
      if (ACTIVE_MODS.length) {
        const ms = mod_card_calculate(sc, { destroy_card: sc, destroying_card: sc, cardarea: G.play, full_hand: G.play.cards, scoring_hand });
        if (ms && ((ms.enhancement && (ms.enhancement === true || ms.enhancement.remove)) || (ms.seal && (ms.seal === true || ms.seal.remove)))) destroyed = true;
      }
      if (sc.ability.name === 'Glass Card' && !sc.debuff && probability_roll(sc, 'glass', 1, sc.ability.extra)) destroyed = true;
      // Steamodded quantum enhancements: a card that is also Glass (Pokermon's Tinkaton: Steel cards)
      // rolls the Glass break too (SMODS runs m_glass's destroy_card on the quantum ability).
      const q_glass = ACTIVE_MODS.length > 0 && sc.ability.name !== 'Glass Card' && !sc.debuff && quantum_enhancements(sc).includes('m_glass');
      if (q_glass && probability_roll(sc, 'glass', 1, P_CENTERS.m_glass.config.extra)) destroyed = true;
      if (destroyed) {
        if (sc.ability.name === 'Glass Card' || q_glass) sc.shattered = true; else sc.destroyed = true;
        cards_destroyed.push(sc);
      }
    }
    // (SMODS 'unscored': mod jokers may destroy played cards that didn't score - cardarea 'unscored')
    if (unscored_on) {
      for (const uc of G.play.cards) {
        if (scoring_hand.includes(uc)) continue;
        let destroyed = false;
        for (const j of G.jokers.cards) {
          if (!j.config.center.mod) continue;
          const r = j.calculate_joker({ destroy_card: uc, cardarea: 'unscored', full_hand: G.play.cards, scoring_hand });
          if (r && (r === true || r.remove)) { destroyed = true; break; }
        }
        if (destroyed) { uc.destroyed = true; cards_destroyed.push(uc); }
      }
    }
    // SMODS better_calc.toml: with mods on, remove_playing_cards only fires when a card was destroyed (Mareep line).
    if (!ACTIVE_MODS.length || cards_destroyed.length) for (const j of G.jokers.cards.slice()) mod_context_effect(j, eval_card(j, { cardarea: G.jokers, remove_playing_cards: true, removed: cards_destroyed }).jokers);
    for (const c of cards_destroyed) {
      G.E_MANAGER.add_event(() => { if (c.ability.name === 'Glass Card' || c.shattered) c.shatter(); else c.start_dissolve(); });
    }
    // The end of a scored (not debuffed) hand (Bunco: The Blade's overscore check, Megamult / Ultrachips Tags). -> [hand_chips, mult]
    if (ACTIVE_MODS.length) [hand_chips, mult] = reduceHook('modify_scoring', [hand_chips, mult], 'end_scoring', base_ctx());
  } else {
    mult = mod_mult(0);
    hand_chips = mod_chips(0);
    emit('blind_juice', {});
    emit('not_allowed', {});
    emit('hand_text', { chips: 0, mult: 0 });
    for (const j of G.jokers.cards.slice()) {
      const effects = eval_card(j, { cardarea: G.jokers, ...base_ctx(), debuffed_hand: true });
      if (effects.jokers) card_eval_status_text(j, 'jokers', null, null, null, effects.jokers);
    }
  }

  const total = B.floor(B.mul(hand_chips, mult));
  emit('hand_total', { chips: hand_chips, mult, total, hand: text });
  if (B.gt(total, G.GAME.stats.best_hand || 0)) { G.GAME.stats.best_hand = total; G.GAME.stats.best_hand_name = disp_text; }
  if (B.lt(G.GAME.round_scores.hand.amt, total)) G.GAME.round_scores.hand.amt = total;
  G.GAME.last_hand_total = total;
  // (a mod may change what the hand adds to the round score — Bunco's Magenta Dagger subtracts it)
  const added = ACTIVE_MODS.length ? reduceHook('chips_scored', total, { full_hand: G.play.cards, scoring_hand, scoring_name: text }) : total;
  G.E_MANAGER.add_event(() => {
    G.GAME.chips = B.add(G.GAME.chips, added);
    emit('chips', { total: G.GAME.chips, add: added });
  });
  for (const j of G.jokers.cards.slice()) {
    const actx = { cardarea: G.jokers, ...base_ctx(), after: true };
    let effects = eval_card(j, actx);
    for (let t = effects.jokers ? joker_retriggers(j, actx) + 1 : 0; t > 0; t--) {
      card_eval_status_text(j, 'jokers', null, null, null, effects.jokers); mod_effect_tail(j, effects.jokers, { dollars: true });
      if (t > 1) { effects = eval_card(j, { ...actx, retrigger_joker: true }); if (!effects.jokers) break; } // (Steamodded joker retriggers)
    }
  }
  G.E_MANAGER.add_event(() => {
    if (G.GAME.modifiers.debuff_played_cards) for (const v of scoring_hand) v.ability.perma_debuff = true;
  });
  // Mods that wrap G.FUNCS.evaluate_play to see the hand's final score (Mika's mmc_scored_chips).
  if (ACTIVE_MODS.length) callHook('hand_scored', hand_chips, mult, { full_hand: G.play.cards, scoring_hand, scoring_name: text });
  G.scoring = undefined;
}

function evaluate_round() {
  // Mods wrapping G.FUNCS.evaluate_round (BETMMA's Rich Boss / Money Target / Deep Roots): their undo runs at the end.
  const undo = ACTIVE_MODS.length ? callHook('evaluate_round_pre').filter((f) => typeof f === 'function') : null;
  const rows = [];
  let dollars = 0;
  const row = (r) => { rows.push(r); };
  if (B.beats(G.GAME.chips, G.GAME.blind.chips)) {
    row({ name: 'blind1', dollars: G.GAME.blind.dollars, blind: G.GAME.blind.config.blind && G.GAME.blind.config.blind.key });
    dollars += G.GAME.blind.dollars;
  } else {
    row({ name: 'blind1', dollars: 0, saved: true });
  }
  G.E_MANAGER.add_event(() => G.GAME.blind.defeat());
  G.GAME.selected_back.trigger_effect({ context: 'eval' });
  if (G.GAME.current_round.hands_left > 0 && !G.GAME.modifiers.no_extra_hand_money) {
    const d = G.GAME.current_round.hands_left * (G.GAME.modifiers.money_per_hand || 1);
    row({ name: 'hands', dollars: d, disp: G.GAME.current_round.hands_left, bonus: true });
    dollars += d;
  }
  if (G.GAME.current_round.discards_left > 0 && G.GAME.modifiers.money_per_discard) {
    const d = G.GAME.current_round.discards_left * G.GAME.modifiers.money_per_discard;
    row({ name: 'discards', dollars: d, disp: G.GAME.current_round.discards_left, bonus: true });
    dollars += d;
  }
  G.jokers.cards.forEach((j, i) => {
    const ret = j.calculate_dollar_bonus();
    if (ret) { row({ name: 'joker' + (i + 1), dollars: ret, bonus: true, card: j.sort_id, center: j.config.center.key }); dollars += ret; }
  });
  G.GAME.tags.slice().forEach((t, i) => {
    const ret = t.apply_to_run({ type: 'eval' });
    if (ret) { row({ name: 'tag' + (i + 1), dollars: ret.dollars, bonus: true, tag: t.key, condition: ret.condition }); dollars += ret.dollars; }
  });
  if (G.GAME.dollars >= 5 && !G.GAME.modifiers.no_interest) {
    const d = G.GAME.interest_amount * Math.min(Math.floor(G.GAME.dollars / 5), G.GAME.interest_cap / 5);
    row({ name: 'interest', dollars: d, bonus: true, disp: G.GAME.interest_amount });
    dollars += d;
  }
  for (const r of callHook('evaluate_round', rows)) for (const row of [].concat(r)) { rows.push(row); dollars += row.dollars || 0; }
  G.GAME.current_round.dollars = dollars;
  const pb = G.GAME.blind.config && G.GAME.blind.config.blind;
  // The blind is cleared on defeat (as in Lua); keep what the cash-out screen shows.
  const blind = pb ? { key: pb.key, name: G.GAME.blind.name, chips: G.GAME.blind.chips, dollars: G.GAME.blind.dollars, boss: !!G.GAME.blind.boss, colour: pb.boss_colour, pos: pb.pos, defeated: true } : null;
  G.GAME.round_eval = { rows, total: dollars, blind };
  emit('round_eval', { rows, total: dollars });
  if (undo) for (const f of undo) f();
}

// ------------------------------------------------------------------ shop
export function create_card_for_shop(area) {
  // A mod may stock the slot itself (a Lua create_card_for_shop wrap: Reverie's Cine shops).
  if (ACTIVE_MODS.length) { const mc = firstHook('create_card_for_shop', area); if (mc) return mc; }
  for (const t of G.GAME.tags.slice()) {
    const forced = t.apply_to_run({ type: 'store_joker_create', area });
    if (forced) {
      for (const tt of G.GAME.tags.slice()) if (tt.apply_to_run({ type: 'store_joker_modify', card: forced })) break;
      return forced;
    }
  }
  G.GAME.spectral_rate = G.GAME.spectral_rate || 0;
  // Mods may add card types a shop slot can roll (BETMMA's Voucher Tycoon: Vouchers, rate 2).
  const mod_types = ACTIVE_MODS.length ? [].concat(...callHook('shop_card_types')) : [];
  const total_rate = G.GAME.joker_rate + G.GAME.tarot_rate + G.GAME.planet_rate + G.GAME.playing_card_rate + G.GAME.spectral_rate +
    activeConsumableTypes().reduce((n, t) => n + (G.GAME[t.rate_key] || 0), 0) + mod_types.reduce((n, t) => n + (t.val || 0), 0);
  const polled = pseudorandom(pseudoseed('cdt' + G.GAME.round_resets.ante)) * total_rate;
  let check = 0;
  const opts = [
    { type: 'Joker', val: G.GAME.joker_rate },
    { type: 'Tarot', val: G.GAME.tarot_rate },
    { type: 'Planet', val: G.GAME.planet_rate },
    { type: (G.GAME.used_vouchers.v_illusion && pseudorandom(pseudoseed('illusion')) > 0.6) ? 'Enhanced' : 'Base', val: G.GAME.playing_card_rate },
    { type: 'Spectral', val: G.GAME.spectral_rate },
    ...activeConsumableTypes().map((t) => ({ type: t.key, val: G.GAME[t.rate_key] || 0 })),
    ...mod_types,
  ];
  for (const v of opts) {
    if (polled > check && polled <= check + v.val) {
      const card = create_card(v.type, area, null, null, null, null, null, 'sho');
      G.E_MANAGER.add_event(() => {
        for (const t of G.GAME.tags.slice()) if (t.apply_to_run({ type: 'store_joker_modify', card })) break;
      });
      if ((v.type === 'Base' || v.type === 'Enhanced') && G.GAME.used_vouchers.v_illusion && pseudorandom(pseudoseed('illusion')) > 0.8) {
        const ep = pseudorandom(pseudoseed('illusion'));
        const ed = {};
        if (ep > 1 - 0.15) ed.polychrome = true; else if (ep > 0.5) ed.holo = true; else ed.foil = true;
        card.set_edition(ed);
      }
      return card;
    }
    check += v.val;
  }
  return create_card('Joker', area, null, null, null, null, null, 'sho');
}

function update_shop() {
  G.shop_open = true;
  G.E_MANAGER.add_event(() => {
    for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'shop_start' });
    callHook('shop_start');
    if (!G.shop_populated) {
      G.shop_populated = true;
      // A mod may stock a new shop's joker slots itself (Nacho's Sinnoh Adventure: the three starters).
      if (!(ACTIVE_MODS.length && callHook('fill_shop_jokers').includes(true))) {
        for (let i = G.shop_jokers.cards.length; i < G.GAME.shop.joker_max; i++) G.shop_jokers.emplace(create_card_for_shop(G.shop_jokers));
      }
      if (G.GAME.current_round.voucher && P_CENTERS[G.GAME.current_round.voucher]) {
        const card = new Card(P_CARDS.empty, P_CENTERS[G.GAME.current_round.voucher]);
        card.shop_voucher = true;
        G.shop_vouchers.emplace(card);
      }
      stock_extra_vouchers(0, G.GAME.modifiers.extra_vouchers || 0);
      const booster_slots = reduceHook('booster_limit', 2 + (G.GAME.modifiers.extra_boosters || 0));
      for (let i = 1; i <= booster_slots; i++) {
        G.GAME.current_round.used_packs = G.GAME.current_round.used_packs || {};
        if (!G.GAME.current_round.used_packs[i]) G.GAME.current_round.used_packs[i] = get_pack('shop_pack').key;
        if (G.GAME.current_round.used_packs[i] !== 'USED') {
          const card = new Card(P_CARDS.empty, P_CENTERS[G.GAME.current_round.used_packs[i]]);
          card.ability.booster_pos = i;
          G.shop_booster.emplace(card);
        }
      }
      // Mods may add shop vouchers around the Voucher Tag's (MoreFluff: The Ticket before, Junk Mail after).
      if (ACTIVE_MODS.length) callHook('voucher_add', 'before_tags');
      for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'voucher_add' });
      if (ACTIVE_MODS.length) callHook('voucher_add', 'after_tags');
      for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'shop_final_pass' });
      if (ACTIVE_MODS.length) callHook('shop_stocked'); // (BETMMA's Bargain / Clearance Aisle)
    }
  });
}
/**
 * Steamodded's SMODS.change_booster_limit: +/- shop booster slots for the rest of the run
 * (G.GAME.modifiers.extra_boosters). Gaining a slot while the shop is open stocks a pack now.
 */
export function change_booster_limit(mod) {
  G.GAME.modifiers.extra_boosters = (G.GAME.modifiers.extra_boosters || 0) + mod;
  if (mod > 0 && G.shop_open && G.STATE === STATES.SHOP) {
    for (let i = 0; i < mod; i++) {
      const card = new Card(P_CARDS.empty, get_pack('shop_pack'));
      card.ability.booster_pos = G.shop_booster.cards.length + 1;
      G.shop_booster.emplace(card);
    }
  }
}

/**
 * Steamodded's voucher slots (SMODS.change_voucher_limit / G.GAME.modifiers.extra_vouchers):
 * extra shop vouchers next to the round's voucher. Each slot's key is rolled once and kept
 * for the ante (G.GAME.current_round.extra_vouchers), like the main voucher.
 */
function stock_extra_vouchers(from, to) {
  if (to <= from) return;
  const cr = G.GAME.current_round;
  cr.extra_vouchers = cr.extra_vouchers || [];
  for (let i = from; i < to; i++) {
    // (get_current_pool leaves out vouchers already in the shop, so the slots never repeat.)
    if (cr.extra_vouchers[i] === undefined || cr.extra_vouchers[i] === null) cr.extra_vouchers[i] = get_next_voucher_key();
    const key = cr.extra_vouchers[i];
    if (key && P_CENTERS[key] && !G.GAME.used_vouchers[key] && !G.shop_vouchers.cards.some((v) => v.config.center.key === key)) {
      const card = new Card(P_CARDS.empty, P_CENTERS[key]);
      card.shop_voucher = true;
      card.extra_voucher = true; // (an extra slot's voucher: redeeming it leaves the round's voucher alone)
      G.shop_vouchers.emplace(card);
    }
  }
  G.shop_vouchers.config.card_limit = Math.max(1, G.shop_vouchers.cards.length);
}
export function change_voucher_limit(mod) {
  const before = Math.max(0, G.GAME.modifiers.extra_vouchers || 0);
  G.GAME.modifiers.extra_vouchers = (G.GAME.modifiers.extra_vouchers || 0) + mod;
  if (mod > 0 && G.shop_open && G.STATE === STATES.SHOP) stock_extra_vouchers(before, G.GAME.modifiers.extra_vouchers);
}

export function change_shop_size(mod) {
  if (!G.GAME.shop) return;
  G.GAME.shop.joker_max += mod;
  if (G.shop_jokers && G.shop_jokers.cards) {
    if (mod < 0) {
      for (let i = G.shop_jokers.cards.length - 1; i >= G.GAME.shop.joker_max; i--) {
        const c = G.shop_jokers.cards[i];
        if (c) c.remove();
      }
    }
    G.shop_jokers.config.card_limit = G.GAME.shop.joker_max;
    // Lua: G.shop_jokers only exists while the shop is open (a voucher redeems in PLAY_TAROT).
    if (G.shop_open && mod > 0) {
      for (let i = G.shop_jokers.cards.length; i < G.GAME.shop.joker_max; i++) G.shop_jokers.emplace(create_card_for_shop(G.shop_jokers));
    }
  }
}

function clear_area(area) {
  for (const c of area.cards.slice()) c.remove();
}

// --------------------------------------------------------------- actions
function find_card(id) {
  for (const a of G.areas) for (const c of a.cards) if (c.sort_id === id) return c;
  return null;
}
export function check_for_buy_space(card) {
  // A mod card may always fit (MoreFluff's Philosophical Joker brings its own slot).
  if (ACTIVE_MODS.length && callHook('buy_space', card).includes(true)) return true;
  if (card.ability.set !== 'Voucher' && card.ability.set !== 'Enhanced' && card.ability.set !== 'Default' &&
      !(card.ability.set === 'Joker' && G.jokers.cards.length < G.jokers.config.card_limit + ((card.edition && card.edition.negative) ? 1 : 0)) &&
      !(card.ability.consumeable && G.consumeables.cards.length < G.consumeables.config.card_limit + ((card.edition && card.edition.negative) ? 1 : 0))) {
    emit('no_space', { card: card.sort_id });
    return false;
  }
  return true;
}

/** G.FUNCS.use_card — consumables, pack picks, boosters, vouchers. */
export function use_card(card) {
  // A mod may handle the use itself (Bunco: a Blind card's "Select" in a Blind Pack).
  if (ACTIVE_MODS.length && callHook('use_card_override', card).includes(true)) return true;
  if (ACTIVE_MODS.length) callHook('use_card', card); // (a Lua G.FUNCS.use_card wrap: BETMMA's Engulfer)
  const area = card.area;
  const prev_state = G.STATE;
  let dont_dissolve = false;
  // A mod may TAKE this pack consumable into an area instead of using it (Reverie: Cine cards and
  // Crazy Lucky / Film / Tag pack picks) — no use check then (Reverie's Card:check_use wrap).
  const take = ACTIVE_MODS.length && area === G.pack_cards && card.ability.consumeable ? firstHook('pack_take_area', card) : undefined;
  if (!take && card.check_use && card.check_use()) return false;
  G.TAROT_INTERRUPT = G.STATE;
  if (card.ability.set === 'Booster') G.GAME.PACK_INTERRUPT = G.STATE;
  if (!PACK_STATES.includes(G.STATE)) G.STATE = STATES.PLAY_TAROT;
  // Steamodded keep_on_use: the consumable stays where it is after use (e.g. Pokermon's Megastone).
  // (card.keep_on_use: a mod keeping this one card — BETMMA's Forbidden Area uses consumables in the joker row)
  const nc = !!(card.ability.consumeable && ((card.config.center.mod && card.config.center.keep_on_use && card.config.center.keep_on_use(card.config.center, card)) || card.keep_on_use));
  if (card.area && (!nc || card.area === G.pack_cards)) card.area.remove_card(card);
  if (nc) dont_dissolve = true;
  if (nc && area === G.pack_cards) {
    // A kept card used straight from a pack moves to the consumable slots.
    G.E_MANAGER.add_event(() => { card.add_to_deck(); G.consumeables.emplace(card); });
  }
  if (card.ability.consumeable && take) {
    take.emplace(card);
    card.add_to_deck();
    emit('reserved', { card: card.sort_id });
    play_sound('card1', 0.8, 0.6);
    dont_dissolve = true;
  } else if (card.ability.consumeable) {
    // Lua: only Tarot/Planet/Spectral packs skip the draw-to-play (Standard/Buffoon still draw).
    if (!nc && !(G.STATE === STATES.TAROT_PACK || G.STATE === STATES.PLANET_PACK || G.STATE === STATES.SPECTRAL_PACK || G.STATE === STATES.MOD_PACK || G.STATE === STATES.MOD_PACK_HAND)) draw_card(G.hand, G.play, 1, 'up', true, card);
    emit('use', { card: card.sort_id, center: card.config.center.key });
    card.use_consumeable(area);
    if (ACTIVE_MODS.length) callHook('used_consumeable', card, area); // (a Lua Card:use_consumeable wrap: BETMMA's Solar System)
    for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ using_consumeable: true, consumeable: card }));
  } else if (card.ability.set === 'Enhanced' || card.ability.set === 'Default') {
    G.playing_card = (G.playing_card || 0) + 1;
    G.deck.emplace(card);
    card.playing_card = G.playing_card;
    for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ playing_card_added: true, cards: [card] }));
    card.add_to_deck();
    G.playing_cards.push(card);
    dont_dissolve = true;
  } else if (card.ability.set === 'Joker') {
    card.add_to_deck();
    G.jokers.emplace(card);
    dont_dissolve = true;
  } else if (card.ability.set === 'Booster') {
    if (card.ability.booster_pos) G.GAME.current_round.used_packs[card.ability.booster_pos] = 'USED';
    draw_card(G.hand, G.play, 1, 'up', true, card);
    if (!card.from_tag) G.GAME.round_scores.cards_purchased.amt += 1;
    emit('open_booster', { card: card.sort_id, center: card.config.center.key });
    card.open();
  } else if (card.ability.set === 'Voucher') {
    draw_card(G.hand, G.play, 1, 'up', true, card);
    G.GAME.round_scores.cards_purchased.amt += 1;
    emit('redeem', { card: card.sort_id, center: card.config.center.key });
    card.redeem();
  } else if (ACTIVE_MODS.length && callHook('use_other', card, area).includes(true)) {
    dont_dissolve = true; // (a mod's own card kind: Reverie's Tags sold as cards)
  }
  if (card.ability.set === 'Booster') {
    G.TAROT_INTERRUPT = null;
  } else {
    G.E_MANAGER.add_event(() => {
      // Lua card:start_dissolve() -> Card:remove() -> remove_from_deck (a used Negative consumable gives its slot back).
      if (!dont_dissolve) card.start_dissolve();
      G.E_MANAGER.add_event(() => {
        G.STATE = prev_state;
        G.TAROT_INTERRUPT = null;
        if (PACK_STATES.includes(prev_state)) {
          if (area === G.consumeables || area === G.jokers) { /* used a held consumable mid-pack (Pokermon: also from the joker row) */ }
          else if (G.GAME.pack_choices && G.GAME.pack_choices > 1) G.GAME.pack_choices -= 1;
          else end_consumeable();
        }
      });
    });
  }
  if (ACTIVE_MODS.length) callHook('use_card_done', card, area); // (a Lua G.FUNCS.use_card wrap's tail: Reverie's quests)
  return true;
}

export function end_consumeable() {
  G.E_MANAGER.add_event(() => {
    clear_area(G.pack_cards);
    G.GAME.pack_choices = 0;
    draw_from_hand_to_deck();
    G.E_MANAGER.add_event(() => {
      G.STATE = G.GAME.PACK_INTERRUPT;
      G.GAME.PACK_INTERRUPT = null;
      emit('pack_closed', {});
    });
    for (const t of G.GAME.tags.slice()) if (t.apply_to_run({ type: 'new_blind_choice' })) break;
  });
}

function select_blind(which) {
  const rr = G.GAME.round_resets;
  G.GAME.facing_blind = true;
  G.E_MANAGER.add_event(() => {
    ease_round(1);
    rr.blind = P_BLINDS[rr.blind_choices[which]];
    rr.blind_states[G.GAME.blind_on_deck] = 'Current';
  });
  G.E_MANAGER.add_event(() => new_round());
}

function skip_blind() {
  if (ACTIVE_MODS.length) callHook('skip_blind', 'before'); // (Lua G.FUNCS.skip_blind wraps: BETMMA's Skip / Skipper / Overshopping)
  const rr = G.GAME.round_resets;
  G.GAME.skips = (G.GAME.skips || 0) + 1;
  const skipped = G.GAME.blind_on_deck || 'Small';
  const tagKey = rr.blind_tags[skipped];
  if (!tagKey) return;
  add_tag(new Tag(tagKey, false, skipped));
  const skip_to = skipped === 'Small' ? 'Big' : 'Boss';
  rr.blind_states[skipped] = 'Skipped';
  rr.blind_states[skip_to] = 'Select';
  G.GAME.blind_on_deck = skip_to;
  emit('skip_blind', { skipped, tag: tagKey });
  G.E_MANAGER.add_event(() => {
    for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ skip_blind: true }));
    for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'immediate' });
    for (const t of G.GAME.tags.slice()) if (t.apply_to_run({ type: 'new_blind_choice' })) break;
  });
  if (ACTIVE_MODS.length) callHook('skip_blind', 'after');
}

export function reroll_boss(from_tag) {
  G.GAME.round_resets.boss_rerolled = true;
  if (!from_tag) ease_dollars(-10);
  G.E_MANAGER.add_event(() => {
    G.GAME.round_resets.blind_choices.Boss = get_new_boss();
    if (ACTIVE_MODS.length) callHook('new_boss_choice');
    emit('boss_rerolled', { boss: G.GAME.round_resets.blind_choices.Boss });
    for (const t of G.GAME.tags.slice()) if (t.apply_to_run({ type: 'new_blind_choice' })) break;
  });
  if (ACTIVE_MODS.length) callHook('reroll_boss', from_tag); // (BETMMA's Reroll Cut)
}

function reroll_shop() {
  if (G.GAME.current_round.reroll_cost > 0) ease_dollars(-G.GAME.current_round.reroll_cost);
  G.E_MANAGER.add_event(() => {
    const final_free = G.GAME.current_round.free_rerolls > 0;
    G.GAME.current_round.free_rerolls = Math.max(G.GAME.current_round.free_rerolls - 1, 0);
    G.GAME.round_scores.times_rerolled.amt += 1;
    calculate_reroll_cost(final_free);
    clear_area(G.shop_jokers);
    for (let i = G.shop_jokers.cards.length; i < G.GAME.shop.joker_max; i++) G.shop_jokers.emplace(create_card_for_shop(G.shop_jokers));
    emit('shop_rerolled', {});
  });
  G.E_MANAGER.add_event(() => {
    G.E_MANAGER.add_event(() => { for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ reroll_shop: true })); });
  });
  if (ACTIVE_MODS.length) callHook('reroll_shop'); // (Lua G.FUNCS.reroll_shop wraps: BETMMA's 4D Boosters / 4D Vouchers / Reroll Aisle)
}

/**
 * G.jokers.highlighted = exactly the joker(s) the UI has picked for this Use (joker_targets; none
 * when absent). Only a Use / Buy & Use reads it, so it is set fresh on each one: a pick left over
 * from an earlier Use (refused, or picked then un-picked) must not aim a later Energy / item at a
 * joker the player no longer has selected (a tester's Grass Energy was refused on Buy & Use and
 * from the slot with no joker picked, and worked only once the Grass joker was picked).
 */
function set_joker_targets(ids) {
  G.jokers.highlighted.length = 0;
  for (const j of G.jokers.cards) j.highlighted = false;
  for (const id of ids || []) { const t = find_card(id); if (t && t.area === G.jokers) G.jokers.add_to_highlighted(t); }
}

function buy_from_shop(c1, use) {
  if (!use && !check_for_buy_space(c1)) return false;
  G.E_MANAGER.add_event(() => {
    c1.area.remove_card(c1);
    // A mod may place the bought card itself (Reverie: a Tag bought as a card joins your tags).
    const placed = ACTIVE_MODS.length && callHook('buy_place', c1, use).includes(true);
    if (!placed) c1.add_to_deck();
    if (placed) { /* placed by the mod */ } else if (c1.ability.set === 'Default' || c1.ability.set === 'Enhanced') {
      G.playing_card = (G.playing_card || 0) + 1;
      G.deck.emplace(c1);
      c1.playing_card = G.playing_card;
      for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ playing_card_added: true, cards: [c1] }));
      G.playing_cards.push(c1);
    } else if (!use) {
      // (a mod may place a bought consumable elsewhere: BETMMA's Forbidden Area -> the joker row)
      if (c1.ability.consumeable) ((ACTIVE_MODS.length && firstHook('buy_area', c1)) || G.consumeables).emplace(c1);
      else G.jokers.emplace(c1);
      G.E_MANAGER.add_event(() => mod_context_effect(c1, c1.calculate_joker({ buying_card: true, card: c1 })));
    }
    G.GAME.round_scores.cards_purchased.amt += 1;
    if (c1.ability.set === 'Joker') G.GAME.current_round.jokers_purchased += 1;
    for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ buying_card: true, card: c1 }));
    if (G.GAME.modifiers.inflation) {
      G.GAME.inflation += 1;
      G.E_MANAGER.add_event(() => { for (const a of G.areas) for (const c of a.cards) c.set_cost(); });
    }
    if (c1.cost !== 0) ease_dollars(-c1.cost);
    emit('bought', { card: c1.sort_id, cost: c1.cost });
    if (use) use_card(c1);
  });
  if (ACTIVE_MODS.length) callHook('bought', c1, use); // (Lua G.FUNCS.buy_from_shop wraps: BETMMA's Double Planet, Cryptozoology, Balatro Mobile)
  return true;
}

function toggle_shop() {
  for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ ending_shop: true }));
  G.E_MANAGER.add_event(() => {
    clear_area(G.shop_jokers);
    clear_area(G.shop_vouchers);
    clear_area(G.shop_booster);
    if (ACTIVE_MODS.length) callHook('shop_end'); // (a Lua G.FUNCS.toggle_shop wrap: Reverie ends its Cine shop)
    G.shop_open = false;
    G.shop_populated = false;
    G.STATE_COMPLETE = false;
    G.STATE = STATES.BLIND_SELECT;
  });
}

function cash_out() {
  G.deck.shuffle('cashout' + G.GAME.round_resets.ante);
  G.E_MANAGER.add_event(() => {
    G.GAME.round_eval = null;
    G.GAME.current_round.jokers_purchased = 0;
    if (ACTIVE_MODS.length) callHook('round_counts', 'before', 'cash_out'); // (BETMMA's Garbage Bag / Handbag)
    G.GAME.current_round.discards_left = Math.max(0, G.GAME.round_resets.discards + G.GAME.round_bonus.discards);
    G.GAME.current_round.hands_left = Math.max(1, G.GAME.round_resets.hands + G.GAME.round_bonus.next_hands);
    if (ACTIVE_MODS.length) callHook('round_counts', 'after', 'cash_out');
    // (a mod may skip the shop: Bunco's The Miser)
    G.STATE = (ACTIVE_MODS.length && callHook('skip_shop').includes(true)) ? STATES.BLIND_SELECT : STATES.SHOP;
    G.GAME.shop_free = null;
    G.GAME.shop_d6ed = null;
    G.STATE_COMPLETE = false;
  });
  ease_dollars(G.GAME.current_round.dollars);
  G.E_MANAGER.add_event(() => { G.GAME.previous_round.dollars = G.GAME.dollars; });
  ease_chips(0);
  if (G.GAME.round_resets.blind_states.Boss === 'Defeated') {
    G.GAME.round_resets.blind_ante = G.GAME.round_resets.ante;
    G.GAME.round_resets.blind_tags.Small = get_next_tag_key();
    G.GAME.round_resets.blind_tags.Big = get_next_tag_key();
  }
  reset_blinds();
}

export function play_cards_from_highlighted() {
  if (G.play.cards[0]) return false;
  if (ACTIVE_MODS.length) callHook('play_start'); // (Bunco's Vandalism)
  G.GAME.blind.triggered = false;
  for (const v of G.playing_cards) v.ability.forced_selection = undefined;
  const hl = G.hand.highlighted.slice().sort((a, b) => G.hand.cards.indexOf(a) - G.hand.cards.indexOf(b));
  G.hand.highlighted = hl;
  // Steamodded's press_play context (after Blind:press_play in the Lua). The Lua moves the played
  // cards with queued events, so its handlers still see them highlighted in G.hand — fired here,
  // before the synchronous move, they see the same state (Nacho's Turtonator reads it).
  if (ACTIVE_MODS.length) calculate_context({ press_play: true });
  G.E_MANAGER.add_event(() => { G.STATE = STATES.HAND_PLAYED; G.STATE_COMPLETE = true; });
  // (Bunco: The Swing / The Umbrella flip the hand, Cellphone; a play that isn't a hand — Cracker Cards,
  // Magenta Dagger's discard-play — doesn't use one up)
  if (ACTIVE_MODS.length) callHook('play_pressed');
  if (!(ACTIVE_MODS.length && callHook('consume_hand').includes(false))) ease_hands_played(-1);
  for (const c of hl) {
    c.base.times_played += 1;
    c.ability.played_this_ante = true;
    G.GAME.round_scores.cards_played.amt += 1;
    draw_card(G.hand, G.play, 0, 'up', null, c);
  }
  G.GAME.blind.press_play();
  G.E_MANAGER.add_event(() => {
    G.E_MANAGER.add_event(() => evaluate_play());
    G.E_MANAGER.add_event(() => {
      draw_from_play_to_discard();
      G.GAME.hands_played += 1;
      G.GAME.current_round.hands_played += 1;
    });
    G.E_MANAGER.add_event(() => { G.STATE_COMPLETE = false; });
  });
  return true;
}

export function discard_cards_from_highlighted(hook) {
  // A mod may take the discard over (Bunco: Magenta Dagger plays the cards instead; Cracker Cards step out).
  if (ACTIVE_MODS.length && callHook('discard_begin', hook).includes(true)) return true;
  for (const v of G.playing_cards) v.ability.forced_selection = undefined;
  const count = Math.min(G.hand.highlighted.length, G.discard.config.card_limit - G.play.cards.length);
  if (count <= 0) { if (ACTIVE_MODS.length && callHook('discard_end', hook).includes(true)) return true; return false; }
  const hl = G.hand.highlighted.slice().sort((a, b) => G.hand.cards.indexOf(a) - G.hand.cards.indexOf(b));
  // A copy: a card a joker destroys mid-discard (dissolve is instant here, animated in Lua) leaves
  // G.hand.highlighted, and must not shift `hl` while it is being walked.
  G.hand.highlighted = hl.slice();
  for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ pre_discard: true, full_hand: hl, hook }));
  const destroyed_cards = [];
  if (ACTIVE_MODS.length) callHook('discard_cards', hl, count, hook); // (Bunco's The Paling: $1 per card)
  for (let i = 0; i < count; i++) {
    const c = hl[i];
    c.calculate_seal({ discard: true });
    if (ACTIVE_MODS.length) callHook('discard_card', c, { full_hand: hl, hook }); // (BETMMA's Echo Wall)
    let removed = false;
    for (const j of G.jokers.cards.slice()) {
      const dctx = { discard: true, other_card: c, full_hand: hl };
      let ev = j.calculate_joker(dctx);
      for (let t = ev ? joker_retriggers(j, dctx) + 1 : 0; t > 0; t--) {
        if (ev.remove) removed = true;
        card_eval_status_text(j, 'jokers', null, 1, null, ev);
        // Steamodded calculate_effect: a mod joker's discard return pays `dollars` / runs `func`.
        mod_effect_tail(j, ev, { dollars: true });
        // Steamodded joker retriggers (MoreFluff's Lightning Strikes Thrice: discard effects twice more).
        if (t > 1) { ev = j.calculate_joker({ ...dctx, retrigger_joker: true }); if (!ev) break; }
      }
    }
    if (removed) {
      destroyed_cards.push(c);
      if (c.ability.name === 'Glass Card') c.shatter(); else c.start_dissolve();
    } else {
      c.ability.discarded = true;
      // (a mod may send it elsewhere: Bunco's The Claw shuffles discards back into the deck)
      draw_card(G.hand, (ACTIVE_MODS.length && firstHook('discard_destination', c)) || G.discard, 0, 'down', false, c);
    }
  }
  if (destroyed_cards.length) for (const j of G.jokers.cards.slice()) mod_context_effect(j, eval_card(j, { cardarea: G.jokers, remove_playing_cards: true, removed: destroyed_cards }).jokers);
  G.GAME.round_scores.cards_discarded.amt += count;
  // Steamodded post_discard context (a Pokermon lovely patch), mod cards only.
  if (!hook && ACTIVE_MODS.length) calculate_context({ post_discard: true, full_hand: hl });
  if (!hook) {
    if (G.GAME.modifiers.discard_cost) ease_dollars(-G.GAME.modifiers.discard_cost);
    ease_discard(-1);
    G.GAME.current_round.discards_used += 1;
    // (Bunco: Cracker Cards are played now instead — no draw; The Swing flips the hand)
    if (ACTIVE_MODS.length && callHook('discard_counted').includes(true)) { callHook('discarded', hook); return true; }
    G.STATE = STATES.DRAW_TO_HAND;
    G.E_MANAGER.add_event(() => { G.STATE_COMPLETE = false; });
  }
  if (ACTIVE_MODS.length) callHook('discard_end', hook);
  if (ACTIVE_MODS.length) callHook('discarded', hook); // (BETMMA's Trash Picker)
  return true;
}

// ----------------------------------------------------- public action API
const can = (cond, why) => { if (!cond) throw new ActionError(why); };
export class ActionError extends Error {}

/**
 * Apply one player action. Returns {ok, error?, events}. Actions are plain
 * JSON so a run is replayable as (seed, back, stake, [actions]).
 */
export function act(a) {
  const before = G.ui_events.length;
  try {
    can(!G.GAME.over, 'run is over');
    can(G.STATE_COMPLETE, 'busy');
    applyAction(a);
    pump();
    // Mods' per-frame checks (Lua Card:update / Game:update), after every action (BETMMA: Stow / Stash debuffs).
    if (ACTIVE_MODS.length && hasHook('update')) { callHook('update'); pump(); }
    (G.action_log = G.action_log || []).push(a);
    return { ok: true, events: G.ui_events.slice(before) };
  } catch (e) {
    if (!(e instanceof ActionError)) throw e;
    return { ok: false, error: e.message, events: G.ui_events.slice(before) };
  }
}

function inPack() { return PACK_STATES.includes(G.STATE); }

function applyAction(a) {
  const S = G.STATE;
  switch (a.type) {
    case 'select_blind': {
      can(S === STATES.BLIND_SELECT, 'not choosing a blind');
      const which = G.GAME.blind_on_deck;
      can(which && G.GAME.round_resets.blind_states[which] === 'Select', 'no blind to select');
      select_blind(which);
      break;
    }
    case 'skip_blind': {
      can(S === STATES.BLIND_SELECT, 'not choosing a blind');
      can(G.GAME.blind_on_deck !== 'Boss', 'cannot skip the boss');
      // A mod may forbid skipping (MoreFluff's Superboss hides the skip tags).
      can(!(ACTIVE_MODS.length && callHook('can_skip_blind').includes(false)), 'cannot skip now');
      skip_blind();
      break;
    }
    case 'reroll_boss': {
      can(S === STATES.BLIND_SELECT, 'not choosing a blind');
      can(G.GAME.dollars - G.GAME.bankrupt_at - 10 >= 0, 'not enough money');
      can(G.GAME.used_vouchers.v_retcon || (G.GAME.used_vouchers.v_directors_cut && !G.GAME.round_resets.boss_rerolled), 'no boss reroll');
      reroll_boss();
      break;
    }
    case 'highlight': {
      // toggle one hand card (or set exact selection with ids[])
      can(S === STATES.SELECTING_HAND || inPack(), 'not selecting');
      if (a.ids) {
        G.hand.unhighlight_all();
        for (const id of a.ids) { const c = find_card(id); if (c && c.area === G.hand && !(ACTIVE_MODS.length && callHook('can_highlight', G.hand, c).includes(false))) G.hand.add_to_highlighted(c); }
      } else {
        const c = find_card(a.id);
        can(c && c.area === G.hand, 'no such card in hand');
        if (G.hand.highlighted.includes(c)) G.hand.remove_from_highlighted(c);
        // (CardArea:can_highlight — Bunco: a linked group that won't fit can't be picked)
        else if (!(ACTIVE_MODS.length && callHook('can_highlight', G.hand, c).includes(false))) G.hand.add_to_highlighted(c);
      }
      if (ACTIVE_MODS.length) callHook('hand_highlighted');
      emit('highlight', { ids: G.hand.highlighted.map((c) => c.sort_id) });
      break;
    }
    case 'play': {
      can(S === STATES.SELECTING_HAND, 'not selecting a hand');
      // SMODS hand_limit.toml: play_limit (default 5; Pokermon's Aipom lowers it).
      const play_lim = ACTIVE_MODS.length ? reduceHook('selection_limit', Math.max(G.GAME.starting_params.play_limit ?? 5, 1), 'play') : Math.max(G.GAME.starting_params.play_limit ?? 5, 1);
      can(G.hand.highlighted.length > 0 && G.hand.highlighted.length <= play_lim && !G.GAME.blind.block_play, 'cannot play');
      // Mods acting as Play is pressed (a Lua G.FUNCS.play_cards_from_highlighted wrap); false = no hand after all.
      if (ACTIVE_MODS.length && callHook('pre_play').includes(false)) break;
      play_cards_from_highlighted();
      break;
    }
    case 'discard': {
      can(S === STATES.SELECTING_HAND, 'not selecting a hand');
      const disc_lim = ACTIVE_MODS.length ? reduceHook('selection_limit', Math.max(G.GAME.starting_params.discard_limit ?? 5, 0), 'discard') : Math.max(G.GAME.starting_params.discard_limit ?? 5, 0);
      can((G.GAME.current_round.discards_left > 0 || (ACTIVE_MODS.length && callHook('can_discard').includes(true))) && G.hand.highlighted.length > 0 && G.hand.highlighted.length <= disc_lim, 'cannot discard');
      discard_cards_from_highlighted();
      break;
    }
    case 'sort_hand': {
      G.hand.sort(a.by === 'suit' ? 'suit desc' : 'desc');
      emit('sorted', { area: 'hand', ids: G.hand.cards.map((c) => c.sort_id) });
      break;
    }
    case 'reorder': {
      const area = G[a.area];
      can(area && (area === G.jokers || area === G.hand || area === G.consumeables), 'cannot reorder');
      can(!(S === STATES.HAND_PLAYED), 'busy');
      const ids = a.ids;
      can(Array.isArray(ids) && ids.length === area.cards.length && ids.every((id) => area.cards.some((c) => c.sort_id === id)), 'bad order');
      const before = ACTIVE_MODS.length ? area.cards.slice() : null;
      area.cards.sort((x, y) => ids.indexOf(x.sort_id) - ids.indexOf(y.sort_id));
      area.set_ranks();
      emit('sorted', { area: a.area, ids });
      if (ACTIVE_MODS.length) callHook('reordered', area, before); // (a card drag — Bunco's Knight resets when jokers move)
      break;
    }
    case 'use': {
      const c = find_card(a.id);
      // (a consumable may also live in the joker row with mods: BETMMA's Forbidden Area, Balatro Mobile)
      can(c && (c.area === G.consumeables || c.area === G.pack_cards || (c.area === G.jokers && c.ability.consumeable) ||
        (ACTIVE_MODS.length && c.area && callHook('action_area', c, 'use').includes(true))), 'cannot use that'); // (a mod card area: Reverie's Cine slots)
      // Targets are the hand selection the consumable is checked (and used) against.
      if (a.targets) {
        if (ACTIVE_MODS.length) callHook('use_targets', c); // (Bunco: The 8 lifts the selection limit while it's the card in use)
        G.hand.unhighlight_all();
        for (const id of a.targets) { const t = find_card(id); if (t && t.area === G.hand && !(ACTIVE_MODS.length && callHook('can_highlight', G.hand, t).includes(false))) G.hand.add_to_highlighted(t); }
      }
      // joker_targets: the highlighted joker some mod consumables act on (Pokermon energy /
      // evolution items: "use on the selected joker"). Base-game consumables never read it.
      set_joker_targets(a.joker_targets);
      if (c.area === G.pack_cards) {
        can(inPack(), 'no pack open');
        // A mod may decide whether this pack card can be taken (Reverie: Cine cards / Crazy Lucky picks need a free slot).
        const sel = ACTIVE_MODS.length ? firstHook('pack_select', c) : undefined;
        if (sel !== undefined) can(sel, 'no space');
        else if (c.ability.consumeable) can(c.can_use_consumeable(), 'cannot use now');
        else can(c.ability.set !== 'Joker' || (c.edition && c.edition.negative) || G.jokers.cards.length < G.jokers.config.card_limit || (ACTIVE_MODS.length && callHook('buy_space', c).includes(true)), 'no joker space');
      } else {
        can(c.can_use_consumeable(), 'cannot use now');
      }
      use_card(c);
      break;
    }
    case 'reserve': {
      // Save a pack card to the consumable slots instead of using it (Pokermon's Pocket
      // packs and Megastone; adapted there from BETMMA). Only where an active mod allows it.
      can(inPack(), 'no pack open');
      const c = find_card(a.id);
      can(c && c.area === G.pack_cards && c.ability.consumeable, 'cannot save that');
      can(callHook('can_reserve', c).includes(true), 'cannot save that');
      // (full consumable slots: a mod may take it elsewhere — BETMMA's Forbidden Area, the joker row)
      const to = G.consumeables.cards.length < G.consumeables.config.card_limit ? G.consumeables : firstHook('reserve_area', c);
      can(to, 'no consumable space');
      G.E_MANAGER.add_event(() => {
        c.area.remove_card(c);
        c.add_to_deck();
        to.emplace(c);
        emit('reserved', { card: c.sort_id });
        G.GAME.pack_choices = G.GAME.pack_choices - 1;
        if (G.GAME.pack_choices <= 0) end_consumeable();
      });
      break;
    }
    case 'sell': {
      const c = find_card(a.id);
      can(c && (c.area === G.jokers || c.area === G.consumeables || (ACTIVE_MODS.length && c.area && callHook('action_area', c, 'sell').includes(true))), 'cannot sell that');
      can(c.can_sell_card(), 'cannot sell now');
      c.sell_card();
      for (const j of G.jokers.cards.slice()) if (j !== c) mod_context_effect(j, j.calculate_joker({ selling_card: true, card: c }));
      break;
    }
    case 'buy': {
      can(S === STATES.SHOP, 'shop is closed');
      const c = find_card(a.id);
      can(c && (c.area === G.shop_jokers || c.area === G.shop_vouchers || c.area === G.shop_booster), 'not for sale');
      can(!(c.cost > G.GAME.dollars - G.GAME.bankrupt_at && c.cost > 0), 'not enough money');
      if (c.area === G.shop_vouchers || c.ability.set === 'Voucher') { use_card(c); break; } // (a voucher in a shop slot: mods' Voucher Tycoon)
      // (a booster in any shop slot opens: Reverie's Cine shops stock packs in the card / voucher slots)
      if (c.area === G.shop_booster || c.ability.set === 'Booster') { use_card(c); break; }
      if (a.use) set_joker_targets(a.joker_targets); // (Buy & Use acts on the picked joker too, as in Balatro)
      if (a.use) can(c.ability.consumeable && c.can_use_consumeable(), 'cannot use now');
      buy_from_shop(c, !!a.use);
      break;
    }
    case 'reroll_shop': {
      can(S === STATES.SHOP, 'shop is closed');
      can(!(G.GAME.dollars - G.GAME.bankrupt_at - G.GAME.current_round.reroll_cost < 0 && G.GAME.current_round.reroll_cost !== 0), 'not enough money');
      reroll_shop();
      break;
    }
    case 'next_round': {
      can(S === STATES.SHOP, 'shop is closed');
      toggle_shop();
      break;
    }
    case 'skip_booster': {
      can(inPack(), 'no pack open');
      for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ skipping_booster: true }));
      if (ACTIVE_MODS.length) callHook('skip_booster'); // (a G.FUNCS.skip_booster wrap: a custom deck's money for skipping)
      end_consumeable();
      break;
    }
    case 'cash_out': {
      can(S === STATES.ROUND_EVAL && G.GAME.round_eval, 'nothing to cash out');
      cash_out();
      break;
    }
    case 'endless': {
      can(G.GAME.won && S === STATES.ROUND_EVAL || S === STATES.SHOP, 'not won yet');
      G.GAME.endless = true;
      break;
    }
    default: {
      // Mod actions (BETMMA's Flip, Vanish, the pack Discard, Balatro Mobile's moves): true = done, a string = why not.
      const r = ACTIVE_MODS.length ? firstHook('action', a, S) : undefined;
      if (r === undefined) throw new ActionError('unknown action ' + a.type);
      can(r === true, typeof r === 'string' ? r : 'cannot do that');
    }
  }
}

/** Convenience for UIs/tests: what can the player do right now? */
export function legal() {
  const S = G.STATE;
  return {
    state: STATE_NAMES[S],
    can_play: S === STATES.SELECTING_HAND && G.hand.highlighted.length > 0 && G.hand.highlighted.length <= 5 && !G.GAME.blind.block_play,
    can_discard: S === STATES.SELECTING_HAND && G.GAME.current_round.discards_left > 0 && G.hand.highlighted.length > 0,
    can_reroll: S === STATES.SHOP && !(G.GAME.dollars - G.GAME.bankrupt_at - G.GAME.current_round.reroll_cost < 0 && G.GAME.current_round.reroll_cost !== 0),
    can_skip_blind: S === STATES.BLIND_SELECT && G.GAME.blind_on_deck !== 'Boss' && !(ACTIVE_MODS.length && callHook('can_skip_blind').includes(false)),
    can_reroll_boss: S === STATES.BLIND_SELECT && G.GAME.dollars - G.GAME.bankrupt_at - 10 >= 0 && !!(G.GAME.used_vouchers.v_retcon || (G.GAME.used_vouchers.v_directors_cut && !G.GAME.round_resets.boss_rerolled)),
  };
}

export function blindChips(key) {
  const b = P_BLINDS[key];
  return B.mul(B.mul(get_blind_amount(G.GAME.round_resets.ante), b.mult), G.GAME.starting_params.ante_scaling);
}

export { G, STATES as S, number_format, get_poker_hand_info as pokerInfo };
