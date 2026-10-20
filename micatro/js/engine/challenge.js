// Micatro — challenges: Balatro's 20 (micatro/data/challenges.js) and every registered mod's
// (`registerMod({..., challenges: [...]})`, each mod's own challenges.js / data).
//
//   newRun({..., challenge: 'c_omelette_1'})   -> the run starts with the challenge's rules (run.js)
//
// The challenge ID is part of the run RECIPE (session.js), so resume / replay / spectate rebuild the
// same run. A challenge plays like Balatro's G.FUNCS.start_run challenge block (game.lua Game:start_run):
// the Challenge Deck back at stake 1, `rules.modifiers` -> starting params, `rules.custom` -> G.GAME.modifiers
// (no_reward / no_reward_specific / no_shop_jokers special-cased), starting jokers / consumables / vouchers
// (queued like the Lua's events), `restrictions` -> banned keys, and `deck` (an explicit card list, or the
// standard 52 filtered by yes/no ranks and suits, with an enhancement / edition / seal on every card).
//
// The rules that need code at run time live in the internal 'challenge' mod (never listed, never in
// G.GAME.mods): Balatro's CardArea:update minus_hand_size_per_X_dollar, plus each challenge's own
// `hooks` (a mod challenge's Lua patches — Pokermon's Nuzlocke, BETMMA's Gotta Go Fast...) and `apply`
// (a custom rule the mod's lovely patch sets up at the start, e.g. MoreFluff's mf_superboss_active).
// A run without a challenge never activates it, so vanilla runs are untouched.

import { G, P_CENTERS, P_TAGS, P_BLINDS, LOC, Card, add_joker } from './core.js';
import { describeCenter } from './describe.js';
import * as B from './bignum.js';
import { registerMod, MODS, MOD_LOC, centerActive } from '../mods/registry.js';
import VANILLA from '../../data/challenges.js';

export const CHALLENGE_ID = 'challenge';
export const CHALLENGE_BACK = 'b_challenge';
export const VANILLA_CHALLENGES = VANILLA;

const list = (x) => (Array.isArray(x) ? x : []);
/** A challenge in its canonical shape (SMODS.Challenge defaults filled in). */
export function normalize(c, mod = null) {
  if (!c || typeof c !== 'object') return null;
  const id = c.id || c.key;
  if (!id) return null;
  const r = c.rules || {}, rs = c.restrictions || {};
  return {
    id, name: (c.name && c.name !== id ? c.name : null) || (MOD_LOC.misc.challenge_names && MOD_LOC.misc.challenge_names[id]) || c.name || id, mod: c.mod || mod || null, button_colour: c.button_colour || null,
    rules: { custom: list(r.custom), modifiers: list(r.modifiers) },
    jokers: list(c.jokers), consumeables: list(c.consumeables), vouchers: list(c.vouchers),
    // (SMODS reads challenge.deck only; Pokermon's Nuzlocke nests its deck inside restrictions — ignored, as in the mod)
    deck: c.deck && typeof c.deck === 'object' && !Array.isArray(c.deck) ? c.deck : { type: 'Challenge Deck' },
    restrictions: { banned_cards: list(rs.banned_cards), banned_tags: list(rs.banned_tags), banned_other: list(rs.banned_other) },
    hooks: c.hooks || null, apply: typeof c.apply === 'function' ? c.apply : null,
    // A DAILY challenge (Pokermon 3.9.1's Mystery Dungeon): date 'DDMMYYYY' -> the run's seed. The UI passes today's date at the
    // start (newRun `daily`); the engine never reads the clock, and the recipe's seed carries the day.
    daily_seed: typeof c.daily_seed === 'function' ? c.daily_seed : null,
    requires: list(c.requires),
  };
}

/** Every challenge the site knows right now: Balatro's, then each REGISTERED mod's (load order). */
export function allChallenges() {
  const out = VANILLA.map((c) => normalize(c));
  for (const m of Object.values(MODS)) {
    if (m.hidden || !Array.isArray(m.challenges)) continue;
    for (const c of m.challenges) { const n = normalize(c, m.id); if (n) out.push(n); }
  }
  return out;
}
/** The challenge with this id, or null (a mod challenge needs its mod registered). */
export function findChallenge(id) {
  if (!id || typeof id !== 'string') return null;
  return allChallenges().find((c) => c.id === id) || null;
}
/** The mods a challenge needs on (its own mod + any it lists). */
export const challengeMods = (ch) => (ch ? [...new Set([...(ch.mod ? [ch.mod] : []), ...ch.requires])] : []);

