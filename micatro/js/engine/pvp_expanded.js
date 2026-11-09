// Micatro Multiplayer stage 7b — the EXPANDED ruleset's content (the internal 'pvp_expanded' mod, active only in an Expanded
// match, on top of 'pvp_balanced'): the Balatro Multiplayer mod's 9 Multiplayer jokers, the Asteroid planet, and its
// Expanded reworks (Golden Ticket Uncommon $6, Seltzer 8 hands, Turtle Bean +4, Ouija), re-implemented from their
// behaviour (Desktop/BalatroMultiplayer_ref/ANALYSIS.md Part B §3a / §3b / §4). Art: OUR OWN (tools/micatro/gen_mp_art.py).
//
// What a card reads of the OPPONENT comes in as RECORDED actions, so resume / replay / spectators rebuild it exactly:
//   {type:'pvp_opp', o: {lives, skips, hands, sells: {ante: n}, spent: [$ per blind slot]}}   the opponent's state, as the
//        client last saw it (the referee's lives, the opponent's sync summary, their hands left in a Nemesis round)
//   {type:'pvp_fx', n, k}   the nth effect sent TO this player, relayed by the server: 'lgg' (a Let's Go Gambling misfire:
//        +$10), 'pizza' (+1 discard for the rest of the ante), 'asteroid' (-1 level on the best hand), 'speedrun' (the
//        server saw both players reach the PvP Blind within 30 s: each SPEEDRUN makes a Spectral)
// What this player sends is decided by the engine (deterministic) and kept in G.GAME.pvp.sent; ui/pvp.js posts it.
import {
  G, P_CENTERS, P_CARDS, localize, emit, pseudorandom, pseudoseed, pseudoshuffle, pseudorandom_element, probability_roll, probability_vars,
  ease_dollars, ease_discard, ease_hands_played, create_card, level_up_hand, card_eval_status_text, play_sound, has_quantum_enhancement,
  mod_context_effect,
} from './core.js';
import { registerMod } from '../mods/registry.js';

export const EXPANDED_ID = 'pvp_expanded';
export const FX_KINDS = ['lgg', 'pizza', 'asteroid', 'speedrun'];
/** The Multiplayer jokers whose effects reach the other player (their "phantom" copies show on the opponent's HUD). */
export const PHANTOM_KEYS = ['j_mp_lets_go_gambling', 'j_mp_pizza', 'j_mp_speedrun', 'j_mp_conjoined_joker'];
const NEMESIS = 'bl_mp_nemesis';
// Asteroid: the best hand by level; a tie goes to the first in this list (the mod's order), mod hands last
const HAND_ORDER = ['Flush Five', 'Flush House', 'Five of a Kind', 'Straight Flush', 'Four of a Kind', 'Full House', 'Flush', 'Straight', 'Three of a Kind', 'Two Pair', 'Pair', 'High Card'];

const P = () => G.GAME.pvp;
const isExp = () => !!(G.GAME && G.GAME.pvp && G.GAME.pvp.ruleset === 'expanded');
const opp = () => (P() && P().opp) || {};
const say = (card, message, colour) => card_eval_status_text(card, 'extra', null, null, null, { message, colour });
const xm = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

/** setupPvp: an Expanded match's extra state (only then: a Balanced / Vanilla match's state is as before). */
export function setupExpanded(Pv) {
  Object.assign(Pv, { opp: {}, sent: [], fxin: 0, sells: {}, spent: [], shop: 0, pidx: -3, pizza: 0, pizzaAt: 0, asteroids: 0, pincher: false });
}

