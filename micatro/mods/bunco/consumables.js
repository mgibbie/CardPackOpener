// Bunco — consumables (Bunco.lua ~4388-5813):
//   Tarots ("Thoth" set): Adjustment (-> Cracker), The Art (-> Copper), The Universe (randomize up to 3 cards),
//     Lust ($1 per card held, max $52); "mysterious": The Sky / The Abyss (up to 3 cards -> Fleurons / Halberds;
//     they also switch the Exotic System on; only in the pool once it is on)
//   Planets: Quaoar, Haumea, Sedna, Makemake (level up the 4 Spectrum hands; Mercury's text, as the Lua does)
//   Spectral: Cleanse (up to 3 cards -> Fluorescent)
//   Polymino (a new consumable type, shop rate 0 — the Digital deck makes it 2): The I, O, T, S, Z, J, L, / link 4
//     selected unlinked cards (5 with Polybius) whose ranks / suits make the piece's pattern; The 8 (a hidden
//     Spectral that rolls like The Soul in Polymino packs, 0.2%) links any number of unlinked cards.
// Port notes: the Polymino checks iterate Lua `pairs` over suit / rank tallies where the order can matter (The S
// / The Z with a 5th card); Micatro uses first-seen order (deterministic). SMODS.poll_seal / poll_enhancement are
// ported below (The Universe).
import {
  G, P_CENTERS, P_CENTER_POOLS, P_SEALS, LOC as BASE_LOC, ease_dollars, poll_edition, pseudorandom, pseudoseed, get_current_pool, localize,
} from '../../js/engine/core.js';
import { data_of, enable_exotics, exotic_in_pool, link_cards, random_suit, random_rank, change_base, SUIT_BUFFER, event, big_juice } from './util.js';
import LOC from './loc.js';

// Planets show Mercury's text (process_loc_text).
for (const k of ['c_bunc_quaoar', 'c_bunc_haumea', 'c_bunc_sedna', 'c_bunc_makemake']) LOC.descriptions.Planet[k].text = BASE_LOC.descriptions.Planet.c_mercury.text;

/** SMODS.poll_seal({key, mod, guaranteed, type_key}) */
export function poll_seal(args = {}) {
  const key = args.key || 'stdseal';
  const mod = args.mod || 1;
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  const hit = pseudorandom(pseudoseed(key + G.GAME.round_resets.ante)) > 1 - 0.02 * mod;
  if (!(hit || args.guaranteed)) return null;
  const options = P_CENTER_POOLS.Seal.filter((s) => !(s.in_pool && !s.in_pool(s)));
  let total = 0;
  const avail = options.map((s) => { const w = (P_SEALS[s.key] && P_SEALS[s.key].weight) || 5; total += w; return { key: s.key, weight: w }; });
  const poll = pseudorandom(pseudoseed(type_key));
  let wi = 0;
  for (const v of avail) { wi += v.weight; if (poll > 1 - wi / total) return v.key; }
  return null;
}
/** SMODS.poll_enhancement({key, mod, guaranteed, options, type_key}) */
export function poll_enhancement(args = {}) {
  let key = args.key || 'std_enhance';
  const mod = args.mod || 1;
  const options = args.options || get_current_pool('Enhanced')[0];
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  key = key + G.GAME.round_resets.ante;
  const avail = [];
  let total = 0;
  for (const v of options) {
    if (v === 'UNAVAILABLE') continue;
    const w = P_CENTERS[v].weight ?? 5;
    if (w > 0) { avail.push({ key: v, weight: w }); total += w; }
  }
  total = total + (total / 40 * 60);
  let type_weight = 0;
  for (const v of avail) { const c = P_CENTERS[v.key]; v.weight = c.get_weight ? c.get_weight(c) : v.weight; type_weight += v.weight; }
  const poll = pseudorandom(pseudoseed(key));
  if (poll > 1 - (type_weight * mod / total) || args.guaranteed) {
    const tpoll = pseudorandom(pseudoseed(type_key));
    let wi = 0;
    for (const v of avail) { wi += v.weight; if (tpoll > 1 - wi / type_weight) return v.key; }
  }
  return null;
}

const cons = (slug, def = {}) => {
  const d = data_of('consumables', 'c_bunc_' + slug);
  return { cost: 3, ...d, config: d.config || {}, consumeable: true, name: d.key, ...def };
};
const thoth = { set_badges: (s, card, badges) => { if (badges[0]) badges[0] = { ...badges[0], label: localize('bunc_thoth_tarot') }; } };
const mysterious = { set_badges: (s, card, badges) => { if (badges[0]) badges[0] = { ...badges[0], label: localize('bunc_mysterious_tarot') }; } };
const dwarf = { set_badges: (s, card, badges) => { if (badges[0]) badges[0] = { ...badges[0], label: localize('k_dwarf_planet') }; } };

