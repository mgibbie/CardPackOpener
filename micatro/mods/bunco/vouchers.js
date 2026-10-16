// Bunco — the 12 vouchers (Bunco.lua ~7696-7929 + lovely "Editions in boosters", "Hedge Trimmer", "Shell
// Game 1-10", "Masquerade", "Fanny Pack", "Pin Collector"):
//   Lamination / Supercoating    consumables in packs may / always come with an edition (Foil, Holo, Poly, Glitter)
//   Hedge Trimmer / Chainsaw     -5% blind score every hand played / every required score -20%
//   Cups 'n' Balls / Shell Game  +1 shop booster slot / reroll an open pack's contents once per pack
//   Disguise / Masquerade        Blind Packs in the shop / Blind Packs are free
//   Fanny Pack / Pin Collector   1 in 4 to gain a Double Tag when skipping / Double Tags become Triple Tags
//   Arcade Machine / Polybius    Virtual Packs 4X likelier (packs.js) / Polyminoes link one more card (consumables.js)
// Shell Game's patches 6, 7 and 9 are marked UNSTABLE in the source (they wrap Card:open's state block and skip
// animation delays); the intended behaviour — the pack's cards are thrown away and the SAME pack opens again,
// free, with its state, size and remaining picks unchanged, once per pack — is the engine's `reopening` path
// in Card:open plus the `bunc_reroll_pack` action here.
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { G, P_CENTERS, P_CARDS, Card, get_pack, pseudorandom, pseudoseed, number_format, emit, play_sound } from '../../js/engine/core.js';
import { STATES } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { data_of, SEED, event } from './util.js';

const used = (k) => !!G.GAME.used_vouchers['v_bunc_' + k];
const voucher = (slug, def = {}) => {
  const d = data_of('vouchers', 'v_bunc_' + slug);
  return { cost: 10, config: {}, ...d, set: 'Voucher', name: d.key, ...def };
};
export const centers = [
  voucher('lamination'),
  voucher('supercoating'),
  voucher('hedge_trimmer', { loc_vars: (s) => ({ vars: [s.config.percent] }) }),
  voucher('chainsaw', {
    loc_vars: (s) => ({ vars: [s.config.percent] }),
    redeem(self) { G.GAME.starting_params.ante_scaling = (G.GAME.starting_params.ante_scaling / 100) * (100 - self.config.percent); },
  }),
  voucher('cups_n_balls', {
    // G.GAME.modifiers.extra_boosters + 1; SMODS.add_booster_to_shop() (a pack now, if the shop is open)
    redeem() {
      G.GAME.modifiers.extra_boosters = (G.GAME.modifiers.extra_boosters || 0) + 1;
      if (G.shop_open && G.shop_booster) {
        const card = new Card(P_CARDS.empty, get_pack('shop_pack'));
        card.ability.booster_pos = G.shop_booster.cards.length + 1;
        G.shop_booster.emplace(card);
      }
    },
  }),
  voucher('shell_game'),
  voucher('disguise'),
  voucher('masquerade', {
    redeem() { if (G.shop_booster) for (const b of G.shop_booster.cards) if (b.config.center.kind === 'bunc_blind') b.cost = 0; },
  }),
  voucher('fanny_pack', {
    loc_vars: (s, iq, card) => { iq.push({ set: 'Tag', key: 'tag_double' }); return { vars: [G.GAME && G.GAME.probabilities ? G.GAME.probabilities.normal : 1, ((card && card.ability && card.ability.extra) || s.config.extra).odds] }; },
  }),
  voucher('pin_collector', { loc_vars: (s, iq) => { iq.push({ set: 'Tag', key: 'tag_bunc_triple' }); return { vars: [] }; } }),
  voucher('arcade_machine'),
  voucher('polybius'),
];