/** A challenge's back: 'Challenge Deck' -> b_challenge; a deck.type naming another back plays on that one. */
export function challengeBack(ch) {
  const t = ch && ch.deck && ch.deck.type;
  if (!t || t === 'Challenge Deck') return CHALLENGE_BACK;
  if (P_CENTERS[t] && P_CENTERS[t].set === 'Back') return t;
  const byName = Object.values(P_CENTERS).find((c) => c.set === 'Back' && c.name === t);
  return byName ? byName.key : CHALLENGE_BACK;
}

/** Set up the internal mod's hooks for this run (call before activateMods). */
export function prepareChallenge(ch) {
  MODS[CHALLENGE_ID].hooks = ch && ch.hooks ? { ...BASE_HOOKS, ...ch.hooks } : { ...BASE_HOOKS };
}

const usable = (key) => !!(P_CENTERS[key] && centerActive(P_CENTERS[key]));

/**
 * Balatro's challenge block in Game:start_run, after the back's apply_to_run (run.js newRun).
 * Jokers / consumables / vouchers are queued like the Lua's events (newRun's pump runs them in order).
 */
export function apply_challenge(ch) {
  const GAME = G.GAME;
  GAME.challenge = ch.id;
  GAME.challenge_view = { id: ch.id, name: ch.name, mod: ch.mod }; // (what the view shows: no lookup per view)
  ch.jokers.forEach((v, k) => {
    if (!v || !usable(v.id)) return;
    G.E_MANAGER.add_event(() => {
      const card = add_joker(v.id, v.edition || null, k !== 0);
      if (v.eternal) card.set_eternal(true);
      if (v.pinned) card.pinned = true;
    });
  });
  ch.consumeables.forEach((v, k) => {
    if (!v || !usable(v.id)) return;
    // (Lua passes no edition for consumables; BETMMA's Overpowered Boss intends a Negative Soul, so an edition is honoured)
    G.E_MANAGER.add_event(() => { add_joker(v.id, v.edition || null, k !== 0); });
  });
  for (const v of ch.vouchers) {
    if (!v || !usable(v.id)) continue;
    GAME.used_vouchers[v.id] = true;
    G.E_MANAGER.add_event(() => {
      GAME.starting_voucher_count = (GAME.starting_voucher_count || 0) + 1;
      Card.apply_to_run(null, P_CENTERS[v.id]);
    });
  }
  for (const v of ch.rules.modifiers) if (v && v.id) GAME.starting_params[v.id] = v.value;
  for (const v of ch.rules.custom) {
    if (!v || !v.id) continue;
    if (v.id === 'no_reward') {
      GAME.modifiers.no_blind_reward = GAME.modifiers.no_blind_reward || {};
      GAME.modifiers.no_blind_reward.Small = true; GAME.modifiers.no_blind_reward.Big = true; GAME.modifiers.no_blind_reward.Boss = true;
    } else if (v.id === 'no_reward_specific') {
      GAME.modifiers.no_blind_reward = GAME.modifiers.no_blind_reward || {};
      GAME.modifiers.no_blind_reward[v.value] = true;
    } else if (v.value !== undefined && v.value !== null && v.value !== false) GAME.modifiers[v.id] = v.value;
    else if (v.id === 'no_shop_jokers') GAME.joker_rate = 0;
    else GAME.modifiers[v.id] = true;
  }
  const rs = ch.restrictions;
  for (const v of rs.banned_cards) {
    if (!v || !v.id) continue;
    GAME.banned_keys[v.id] = true;
    for (const vv of list(v.ids)) GAME.banned_keys[vv] = true;
  }
  for (const v of rs.banned_tags) if (v && v.id) GAME.banned_keys[v.id] = true;
  for (const v of rs.banned_other) if (v && v.id) GAME.banned_keys[v.id] = true;
  if (ch.apply) ch.apply(GAME, ch);
}