function convert_suits(self) {
  enable_exotics();
  const hl = G.hand.highlighted.slice();
  for (const c of hl) event(() => { c.flip(); });
  for (const c of hl) event(() => { c.change_suit(self.config.suit_conv); });
  for (const c of hl) event(() => { c.flip(); });
  event(() => G.hand.unhighlight_all());
}

// ---- Polyminoes: the shared checks
const selected_ok = () => G.hand && (G.hand.highlighted.length === 4 || (G.GAME.used_vouchers.v_bunc_polybius && G.hand.highlighted.length === 5));
const unlinked = (cards) => cards.every((c) => !c.ability.group);
const suits_of = (c) => SUIT_BUFFER.filter((s) => c.is_suit(s, null, true));
/** suit -> [cards] and rank -> [cards], first-seen order. */
function tallies(cards) {
  const suit = new Map(), rank = new Map();
  for (const c of cards) {
    for (const s of SUIT_BUFFER) if (c.is_suit(s, null, true)) { if (!suit.has(s)) suit.set(s, []); suit.get(s).push(c); }
    const r = c.get_id();
    if (!rank.has(r)) rank.set(r, []);
    rank.get(r).push(c);
  }
  return { suit, rank };
}
const CHECKS = {
  the_i(cards) {
    for (const s of SUIT_BUFFER) if (cards.filter((c) => c.is_suit(s, null, true)).length >= 4) return true;
    for (const c of cards) if (cards.filter((d) => d.get_id() === c.get_id()).length >= 4) return true;
    return false;
  },
  the_o(cards) {
    const { suit, rank } = tallies(cards);
    const ms = [...suit.values()].filter((v) => v.length >= 2).length;
    const mr = [...rank.values()].filter((v) => v.length >= 2).length;
    return ms >= 2 || mr >= 2;
  },
  the_t(cards) {
    const { suit, rank } = tallies(cards);
    let ms = 0, xs = 0, mr = 0, xr = 0;
    for (const v of suit.values()) { if (v.length >= 3) ms++; else if (v.length >= 1) xs++; }
    for (const v of rank.values()) { if (v.length >= 3) mr++; else if (v.length >= 1) xr++; }
    return (ms >= 1 && xs >= 1) || (mr >= 1 && xr >= 1);
  },
  the_s(cards) {
    const { rank } = tallies(cards);
    let p1, p2;
    for (const v of rank.values()) { if (v.length >= 2) { if (!p1) p1 = v; else if (!p2) { p2 = v; break; } } }
    if (!p1 || !p2) return false;
    for (const a of p1) for (const b of p2) for (const s of SUIT_BUFFER) if (a.is_suit(s, null, true) && b.is_suit(s, null, true)) return true;
    return false;
  },
  the_z(cards) {
    const { suit } = tallies(cards);
    let p1, p2;
    for (const v of suit.values()) { if (v.length >= 2) { if (!p1) p1 = v; else if (!p2) { p2 = v; break; } } }
    if (!p1 || !p2) return false;
    for (const a of p1) for (const b of p2) if (a.get_id() === b.get_id()) return true;
    return false;
  },
  the_j(cards) {
    const { rank } = tallies(cards);
    let three, other;
    for (const v of rank.values()) { if (v.length >= 3) three = v; else if (v.length >= 1) { other = other || []; other.push(...v); } }
    if (!three || !other) return false;
    for (const s of SUIT_BUFFER) for (const o of other) if (o.is_suit(s, null, true)) for (const c of three) if (c.is_suit(s, null, true)) return true;
    return false;
  },
  the_l(cards) {
    const { suit } = tallies(cards);
    let three, other;
    for (const v of suit.values()) { if (v.length >= 3) three = v; else if (v.length >= 1) { other = other || []; other.push(...v); } }
    if (!three || !other) return false;
    for (const o of other) for (const c of three) if (c.get_id() === o.get_id()) return true;
    return false;
  },
  the_slash(cards) {
    const rank_set = new Set(), suit_set = new Set();
    let extra_suits = 0, extra_ranks = 0;
    const n = cards.length;
    for (const c of cards) {
      const r = c.get_id();
      const cs = suits_of(c);
      if (rank_set.has(r)) extra_ranks++;
      if ((n === 4 && extra_ranks >= 1) || (n === 5 && extra_ranks >= 2)) return false;
      for (const s of cs) if (suit_set.has(s)) extra_suits++;
      if ((n === 4 && extra_suits >= 1) || (n === 5 && extra_suits >= 2)) return false;
      rank_set.add(r);
      for (const s of cs) suit_set.add(s);
    }
    return true;
  },
};
const polymino = (slug, def = {}) => cons(slug, {
  loc_vars: (s, iq) => { iq.push({ set: 'Other', key: 'bunc_linked_group' }); return { vars: [] }; },
  can_use: () => !!(selected_ok() && unlinked(G.hand.highlighted) && CHECKS[slug](G.hand.highlighted)),
  use(self, card) { link_cards(G.hand.highlighted, self.key); big_juice(card); },
  ...def,
});