/** SMODS poll_edition(_key, _mod, _no_neg, _guaranteed, _options) over the given editions (weighted). */
export function poll_options(key, mod, no_neg, guaranteed, options) {
  const poll = pseudorandom(pseudoseed(key));
  const W = { e_foil: 20, e_holo: 14, e_polychrome: 3, e_negative: 3 };
  const rate = G.GAME.edition_rate;
  const base_w = (k) => W[k] ?? P_CENTERS[k].weight;
  const get_w = (k) => (k === 'e_polychrome' ? (rate - 1) * 3 + rate * 3 : k === 'e_negative' ? 3 : W[k] !== undefined ? rate * W[k] : P_CENTERS[k].get_weight(P_CENTERS[k]));
  const avail = options.map((k) => ({ name: k, weight: base_w(k) }));
  let total = avail.reduce((n, v) => n + v.weight, 0);
  let modifier = 1;
  if (!guaranteed) {
    modifier = mod ?? 1;
    total = total + (total / 4 * 96);
    for (const v of avail) v.weight = get_w(v.name);
  }
  let wi = 0;
  for (const v of avail) {
    wi += v.weight * modifier;
    if (poll > 1 - wi / total && !(v.name === 'e_negative' && no_neg)) return { [v.name.slice(2)]: true };
  }
  return null;
}

const PACK_STATES = () => [STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.SPECTRAL_PACK, STATES.STANDARD_PACK, STATES.BUFFOON_PACK, STATES.MOD_PACK, STATES.MOD_PACK_HAND];
export const can_reroll_pack = () => used('shell_game') && !G.GAME.rerolled_pack && !!G.GAME.last_booster_pack && !!G.pack_cards && PACK_STATES().includes(G.STATE);

export const hooks = {
  // Editions in boosters 1/2-2/2: every pack card rolls; a consumable without an edition takes it.
  pack_card_created(booster, card) {
    const edition = poll_options('standard_edition' + G.GAME.round_resets.ante, used('lamination') ? 2 : 0, true, used('supercoating'),
      ['e_holo', 'e_foil', 'e_polychrome', 'e_bunc_glitter']);
    if (!card.edition && card.ability.consumeable && edition) card.set_edition(edition, true, true);
  },
  // Hedge Trimmer (Blind:press_play, every blind): -5% of the blind's score each hand.
  blind_press_play(b) {
    if (!used('hedge_trimmer')) return;
    const final_chips = BN.mul(BN.div(b.chips, 100), 100 - P_CENTERS.v_bunc_hedge_trimmer.config.percent);
    event(() => { b.chips = final_chips; b.chip_text = number_format(b.chips); });
  },
  // Masquerade: Blind Packs cost nothing.
  set_cost(card) { if (card.config.center.kind === 'bunc_blind' && G.GAME && G.GAME.used_vouchers && used('masquerade')) card.cost = 0; },
  // Fanny Pack: a skip may bring a Double Tag (before the skipped blind's own tag).
  skip_blind(when) {
    if (when !== 'before' || !used('fanny_pack')) return;
    if (pseudorandom('fanny_pack' + SEED()) < G.GAME.probabilities.normal / P_CENTERS.v_bunc_fanny_pack.config.extra.odds) add_tag(new Tag('tag_double'));
  },
  // Pin Collector: new Double Tags arrive as Triple Tags, which Double Tags don't copy.
  add_tag: (t) => (used('pin_collector') && t.key === 'tag_double' ? new Tag('tag_bunc_triple') : undefined),
  double_tag_copies: (t) => (t.key === 'tag_bunc_triple' ? false : undefined),
  // Shell Game 4/10: the pack being opened (and whether it was already rerolled).
  use_card(card) {
    if (card.ability.set === 'Booster') { G.GAME.last_booster_pack = card; G.GAME.rerolled_pack = !!card.rerolled; }
  },
  action(a) {
    if (a.type !== 'bunc_reroll_pack') return undefined;
    if (!can_reroll_pack()) return 'cannot reroll this pack';
    // G.FUNCS.reroll_booster_pack
    const last_pack = G.GAME.last_booster_pack;
    last_pack.cost = 0;
    last_pack.rerolled = true;
    last_pack.reopening = true;
    G.GAME.rerolled_pack = true;
    for (const c of G.pack_cards.cards.slice()) { G.pack_cards.remove_card(c); c.remove(); }
    event(() => { play_sound('other1'); last_pack.open(); });
    emit('bunc_pack_rerolled', {});
    return true;
  },
  view(view) {
    if (can_reroll_pack()) view.mod_buttons = [...(view.mod_buttons || []), { where: 'pack', label: 'Reroll', enabled: true, action: { type: 'bunc_reroll_pack' }, colour: 'green' }];
  },
};