// ------------------------------------------------------------------ the recorded actions
export function expandedActionError(a) {
  if (!isExp()) return 'not an Expanded match';
  if (a.type === 'pvp_opp') return a.o && typeof a.o === 'object' && !Array.isArray(a.o) && JSON.stringify(a.o).length < 4000 ? null : 'bad opponent data';
  if (a.type === 'pvp_fx') {
    if (!FX_KINDS.includes(a.k)) return 'unknown effect';
    return a.n === (P().fxin || 0) + 1 ? null : 'not the next effect';
  }
  return 'unknown action';
}
export function expandedApply(a) {
  const Pv = P();
  if (a.type === 'pvp_opp') {
    const o = a.o, cur = Pv.opp || (Pv.opp = {});
    if ('lives' in o) cur.lives = num(o.lives);
    if ('skips' in o) cur.skips = num(o.skips);
    if ('hands' in o) cur.hands = o.hands == null ? null : num(o.hands);
    if (o.sells && typeof o.sells === 'object') cur.sells = Object.fromEntries(Object.entries(o.sells).slice(0, 60).map(([k, v]) => [String(k), num(v)]));
    if (Array.isArray(o.spent)) cur.spent = o.spent.slice(0, 200).map((v) => num(v));
    emit('pvp_opp', {});
    return;
  }
  // pvp_fx
  Pv.fxin = (Pv.fxin || 0) + 1;
  const k = a.k;
  if (k === 'lgg') { ease_dollars(10); emit('pvp_fx', { k, text: 'Your Nemesis misfired: +$10' }); }
  else if (k === 'pizza') { grantPizza(1); emit('pvp_fx', { k, text: 'Your Nemesis ate a Pizza: +1 discard this ante' }); }
  else if (k === 'asteroid') {
    const h = bestHand();
    if (h) { level_up_hand(null, h, true, -1); emit('pvp_fx', { k, hand: h, text: 'An Asteroid hit your ' + h + ': -1 level' }); }
  } else if (k === 'speedrun') {
    for (const j of G.jokers.cards.slice()) {
      if (j.config.center.key !== 'j_mp_speedrun' || j.debuff) continue;
      if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) { say(j, localize('k_no_space_ex')); continue; }
      const c = create_card('Spectral', G.consumeables, null, null, null, null, null, 'mp_speedrun');
      c.add_to_deck(); G.consumeables.emplace(c);
      say(j, localize('k_plus_spectral'), 'SECONDARY_SET.Spectral');
    }
    emit('pvp_fx', { k, text: 'SPEEDRUN!' });
  }
}
/** The opponent's best poker hand by level (visible hands, ties by the mod's order). */
function bestHand() {
  let best = null, bl = -1, bi = 1e9;
  for (const [name, h] of Object.entries(G.GAME.hands)) {
    if (!h.visible) continue;
    const i = HAND_ORDER.includes(name) ? HAND_ORDER.indexOf(name) : 999;
    if (h.level > bl || (h.level === bl && i < bi)) { best = name; bl = h.level; bi = i; }
  }
  return best && bl > 1 ? best : null;
}
/** +n discards for the rest of the ante (`ending`: granted as the Boss ends this ante — they last through the next one). */
function grantPizza(n, ending) {
  const Pv = P();
  Pv.pizza = (Pv.pizza || 0) + n; Pv.pizzaAt = G.GAME.round_resets.ante + (ending ? 1 : 0);
  G.GAME.round_resets.discards += n;
  ease_discard(n, true);
}
/** The engine side of pvp_start_blind: Penny Pincher unlocks; stored Asteroids fly. */
export function expandedStartBlind() {
  const Pv = P();
  Pv.pincher = true;
  for (; Pv.asteroids > 0; Pv.asteroids--) Pv.sent.push({ k: 'asteroid' });
}
/** pvpSkipped: a skip is a blind slot with nothing spent (Penny Pincher's list), and moves its index on. */
export function expandedSkipped() { const Pv = P(); Pv.spent.push(0); Pv.pidx += 1; }
/** The view's Expanded part (what ui/pvp.js reports and posts). */
export function expandedView(vp) {
  const Pv = P();
  Object.assign(vp, { opp: { ...(Pv.opp || {}) }, sent: Pv.sent.map((x) => x.k), fxin: Pv.fxin || 0, sells: { ...Pv.sells }, spent: Pv.spent.slice(-60), skips: G.GAME.skips || 0, pizza: Pv.pizza || 0, asteroids: Pv.asteroids || 0 });
}

