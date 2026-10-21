// Bunco — the 16 tags (Bunco.lua ~7072-7641 + lovely "Insta-yep", "Edition tags", "Filigree Tag", "Pin
// Collector"):
//   Breaking (disable the Boss Blind), Arcade (a free Mega Virtual Pack), Triple (two copies of the next tag;
//   only with Pin Collector), Glitter / Fluorescent (the next base-edition shop joker: free + that edition),
//   Chips / Mult / Megamult / Ultrachips (+50 Chips, +10 Mult before the hand / X1.5 Mult, X1.3 Chips at its
//   end — made by USING a Foil / Holo / Polychrome / Glitter consumable, never in the tag pool), Filigree (the
//   next Standard Pack is all Exotic cards), and the sticker tags Eternal / Perishable / Scattering / Hindered /
//   Reactive / Rental (made by The Depths / The Chasm; never in the pool).
// Port notes: the hand_played tags change the hand's running score through flow.js's `modify_scoring` steps
// (context.score = {hand_chips, mult}); Tag:instayep (the delayless yep) is `instayep` below.
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { G, P_CENTERS, P_CARDS, Card, emit, play_sound, mod_chips, mod_mult, pseudorandom, pseudoseed, pseudorandom_element } from '../../js/engine/core.js';
import { use_card } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { data_of, SEED, enable_exotics, FLEURONS, HALBERDS, big_juice, has_any_suit } from './util.js';
import { apply_sticker } from './stickers.js';

/** Tag:instayep(message, colour, func): shown at once; the tag hides, runs func and goes. */
function instayep(tag, message, colour, func) {
  emit('tag_yep', { tag: tag.key, id: tag.ID, message, colour });
  play_sound('generic1', 0.9, 0.8); play_sound('holo1', 1.2, 0.4);
  G.E_MANAGER.add_event(() => { tag.HUD_hidden = true; });
  if (func) G.E_MANAGER.add_event(() => { func(); });
  G.E_MANAGER.add_event(() => { tag.remove(); });
}
function open_free_pack(key) {
  const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
  card.cost = 0;
  card.from_tag = true;
  use_card(card);
  emit('materialize', { card: card.sort_id });
}
const tag = (slug, def) => ({ ...data_of('tags', 'tag_bunc_' + slug), name: 'tag_bunc_' + slug, ...def });
const edition_tag = (slug, edition) => tag(slug, {
  loc_vars: (s, iq) => { iq.push(P_CENTERS['e_' + edition]); return { vars: [] }; },
  apply(self, t, ctx) {
    if (ctx.type !== self.config.type) return undefined;
    let applied;
    const card = ctx.card;
    if (card && !card.edition && !card.temp_edition && card.ability.set === 'Joker') {
      card.temp_edition = true;
      t.yep('+', 'DARK_EDITION', () => {
        card.set_edition({ [edition]: true }, true);
        card.ability.couponed = true;
        card.set_cost();
        card.temp_edition = undefined;
        return true;
      });
      applied = true;
      t.triggered = true;
    }
    return applied;
  },
});
const hand_tag = (slug, when, info, apply_score) => tag(slug, {
  loc_vars: () => ({ vars: [info()] }),
  in_pool: () => false,
  apply(self, t, ctx) {
    if (ctx.type !== self.config.type || !ctx[when] || !ctx.score) return undefined;
    apply_score(ctx.score);
    emit('hand_text', { chips: ctx.score.hand_chips, mult: ctx.score.mult });
    instayep(t, '+', slug === 'chips' || slug === 'xchips' ? 'CHIPS' : 'MULT', () => true);
    t.triggered = true;
    return true;
  },
});
const sticker_tag = (slug, eligible, set, info) => tag(slug, {
  loc_vars: (s, iq) => { iq.push(info()); return { vars: [] }; },
  in_pool: () => false,
  apply(self, t, ctx) {
    if (ctx.type !== self.config.type) return undefined;
    const card = ctx.card;
    if (card && card.ability.set === 'Joker' && eligible(card.ability, card)) {
      t.yep('+', 'RED', () => { set(card); big_juice(card); card.set_cost(); return true; });
      t.triggered = true;
    }
    return true; // (the Lua answers true either way: the next shop joker uses the tag's turn)
  },
});
const no_bunco_sticker = (a) => !a.bunc_scattering && !a.bunc_hindered && !a.bunc_reactive;