export const consumable_types = [{
  key: 'Polymino', primary_colour: '#424e54', secondary_colour: '#4fb66f', background_colour: '#50506a', shop_rate: 0, default: 'c_bunc_the_i',
  collection_rows: [4, 4], name: 'Polymino',
}];

export const centers = [
  cons('adjustment', { ...thoth, effect: 'Enhance', loc_vars: (s, iq) => { iq.push(P_CENTERS.m_bunc_cracker); return { vars: [s.config.max_highlighted, localize({ type: 'name_text', set: 'Enhanced', key: s.config.mod_conv })] }; } }),
  cons('art', { ...thoth, effect: 'Enhance', loc_vars: (s, iq) => { iq.push(P_CENTERS.m_bunc_copper); return { vars: [s.config.max_highlighted, localize({ type: 'name_text', set: 'Enhanced', key: s.config.mod_conv })] }; } }),
  cons('universe', {
    ...thoth,
    loc_vars: (s) => ({ vars: [s.config.max_highlighted] }),
    can_use: (s) => !!(G.hand && G.hand.highlighted.length >= 1 && G.hand.highlighted.length <= s.config.max_highlighted),
    use() {
      for (const pc of G.hand.cards.slice()) {
        if (!pc.highlighted) continue;
        const new_seal = poll_seal({ guaranteed: true, key: 'universe' });
        const new_enh = poll_enhancement({ guaranteed: true, key: 'universe' });
        const new_edition = poll_edition('universe', null, true, true);
        const new_suit = random_suit(pseudoseed('universe'));
        const new_rank = random_rank(pseudoseed('universe'));
        event(() => {
          big_juice(pc);
          if (pc.seal) pc.set_seal(new_seal, true);
          if (pc.config.center !== P_CENTERS.c_base && new_enh) pc.set_ability(P_CENTERS[new_enh]);
          if (pc.edition) pc.set_edition(new_edition, true);
          change_base(pc, new_suit, new_rank);
        });
      }
    },
  }),
  cons('lust', {
    ...thoth,
    loc_vars: (s) => { const reward = G.hand && G.hand.cards && G.hand.cards.length > 0 ? G.hand.cards.length * s.config.bonus : 0; return { vars: [s.config.bonus, s.config.limit, reward <= s.config.limit ? reward : s.config.limit] }; },
    can_use: () => !!(G.hand && G.hand.cards && G.hand.cards.length > 0),
    use(self) { const reward = G.hand.cards.length * self.config.bonus; ease_dollars(reward <= self.config.limit ? reward : self.config.limit); },
  }),
  cons('sky', { ...mysterious, loc_vars: (s) => ({ vars: [s.config.max_highlighted] }), use: (self) => convert_suits(self), in_pool: () => exotic_in_pool() }),
  cons('abyss', { ...mysterious, loc_vars: (s) => ({ vars: [s.config.max_highlighted] }), use: (self) => convert_suits(self), in_pool: () => exotic_in_pool() }),
  ...['quaoar', 'haumea', 'sedna', 'makemake'].map((k) => cons(k, {
    ...dwarf,
    loc_vars: (s) => { const h = G.GAME && G.GAME.hands && G.GAME.hands[s.config.hand_type]; return { vars: [h ? h.level : 1, localize(s.config.hand_type, 'poker_hands'), h ? h.l_mult : 0, h ? h.l_chips : 0] }; },
  })),
  cons('cleanse', {
    loc_vars: (s, iq) => { iq.push(P_CENTERS.e_bunc_fluorescent); return { vars: [s.config.max_highlighted] }; },
    can_use: (s) => !!(G.hand && G.hand.highlighted.length <= s.config.max_highlighted && G.hand.highlighted[0] && G.hand.highlighted.every((c) => !c.edition)),
    use(self, card) {
      const hl = G.hand.highlighted.slice();
      for (const c of hl) event(() => { c.set_edition({ bunc_fluorescent: true }, true); });
      big_juice(card);
    },
  }),
  polymino('the_i'), polymino('the_o'), polymino('the_t'), polymino('the_s'), polymino('the_z'), polymino('the_j'), polymino('the_l'),
  polymino('the_slash', {
    in_pool: () => exotic_in_pool(),
    set_badges: (s, card, badges) => { if (badges[0]) badges[0] = { ...badges[0], label: localize('bunc_mysterious_polymino') }; },
  }),
  cons('the_8', {
    hidden: true, soul_rate: 0.002, soul_set: 'Polymino', config: {},
    loc_vars: (s, iq) => { iq.push({ set: 'Other', key: 'bunc_linked_group' }); return { vars: [] }; },
    can_use: () => !!(G.hand && unlinked(G.hand.highlighted) && G.hand.highlighted.length > 1),
    use(self, card) { link_cards(G.hand.highlighted, self.key); big_juice(card); },
  }),
];
export const hooks = {};