// ------------------------------------------------------------------ the cards
const J = (key, name, rarity, cost, pos, cfg, beh, flags = {}) => ({
  key, set: 'Joker', name, rarity, cost, atlas: 'mtpvp_jokers', pos, config: cfg,
  blueprint_compat: flags.bp !== false, eternal_compat: flags.et !== false, perishable_compat: flags.per !== false,
  order: 1000 + pos.x + pos.y * 5, ...beh,
});
const ex = (c) => c.ability.extra;
const defensiveC = () => (G.GAME.stake >= 6 ? 75 : 125);
const defensiveChips = () => (P() ? Math.max(0, (num(opp().lives, P().lives) - P().lives) * defensiveC()) : 0);
const skipDiff = () => Math.max(0, (G.GAME.skips || 0) - num(opp().skips));
const conjX = (c) => Math.min(ex(c).max, Math.max(1, 1 + ex(c).gain * num(opp().hands)));
const taxesGain = () => {
  const s = opp().sells || {}, ante = G.GAME.round_resets.ante;
  let n = num(s[ante]);
  if (ante <= (P().pvpStart || 2)) for (let a = 1; a < ante; a++) n += num(s[a]);
  return n;
};

const JOKERS = [
  J('j_mp_defensive_joker', 'Defensive Joker', 1, 4, { x: 0, y: 0 }, { extra: { chips: 125, high: 75 } }, {
    loc_vars: () => ({ vars: [125, 75, G.GAME && G.GAME.pvp ? defensiveChips() : 0] }),
    calculate(center, card, ctx) {
      if (ctx.joker_main) { const c = defensiveChips(); if (c > 0) return { message: localize({ type: 'variable', key: 'a_chips', vars: [c] }), chip_mod: c }; }
      return undefined;
    },
  }),
  J('j_mp_skip_off', 'Skip-Off', 2, 5, { x: 1, y: 0 }, { extra: { hands: 1, discards: 1 } }, {
    loc_vars: () => {
      const d = G.GAME && G.GAME.pvp ? skipDiff() : 0, diff = G.GAME && G.GAME.pvp ? (G.GAME.skips || 0) - num(opp().skips) : 0;
      return { vars: [d, d, diff > 0 ? diff + ' ahead' : diff < 0 ? -diff + ' behind' : 'tied'] };
    },
    calculate(center, card, ctx) {
      if (ctx.setting_blind && !ctx.blueprint) {
        const d = skipDiff();
        if (d > 0) { ease_hands_played(d); ease_discard(d); return { message: '+' + d + '/+' + d }; }
      }
      return undefined;
    },
  }, { bp: false }),
  J('j_mp_lets_go_gambling', "Let's Go Gambling", 2, 6, { x: 2, y: 0 }, { extra: { odds: 4, xmult: 4, dollars: 10, nemesis_odds: 4, nemesis_dollars: 10 } }, {
    loc_vars: (center, iq, card) => {
      const e = card ? ex(card) : center.config.extra;
      const [n, d] = card ? probability_vars(card, 1, e.odds, 'j_mp_lets_go_gambling') : [1, e.odds];
      const [n2, d2] = card ? probability_vars(card, 1, e.nemesis_odds, 'j_mp_lets_go_gambling_misfire') : [1, e.nemesis_odds];
      return { vars: [n, d, e.xmult, e.dollars, n2, d2, e.nemesis_dollars] };
    },
    calculate(center, card, ctx) {
      if (!ctx.joker_main) return undefined;
      const e = ex(card);
      // (in a PvP round: an independent misfire roll — the Nemesis gets the money)
      if (G.GAME.pvp_blind && probability_roll(card, 'j_mp_lets_go_gambling_misfire', 1, e.nemesis_odds)) {
        if (isExp()) P().sent.push({ k: 'lgg' });
        say(card, 'Oops!', 'RED');
      }
      if (probability_roll(card, 'j_mp_lets_go_gambling', 1, e.odds)) {
        ease_dollars(e.dollars);
        return { message: xm(e.xmult), Xmult_mod: e.xmult };
      }
      return undefined;
    },
  }),
  J('j_mp_speedrun', 'SPEEDRUN', 2, 6, { x: 3, y: 0 }, {}, {
    loc_vars: () => ({ vars: [30] }),
  }),
  J('j_mp_conjoined_joker', 'Conjoined Joker', 2, 6, { x: 4, y: 0 }, { extra: { gain: 0.5, max: 3 } }, {
    loc_vars: (center, iq, card) => ({ vars: [0.5, 3, card && G.GAME && G.GAME.pvp ? conjX(card) : 1] }),
    calculate(center, card, ctx) {
      if (ctx.joker_main && G.GAME.pvp_blind) { const x = conjX(card); if (x > 1) return { message: xm(x), Xmult_mod: x }; }
      return undefined;
    },
  }),
  J('j_mp_penny_pincher', 'Penny Pincher', 1, 4, { x: 0, y: 1 }, { extra: { dollars: 1, per: 3 } }, {
    // (in the shops only after the first PvP Blind started)
    in_pool: () => !!(G.GAME && G.GAME.pvp && G.GAME.pvp.pincher),
    loc_vars: () => ({ vars: [1, 3] }),
    calc_dollar_bonus() {
      const Pv = P();
      if (!Pv || Pv.pidx < 1) return undefined;
      const v = num((opp().spent || [])[Pv.pidx - 1]);
      const pay = Math.floor(v / 3);
      return pay > 0 ? pay : undefined;
    },
  }, { bp: false }),
  J('j_mp_taxes', 'Taxes', 1, 5, { x: 1, y: 1 }, { extra: { gain: 4, mult: 0 } }, {
    loc_vars: (center, iq, card) => ({ vars: [4, card ? ex(card).mult : 0] }),
    calculate(center, card, ctx) {
      const e = ex(card);
      if (ctx.setting_blind && !ctx.blueprint && G.GAME.pvp_blind) {
        const n = taxesGain();
        if (n > 0) { e.mult += e.gain * n; return { message: 'Filed!', colour: 'MULT' }; }
      }
      if (ctx.joker_main && e.mult > 0) return { message: localize({ type: 'variable', key: 'a_mult', vars: [e.mult] }), mult_mod: e.mult };
      return undefined;
    },
  }, { per: false }),
  J('j_mp_pizza', 'Pizza', 1, 4, { x: 2, y: 1 }, { extra: { discards: 2, nemesis: 1 } }, {
    loc_vars: () => ({ vars: [2, 1] }),
    // (eaten at the end of a PvP round: the end_round hook below)
  }, { bp: false, et: false }),
  J('j_mp_pacifist', 'Pacifist', 1, 4, { x: 3, y: 1 }, { extra: { xmult: 10 } }, {
    loc_vars: () => ({ vars: [10] }),
    calculate(center, card, ctx) {
      if (ctx.joker_main && !G.GAME.pvp_blind) return { message: xm(ex(card).xmult), Xmult_mod: ex(card).xmult };
      return undefined;
    },
  }),
];