/**
 * The challenge's starting deck from newRun's protos ({s, r} per standard card, built from P_CARDS):
 * an explicit `deck.cards` list replaces them; otherwise yes/no ranks + suits filter them and
 * `enhancement` / `edition` / `gold_seal` go on every card (Game:start_run's card_protos loop).
 */
export function challenge_protos(ch, protos) {
  const de = ch && ch.deck;
  if (!de) return protos;
  if (Array.isArray(de.cards)) return de.cards.filter((c) => c && c.s && c.r).map((c) => ({ s: c.s, r: c.r, e: c.e, d: c.d, g: c.g }));
  const has = (t, k) => !!(t && (Array.isArray(t) ? t.includes(k) : t[k]));
  const out = [];
  for (const p of protos) {
    const r = p.r, s = p.s;
    if (de.yes_ranks && !has(de.yes_ranks, r)) continue;
    if (de.no_ranks && has(de.no_ranks, r)) continue;
    if (de.yes_suits && !has(de.yes_suits, s)) continue;
    if (de.no_suits && has(de.no_suits, s)) continue;
    const q = { ...p };
    if (de.enhancement) q.e = de.enhancement;
    if (de.edition) q.d = de.edition;
    if (de.gold_seal) q.g = de.gold_seal === true ? 'Gold' : de.gold_seal;
    out.push(q);
  }
  return out;
}

// ----------------------------------------------------------- the Challenges screen's text
const vtext = (k) => (LOC.misc.v_text && LOC.misc.v_text[k]) || (MOD_LOC.misc.v_text && MOD_LOC.misc.v_text[k]) || null;
const fillv = (lines, v) => lines.map((l) => String(l).replace(/#1#/g, v == null ? '' : String(v)));
const centerName = (k) => {
  try { const d = describeCenter(k); if (d && d.name) return d.name; } catch (e) { /* fall through */ }
  const c = P_CENTERS[k];
  const d = c && ((LOC.descriptions[c.set] && LOC.descriptions[c.set][k]) || (MOD_LOC.descriptions[c.set] && MOD_LOC.descriptions[c.set][k]));
  return (d && d.name) || (c && c.name) || k;
};
/** A center as a card view the UI can draw (cardCanvas / composeFace). */
const cardOf = (k, extra = {}) => {
  const c = P_CENTERS[k];
  if (!c) return { center: k, name: k, missing: true };
  const v = { center: k, set: c.set, name: centerName(k) };
  if (c.mod) { v.mod = c.mod; v.atlas = c.atlas; v.pos = c.pos; if (c.soul_pos) v.soul_pos = c.soul_pos; }
  return Object.assign(v, extra);
};
const EDITION = { foil: 'foil', holo: 'holo', holographic: 'holo', polychrome: 'polychrome', negative: 'negative' };
const SUIT_NAME = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };
const RANK_NAME = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };
/**
 * Everything the Challenges screen shows for a challenge (Balatro's challenge_description: Rules /
 * Restrictions / Deck), as plain data: rule lines (Balatro's ch_c_ / ch_m_ texts, mods' own), the
 * starting jokers / consumables / vouchers and the bans as card views, and the deck's make-up.
 */