export const tags = [
  tag('breaking', {
    apply(self, t, ctx) {
      // (5.4.8b: also on 'immediate' — the reworked Luchador, sold during a Boss Blind, disables it right away)
      if (ctx.type !== self.config.type && ctx.type !== 'immediate') return undefined;
      if (G.GAME.blind && G.GAME.blind.boss && !G.GAME.blind.disabled) {
        t.yep('+', 'BLUE', () => true);
        G.E_MANAGER.add_event(() => { G.GAME.blind.disable(); });
        t.triggered = true;
        return true;
      }
      return undefined;
    },
    in_pool: () => pseudorandom('breaking' + SEED()) < 0.07,
  }),
  tag('arcade', {
    loc_vars: (s, iq) => { const p = P_CENTERS.p_bunc_virtual_mega; iq.push({ key: 'p_bunc_virtual_mega', set: 'Other', vars: [p.config.choose, p.config.extra] }); return { vars: [] }; },
    apply(self, t, ctx) {
      if (ctx.type !== self.config.type) return undefined;
      t.yep('+', 'BUNCO_VIRTUAL', () => { open_free_pack('p_bunc_virtual_mega'); return true; });
      t.triggered = true;
      return true;
    },
    in_pool: () => pseudorandom('arcade' + SEED()) < 0.1,
  }),
  tag('triple', {
    apply(self, t, ctx) {
      if (ctx.type !== self.config.type || ctx.tag.key === 'tag_double' || ctx.tag.key === 'tag_bunc_triple') return undefined;
      t.yep('+', 'BUNCO_VIRTUAL', () => {
        if (ctx.tag.ability && ctx.tag.ability.orbital_hand) G.orbital_hand = ctx.tag.ability.orbital_hand;
        add_tag(new Tag(ctx.tag.key));
        add_tag(new Tag(ctx.tag.key));
        G.orbital_hand = undefined;
        return true;
      });
      t.triggered = true;
      return true;
    },
    in_pool: () => !!G.GAME.used_vouchers.v_bunc_pin_collector,
  }),
  edition_tag('glitter', 'bunc_glitter'),
  { ...edition_tag('fluorescent', 'bunc_fluorescent'), in_pool: () => pseudorandom('fluorescent' + SEED()) < 0.5 },
  hand_tag('chips', 'before', () => P_CENTERS.e_foil.config.extra, (s) => { s.hand_chips = mod_chips(BN.add(s.hand_chips, P_CENTERS.e_foil.config.extra)); }),
  hand_tag('mult', 'before', () => P_CENTERS.e_holo.config.extra, (s) => { s.mult = mod_mult(BN.add(s.mult, P_CENTERS.e_holo.config.extra)); }),
  hand_tag('xmult', 'after', () => P_CENTERS.e_polychrome.config.extra, (s) => { s.mult = mod_mult(BN.mul(s.mult, P_CENTERS.e_polychrome.config.extra)); }),
  hand_tag('xchips', 'after', () => P_CENTERS.e_bunc_glitter.config.Xchips, (s) => { s.hand_chips = mod_chips(BN.mul(s.hand_chips, P_CENTERS.e_bunc_glitter.config.Xchips)); }),
  tag('filigree', {
    loc_vars: (s, iq) => { iq.push({ key: 'bunc_exotic_cards', set: 'Other' }); return { vars: [] }; },
    apply(self, t, ctx) {
      if (ctx.type !== self.config.type) return undefined;
      instayep(t, '+', 'BUNCO_EXOTIC', () => true);
      G.E_MANAGER.add_event(() => {
        if (G.pack_cards && G.pack_cards.cards[0]) {
          enable_exotics();
          for (const v of G.pack_cards.cards) {
            if ((!v.is_suit(FLEURONS) && !v.is_suit(HALBERDS)) || has_any_suit(v)) { // (5.4.8b: SMODS.has_any_suit)
              v.change_suit(pseudorandom_element([FLEURONS, HALBERDS], pseudoseed('filigree' + SEED()))[0]);
            }
          }
        }
      });
      t.triggered = true;
      return true;
    },
    in_pool: () => !!(G.GAME && G.GAME.Exotic),
  }),
  // (5.4.8b: Eternal never on a Scattering / Hindered joker or one that can't be Eternal, Perishable never on one that can't
  // be Perishable — the tag then waits for the next shop joker instead of being used up for nothing)
  sticker_tag('eternal', (a, c) => !a.eternal && !a.perishable && !a.bunc_scattering && !a.bunc_hindered && !!c.config.center.eternal_compat, (c) => c.set_eternal(true), () => ({ key: 'eternal', set: 'Other' })),
  sticker_tag('perishable', (a, c) => !a.perishable && !a.eternal && !!c.config.center.perishable_compat, (c) => c.set_perishable(true), () => ({ key: 'perishable', set: 'Other', vars: [G.GAME.perishable_rounds || 1, G.GAME.perishable_rounds || 1] })),
  sticker_tag('scattering', (a) => no_bunco_sticker(a) && !a.eternal, (c) => apply_sticker('bunc_scattering', c, true), () => ({ key: 'bunc_scattering', set: 'Other' })),
  sticker_tag('hindered', (a) => no_bunco_sticker(a) && !a.eternal, (c) => apply_sticker('bunc_hindered', c, true), () => ({ key: 'bunc_hindered', set: 'Other' })),
  sticker_tag('reactive', (a) => no_bunco_sticker(a), (c) => apply_sticker('bunc_reactive', c, true), () => ({ key: 'bunc_reactive', set: 'Other' })),
  sticker_tag('rental', (a) => !a.rental, (c) => c.set_rental(true), () => ({ key: 'rental', set: 'Other', vars: [G.GAME.rental_rate || 1] })),
];

export const hooks = {
  // Filigree Tag (card_open lovely patch): a Standard Pack being opened.
  booster_open(booster) {
    if (!/Standard/.test(booster.ability.name)) return;
    for (const t of G.GAME.tags.slice()) if (t.apply_to_run({ type: 'standard_pack_opened' })) break;
  },
};
export const centers = [];
export { instayep, open_free_pack };