// the Expanded reworks of vanilla cards: the same behaviour as the vanilla card (the engine's code keys on the name), new numbers
const rework = (vkey, key, patch) => {
  const v = P_CENTERS[vkey];
  return { key, set: v.set, name: v.name, rarity: v.rarity, cost: v.cost, order: v.order + 0.5, config: JSON.parse(JSON.stringify(v.config)),
    blueprint_compat: v.blueprint_compat, eternal_compat: v.eternal_compat, perishable_compat: v.perishable_compat,
    atlas: 'mtpvp_vjokers', pos: { ...v.pos }, mp_rework: vkey,
    // (the vanilla card's own rules — the engine's code keys on the vanilla center — with this card's numbers)
    calculate(mc, card, ctx) { const own = card.config.center; card.config.center = v; try { return card.calculate_joker(ctx); } finally { card.config.center = own; } },
    ...patch };
};
const REWORKS = [
  // Golden Ticket: Uncommon $6 (vanilla Common $5)
  rework('j_ticket', 'j_mp_ticket', { rarity: 2, cost: 6, loc_vars: (c, iq, card) => ({ vars: [card ? card.ability.extra : 4] }) }),
  // Seltzer: 8 hands (vanilla 10)
  rework('j_selzer', 'j_mp_seltzer', { config: { extra: 8 }, loc_vars: (c, iq, card) => ({ vars: [card ? card.ability.extra : 8] }) }),
  // Turtle Bean: +4 hand size (vanilla +5)
  rework('j_turtle_bean', 'j_mp_turtle_bean', { config: { extra: { h_size: 4, h_mod: 1 } }, loc_vars: (c, iq, card) => { const e = card ? card.ability.extra : { h_size: 4, h_mod: 1 }; return { vars: [e.h_size, e.h_mod] }; } }),
];
const OUIJA = {
  key: 'c_mp_ouija', set: 'Spectral', name: 'MP Ouija', cost: 4, consumeable: true, order: 8.5, config: { extra: { destroy: 3 } },
  atlas: 'mtpvp_vtarots', pos: { ...P_CENTERS.c_ouija.pos }, mp_rework: 'c_ouija',
  loc_vars: () => ({ vars: [3] }),
  can_use: () => !!(G.hand && G.hand.cards.length >= 3),
  use(center, card) {
    // destroy 3 random cards in hand (a fixed order first, then the seeded shuffle), the rest become one random rank — no hand-size loss
    const tmp = G.hand.cards.slice().sort((a, b) => (a.playing_card || 0) - (b.playing_card || 0));
    pseudoshuffle(tmp, pseudoseed('ouija_destroy'));
    const gone = tmp.slice(0, 3);
    const [rank] = pseudorandom_element(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'], pseudoseed('ouija'));
    G.E_MANAGER.add_event(() => { play_sound('tarot1'); card.juice_up(0.3, 0.5); });
    G.E_MANAGER.add_event(() => {
      for (const c of gone) { if (c.ability.name === 'Glass Card' || has_quantum_enhancement(c, 'm_glass')) c.shatter(); else c.start_dissolve(); }
    });
    for (const c of G.hand.cards) {
      if (gone.includes(c)) continue;
      G.E_MANAGER.add_event(() => { c.flip(); c.set_base(P_CARDS[c.base.suit.substring(0, 1) + '_' + rank]); c.flip(); });
    }
    for (const j of G.jokers.cards) mod_context_effect(j, j.calculate_joker({ remove_playing_cards: true, removed: gone }));
  },
};
const ASTEROID = {
  key: 'c_mp_asteroid', set: 'Planet', name: 'Asteroid', cost: 3, consumeable: true, order: 100, config: {},
  atlas: 'mtpvp_planets', pos: { x: 0, y: 0 },
  loc_vars: () => ({ vars: [] }),
  can_use: () => true,
  use(center, card) {
    P().asteroids = (P().asteroids || 0) + 1;
    say(card, '+1 Asteroid', 'SECONDARY_SET.Planet');
  },
};

const LOC = {
  Joker: {
    j_mp_defensive_joker: { name: 'Defensive Joker', text: ['{C:chips}+#1#{} Chips for each life', 'you have fewer than', 'your {C:attention}Nemesis', '{C:inactive}(+#2# at Purple Stake or above)', '{C:inactive}(Currently {C:chips}+#3#{C:inactive} Chips)'] },
    j_mp_skip_off: { name: 'Skip-Off', text: ['{C:blue}+1{} Hand and {C:red}+1{} Discard', 'each Blind for every Blind', 'you have skipped more', 'than your {C:attention}Nemesis', '{C:inactive}(Currently {C:blue}+#1#{C:inactive}/{C:red}+#2#{C:inactive}, #3#)'] },
    j_mp_lets_go_gambling: { name: "Let's Go Gambling", text: ['{C:green}#1# in #2#{} chance for', '{X:mult,C:white} X#3# {} Mult and {C:money}$#4#{}', 'In a {C:attention}PvP Blind{}, {C:green}#5# in #6#{}', 'chance to give your', '{C:attention}Nemesis{} {C:money}$#7#{}'] },
    j_mp_speedrun: { name: 'SPEEDRUN', text: ['If you reach a {C:attention}PvP Blind', 'within {C:attention}#1#{} seconds of', 'your {C:attention}Nemesis{}, create a', 'random {C:spectral}Spectral{} card', '{C:inactive}(Must have room)'] },
    j_mp_conjoined_joker: { name: 'Conjoined Joker', text: ['In a {C:attention}PvP Blind{}, gains', '{X:mult,C:white} X#1# {} Mult for each Hand', 'your {C:attention}Nemesis{} has left', '{C:inactive}(Max {X:mult,C:white} X#2# {C:inactive}, Currently {X:mult,C:white} X#3# {C:inactive})'] },
    j_mp_penny_pincher: { name: 'Penny Pincher', text: ['Earn {C:money}$#1#{} at end of round', 'for every {C:money}$#2#{} your {C:attention}Nemesis', 'spent in the matching', 'shop of the last ante'] },
    j_mp_taxes: { name: 'Taxes', text: ['When you select a {C:attention}PvP Blind{},', 'gains {C:mult}+#1#{} Mult for each card', 'your {C:attention}Nemesis{} sold this ante', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)'] },
    j_mp_pizza: { name: 'Pizza', text: ['At the end of a {C:attention}PvP Blind{},', 'eaten: {C:red}+#1#{} Discards for the', 'rest of the ante, and {C:red}+#2#{}', 'for your {C:attention}Nemesis'] },
    j_mp_pacifist: { name: 'Pacifist', text: ['{X:mult,C:white} X#1# {} Mult while', 'not in a {C:attention}PvP Blind'] },
    j_mp_ticket: { name: 'Golden Ticket', text: ['Played {C:attention}Gold{} cards', 'earn {C:money}$#1#{} when scored'] },
    j_mp_seltzer: { name: 'Seltzer', text: ['Retrigger all', 'cards played for', 'the next {C:attention}#1#{} hands'] },
    j_mp_turtle_bean: { name: 'Turtle Bean', text: ['{C:attention}+#1#{} hand size,', 'reduces by', '{C:red}#2#{} every round'] },
  },
  Spectral: { c_mp_ouija: { name: 'Ouija', text: ['Destroys {C:attention}#1#{} random', 'cards in hand, converts', 'the rest to a single', 'random {C:attention}rank'] } },
  Planet: { c_mp_asteroid: { name: 'Asteroid', text: ['Remove {C:attention}1{} level from', "your {C:attention}Nemesis'{} highest", 'level poker hand at the', 'start of the next {C:attention}PvP Blind'] } },
};
const BADGE = { text: 'Multiplayer', colour: '#ac3232' };
const BAL = { text: 'Balanced', colour: '#ac3232' };

registerMod({
  id: EXPANDED_ID,
  name: 'Multiplayer: Expanded',
  hidden: true,
  content: {
    atlases: {
      mtpvp_jokers: { src: '/micatro/assets/textures/pvp/MPJokers.png', px: 71, py: 95 },
      mtpvp_planets: { src: '/micatro/assets/textures/pvp/MPPlanets.png', px: 71, py: 95 },
      mtpvp_vjokers: { src: '/micatro/assets/textures/Jokers.png', px: 71, py: 95 },
      mtpvp_vtarots: { src: '/micatro/assets/textures/Tarots.png', px: 71, py: 95 },
    },
    centers: [...JOKERS, ...REWORKS, OUIJA, ASTEROID],
    loc: { descriptions: LOC },
  },
  hooks: {
    // the bookkeeping the opponent's cards read: cards sold per ante (Taxes), $ spent per shop (Penny Pincher)
    sell_card() { const Pv = P(), a = G.GAME.round_resets.ante; Pv.sells[a] = (Pv.sells[a] || 0) + 1; },
    dollars_eased(mod) { if (mod < 0 && G.STATE === G.STATES.SHOP) P().shop += -mod; },
    shop_start() { P().shop = 0; },
    shop_end() { P().spent.push(P().shop); P().shop = 0; },
    // the end of a round: Penny Pincher's index; a PvP round eats the Pizzas (+2 discards this ante, +1 for the Nemesis)
    end_round() {
      const Pv = P();
      Pv.pidx += 1;
      if (!G.GAME.pvp_blind) return;
      for (const j of G.jokers.cards.slice()) {
        if (j.config.center.key !== 'j_mp_pizza' || j.debuff) continue;
        grantPizza(ex(j).discards, G.GAME.blind_on_deck === 'Boss');
        Pv.sent.push({ k: 'pizza' });
        say(j, localize('k_eaten_ex'), 'FILTER');
        G.E_MANAGER.add_event(() => { j.start_dissolve(); });
        if (j.remove_from_deck) j.remove_from_deck();
      }
    },
    // a new ante takes the Pizza discards of an earlier ante back
    ease_ante() {
      const Pv = P();
      if (Pv.pizza && Pv.pizzaAt <= G.GAME.round_resets.ante) { G.GAME.round_resets.discards -= Pv.pizza; Pv.pizza = 0; }
    },
    describe(card, desc) {
      const c = card && card.config && card.config.center;
      if (!c || !desc || !Array.isArray(desc.badges)) return;
      if (c.mp_rework) desc.badges.push(BAL);
      else if (c.mod === EXPANDED_ID) desc.badges.push(BADGE);
    },
  },
});
export { NEMESIS };