export function challengeInfo(ch) {
  const rules = [], modifiers = [];
  for (const v of ch.rules.custom) {
    if (!v || !v.id) continue;
    let t = vtext('ch_c_' + v.id);
    if (v.id === 'no_reward_specific') t = vtext('ch_c_no_reward_specific');
    if (t) rules.push(...fillv(t, v.value));
  }
  for (const v of ch.rules.modifiers) {
    if (!v || !v.id) continue;
    const t = vtext('ch_m_' + v.id);
    modifiers.push(...(t ? fillv(t, v.value) : [`${v.id.replace(/_/g, ' ')}: ${v.value}`]));
  }
  const ed = (e) => (e ? EDITION[e] || e : undefined);
  const jokers = ch.jokers.filter((j) => j && j.id).map((j) => cardOf(j.id, { edition: ed(j.edition), eternal: !!j.eternal, pinned: !!j.pinned }));
  const consumables = ch.consumeables.filter((j) => j && j.id).map((j) => cardOf(j.id, { edition: ed(j.edition) }));
  const vouchers = ch.vouchers.filter((j) => j && j.id).map((j) => cardOf(j.id));
  const rs = ch.restrictions;
  const banned_cards = rs.banned_cards.filter((b) => b && b.id).map((b) => cardOf(b.id));
  const tagLoc = (k) => (LOC.descriptions.Tag && LOC.descriptions.Tag[k]) || (MOD_LOC.descriptions.Tag && MOD_LOC.descriptions.Tag[k]);
  const banned_tags = rs.banned_tags.filter((b) => b && b.id).map((b) => ({ key: b.id, name: (tagLoc(b.id) && tagLoc(b.id).name) || (P_TAGS[b.id] && P_TAGS[b.id].name) || b.id }));
  // (a mod blind's `name` is its key, as in Steamodded: its shown name is its loc entry's)
  const blindLoc = (k) => { const d = (LOC.descriptions.Blind && LOC.descriptions.Blind[k]) || (MOD_LOC.descriptions.Blind && MOD_LOC.descriptions.Blind[k]); return d && d.name; };
  const banned_other = rs.banned_other.filter((b) => b && b.id).map((b) => ({ key: b.id, type: b.type || 'blind', name: blindLoc(b.id) || (P_BLINDS[b.id] && P_BLINDS[b.id].name) || b.id }));
  // the deck: its cards (as Balatro builds them) and a short make-up
  const std = [];
  for (const s of ['S', 'H', 'C', 'D']) for (const r of ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']) std.push({ s, r });
  const cards = challenge_protos(ch, std);
  const deck = { back: challengeBack(ch), size: cards.length, lines: [], cards: cards.map((c) => [c.s + '_' + c.r, c.e || 0, c.d || 0, c.g || 0]) };
  deck.lines.push(`${cards.length} cards`);
  const enh = {}; const seals = {};
  for (const c of cards) { if (c.e) enh[c.e] = (enh[c.e] || 0) + 1; if (c.g) seals[c.g] = (seals[c.g] || 0) + 1; }
  for (const [k, n] of Object.entries(enh)) deck.lines.push(`${n} ${centerName(k)}${n === 1 ? '' : 's'}`);
  for (const [k, n] of Object.entries(seals)) deck.lines.push(`${n} with a ${k} Seal`);
  const ranks = [...new Set(cards.map((c) => c.r))];
  if (ranks.length < 13) deck.lines.push('Ranks: ' + ranks.map((r) => RANK_NAME[r] || r).join(', '));
  const suits = [...new Set(cards.map((c) => c.s))];
  if (suits.length < 4) deck.lines.push('Suits: ' + suits.map((x) => SUIT_NAME[x] || x).join(', '));
  return { id: ch.id, name: ch.name, mod: ch.mod, colour: ch.button_colour, rules, modifiers, jokers, consumables, vouchers, banned_cards, banned_tags, banned_other, deck };
}

// ----------------------------------------------------------- run-time rules (the internal mod)
const BASE_HOOKS = {
  /** CardArea:update (G.hand): hold -1 card per $X — math.floor(dollars / X), tracked in last_poll_size. */
  update() {
    const x = G.GAME && G.GAME.modifiers.minus_hand_size_per_X_dollar;
    if (!x || !G.hand || G.GAME.custom_deck) return; // (a custom deck's own rule handles it there)
    const cur = Math.floor(B.toNumber(G.GAME.dollars) / x);
    const last = G.hand.config.last_poll_size || 0;
    if (cur !== last) { G.hand.change_size(last - cur); G.hand.config.last_poll_size = cur; }
  },
  start_run() { BASE_HOOKS.update(); },
  view(view) {
    if (G.GAME && G.GAME.challenge_view) view.challenge = { ...G.GAME.challenge_view };
  },
};

registerMod({
  id: CHALLENGE_ID,
  name: 'Challenge',
  hidden: true, // engine-internal: never listed, never in G.GAME.mods
  hooks: { ...BASE_HOOKS },
});

