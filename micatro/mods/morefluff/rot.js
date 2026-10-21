/**
 * More Fluff 1.9.9999 — batch B3: the 7 "45 Degree Rotated" Legendaries (src/jokers/rot_*.lua), their prepared Spectral
 * cards, and The Soul! (c_mf_rot_soul, src/rotarots.lua: a hidden Spectral that rolls in Rotarot packs and makes one).
 * Each legendary starts prepared (prepared.js); using its Spectral unprepares it until its own condition:
 *
 *   Canio!      a non-face card is destroyed            Doom Blade      destroy 1-3 selected face cards; each non-face
 *                                                                       card held gets -X0.05 Blind size per card destroyed
 *                                                                       (perma_x_blind_size, floored at X0.05)
 *   Triboulet!  a Pair is discarded                     Royal Decree    until the end of the round each hand played adds a
 *                                                                       King and a Queen to the scoring hand (X3 Mult each,
 *                                                                       then they're destroyed)
 *   Yorick!     every 23 cards discarded                Windfall        every card in hand gains X0.2 Chips (perma_x_chips),
 *                                                                       then the hand is discarded
 *   Chicot!     a Blind is skipped                      Negate          disable the Blind, its size ^0.8
 *   Perkeo!     a hand with 4 suits (prepared at the    Mirrorform      two Negative copies of random consumables
 *               end of the round)
 *   Triangle!   a Three of a Kind (at the end of the    Manamorphose    use five random Colour cards, one trigger each
 *               round)
 *   Marigold!   a card's enhancement changes (not to    Lotus Bloom     up to 1 selected card becomes Marigold; then every
 *               Marigold)                                               Marigold card in the deck / discard is drawn
 *
 * Their Spectral cards only appear (in_pool) while you hold their legendary; upstream draws them as placeholder sketches,
 * so their art here is composed (tools/micatro/stage_morefluff_batch_b_art.mjs, mf_rot_spectrals_b.png). The jokers and The
 * Soul! are turned 45 degrees upstream in the engine (mf_rotate_by): drawn from pre-turned sheets made by the same tool
 * (like the 1.5.6 pre-turned Cartomancer!). Steamodded's perma_x_chips / perma_x_blind_size on played cards and the
 * "adding to hand effects" step (lovely/adding_to_hand.toml) are the eval_card / add_to_scoring_hand / destroy_card hooks.
 */
import {
  G, P_CENTERS, P_CARDS, localize, emit, play_sound, juice_card, copy_card, pseudorandom_element, pseudoseed,
  create_playing_card, create_card, ease_dollars, card_eval_status_text, set_poll_allow_duplicates,
} from '../../js/engine/core.js';
import * as BN from '../../js/engine/bignum.js';
import { use_card, discard_cards_from_highlighted, get_poker_hand_info } from '../../js/engine/run.js';
import { joker, find, say, destroy_cards, add_card, DATA, RANKS, SUITS_T } from './util.js';
import { mod_blind_size } from './letters.js';

export const centers = [];
const ROT = ['canio', 'triboulet', 'yorick', 'chicot', 'perkeo', 'triangle', 'marigold'];
const SPEC = ['doomblade', 'reinforcements', 'windfall', 'negate', 'mirror', 'refraction', 'lotusbloom'];
const prepared_msg = (card) => {
  if (card.ability.extra.is_prepared) return undefined;
  card.ability.extra.is_prepared = true;
  return { message: localize('k_prepared_ex'), colour: 'SPECTRAL' };
};
const J = (slug, def) => {
  const i = ROT.indexOf(slug);
  const c = joker('rot_' + slug, def);
  c.atlas = 'mf_rot_jokers_b'; c.pos = { x: i, y: 0 }; c.soul_pos = { x: i, y: 1 }; c.display_size = { w: 112, h: 112 };
  delete c.mf_rotate_by;
  centers.push(c);
};
const eor_jokers = (ctx) => ctx.end_of_round && !ctx.individual && !ctx.repetition && (ctx.cardarea === undefined || ctx.cardarea === G.jokers);
/** A prepared Spectral: its data (config), in the pool only while its legendary is held, art on the composed sheet. */
const S = (key, owner, def) => {
  const s = DATA.consumables.find((c) => c.key === key);
  centers.push({
    key: 'c_mf_' + key, set: 'Spectral', name: s.name || key, consumeable: true, cost: s.cost ?? 4, atlas: 'mf_rot_spectrals_b',
    pos: { x: SPEC.indexOf(key), y: 0 }, config: JSON.parse(JSON.stringify(s.config || {})), no_collection: true,
    attributes: Array.isArray(s.attributes) ? s.attributes.slice() : undefined, unlocked: true, discovered: true,
    in_pool: () => find('j_mf_rot_' + owner).length > 0,
    ...def,
  });
};

// ------------------------------------------------------------------ Canio! / Doom Blade
J('canio', {
  calculate(s, card, ctx) {
    if (ctx.remove_playing_cards && !card.ability.extra.is_prepared && (ctx.removed || []).some((c) => !c.is_face())) return prepared_msg(card);
  },
});
S('doomblade', 'canio', {
  loc_vars: (s, iq, card) => { const e = (card && card.ability && card.ability.extra) || s.config.extra; return { vars: [e.can_destroy, e.xblindsize_given] }; },
  can_use(s, card) {
    const hl = G.hand ? G.hand.highlighted : [];
    return hl.length > 0 && hl.length <= card.ability.extra.can_destroy && hl.every((c) => c.is_face());
  },
  use(s, card) {
    const n = G.hand.highlighted.length;
    const doomed = G.hand.highlighted.slice();
    G.E_MANAGER.add_event(() => { play_sound('tarot1'); juice_card(card); });
    G.E_MANAGER.add_event(() => { destroy_cards(doomed); });
    G.E_MANAGER.add_event(() => {
      const g = card.ability.extra.xblindsize_given;
      for (const v of G.hand.cards) {
        if (v.is_face() || doomed.includes(v)) continue;
        let up = false;
        for (let i = 0; i < n; i++) {
          v.ability.perma_x_blind_size = v.ability.perma_x_blind_size || 0;
          if (v.ability.perma_x_blind_size > -1 + g) {
            v.ability.perma_x_blind_size -= g;
            up = true;
            if (v.ability.perma_x_blind_size <= -1 + g) v.ability.perma_x_blind_size = -1 + g;
          }
        }
        if (up) card_eval_status_text(v, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'PURPLE' });
      }
    });
  },
});

// ------------------------------------------------------------------ Triboulet! / Royal Decree
J('triboulet', {
  calculate(s, card, ctx) {
    if (ctx.pre_discard && get_poker_hand_info(ctx.full_hand).text === 'Pair') return prepared_msg(card);
  },
});
S('reinforcements', 'triboulet', {
  loc_vars: () => ({ vars: [(G.GAME && G.GAME.rot_trib_count) || 0] }),
  can_use: () => true,
  use() { G.GAME.rot_trib_count = (G.GAME.rot_trib_count || 0) + 1; play_sound('timpani', 0.6); },
});
/** lovely/adding_to_hand.toml: per Royal Decree use this round, a King and a Queen (random suits) join the scoring hand. */
function royal_decree_cards() {
  const out = [];
  for (let i = 0; i < (G.GAME.rot_trib_count || 0); i++) {
    for (const rank of ['K', 'Q']) {
      const [suit] = pseudorandom_element(SUITS_T, pseudoseed('sccsuit' + G.GAME.round_resets.ante));
      const c = create_playing_card({ front: P_CARDS[suit.card_key + '_' + rank], center: P_CENTERS.c_base }, G.discard, true);
      c.mf_royal_decreed = true;
      G.discard.remove_card(c);
      G.play.emplace(c);
      out.push(c);
    }
  }
  return out;
}

// ------------------------------------------------------------------ Yorick! / Windfall
J('yorick', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.discards, card.ability.extra.discards_remaining] }),
  calculate(s, card, ctx) {
    if (ctx.discard && !ctx.blueprint) {
      if (card.ability.extra.discards_remaining <= 1) {
        card.ability.extra.discards_remaining = card.ability.extra.discards;
        return prepared_msg(card) || { message: localize('k_reset'), colour: 'RED' };
      }
      card.ability.extra.discards_remaining -= 1;
    }
  },
});
S('windfall', 'yorick', {
  loc_vars: (s, iq, card) => ({ vars: [((card && card.ability && card.ability.extra) || s.config.extra).xchips_given] }),
  can_use: () => !!(G.hand && G.hand.cards.length > 0),
  use(s, card) {
    for (const v of G.hand.cards) {
      v.ability.perma_x_chips = (v.ability.perma_x_chips || 0) + card.ability.extra.xchips_given;
      if (!G.hand.highlighted.includes(v)) G.hand.highlighted.push(v);
      v.highlighted = true;
      card_eval_status_text(v, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
    }
    discard_cards_from_highlighted(true);
  },
});

// ------------------------------------------------------------------ Chicot! / Negate
J('chicot', { calculate(s, card, ctx) { if (ctx.skip_blind && !ctx.blueprint) return prepared_msg(card); } });
S('negate', 'chicot', {
  can_use: () => !!(G.GAME.blind && (G.GAME.blind.in_blind ?? G.GAME.facing_blind)), // (G.GAME.blind.in_blind)
  use(s, card) {
    G.E_MANAGER.add_event(() => {
      G.E_MANAGER.add_event(() => {
        G.GAME.blind.disable();
        G.GAME.blind.chips = BN.pow(G.GAME.blind.chips, 0.8);
        G.GAME.blind.chip_text = String(G.GAME.blind.chips);
        emit('blind', { action: 'chips', chips: G.GAME.blind.chips });
        play_sound('timpani');
      });
      say(card, localize('ph_boss_disabled'));
    });
  },
});

// ------------------------------------------------------------------ Perkeo! / Mirrorform
const SUITS = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
const has_any_suit = (c) => c.ability.name === 'Wild Card' || c.config.center.any_suit;
J('perkeo', {
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.before) {
      const got = {};
      for (const c of ctx.scoring_hand) if (!has_any_suit(c)) for (const su of SUITS) if (c.is_suit(su, true) && !got[su]) { got[su] = true; break; }
      for (const c of ctx.scoring_hand) if (has_any_suit(c)) for (const su of SUITS) if (c.is_suit(su) && !got[su]) { got[su] = true; break; }
      if (Object.keys(got).length >= 4 && !card.ability.extra.should_prep) { card.ability.extra.should_prep = true; return { message: localize('k_ready_ex') }; }
    }
    if (eor_jokers(ctx) && card.ability.extra.should_prep) {
      card.ability.extra.should_prep = false;
      return prepared_msg(card) || { message: localize('k_reset'), colour: 'RED' };
    }
  },
});
S('mirror', 'perkeo', {
  can_use: () => G.consumeables.cards.length > 0,
  use() {
    if (!G.consumeables.cards[0]) return;
    for (let i = 0; i < 2; i++) {
      G.E_MANAGER.add_event(() => {
        const [orig] = pseudorandom_element(G.consumeables.cards, pseudoseed('vremade_perkeo'));
        if (!orig) return;
        const c = copy_card(orig);
        c.set_edition({ negative: true }, true);
        c.add_to_deck();
        G.consumeables.emplace(c);
      });
    }
  },
});

// ------------------------------------------------------------------ Triangle! / Manamorphose
J('triangle', {
  calculate(s, card, ctx) {
    if (ctx.before && ctx.scoring_name === 'Three of a Kind' && !ctx.blueprint && !card.ability.extra.should_prep) { card.ability.extra.should_prep = true; return { message: localize('k_ready_ex') }; }
    if (eor_jokers(ctx) && card.ability.extra.should_prep) {
      card.ability.extra.should_prep = false;
      return prepared_msg(card) || { message: localize('k_reset'), colour: 'RED' };
    }
  },
});
S('refraction', 'triangle', {
  can_use: () => true,
  use() {
    // (the Lua's event nesting: two levels down, so each Colour is used after the Spectral's own use has finished)
    const one = (left) => {
      G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(() => {
        let c;
        G.E_MANAGER.add_event(() => {
          set_poll_allow_duplicates(true);
          try { c = create_card('Colour', G.play, null, null, null, null, null, undefined); } finally { set_poll_allow_duplicates(false); }
          c.add_to_deck();
          G.play.emplace(c);
          c.ability.val = 1;
        });
        G.E_MANAGER.add_event(() => {
          if (c.config.center.key === 'c_mf_yellow') ease_dollars(c.ability.value_per);
          use_card(c);
        });
        if (left > 1) one(left - 1);
      }));
    };
    one(5);
  },
});

// ------------------------------------------------------------------ Marigold! / Lotus Bloom
J('marigold', {
  loc_vars(s, iq) { iq.push(P_CENTERS.m_mf_marigold); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.setting_ability && ctx.old !== 'm_mf_marigold' && ctx.other_card.ability.set === 'Enhanced') return prepared_msg(card);
  },
});
S('lotusbloom', 'marigold', {
  loc_vars(s, iq, card) {
    iq.push(P_CENTERS.m_mf_marigold);
    return { vars: [(card && card.ability && card.ability.max_highlighted) || s.config.max_highlighted, localize({ type: 'name_text', set: 'Enhanced', key: 'm_mf_marigold' })] };
  },
  can_use: () => !!(G.hand && G.hand.highlighted.length <= 1),
  use(s, card) {
    G.E_MANAGER.add_event(() => { play_sound('tarot1'); juice_card(card); });
    const hl = G.hand.highlighted.slice();
    for (const c of hl) G.E_MANAGER.add_event(() => { c.set_ability(P_CENTERS.m_mf_marigold); juice_card(c); });
    G.E_MANAGER.add_event(() => G.hand.unhighlight_all());
    G.E_MANAGER.add_event(() => {
      const cards = [...G.deck.cards, ...G.discard.cards].filter((c) => c.config.center.key === 'm_mf_marigold');
      for (const c of cards) { c.area.remove_card(c); G.hand.emplace(c); }
    });
  },
});

// ------------------------------------------------------------------ The Soul!
centers.push({
  key: 'c_mf_rot_soul', set: 'Spectral', name: 'rot_The Soul', consumeable: true, cost: 4, hidden: true, soul_set: 'Rotarot',
  atlas: 'mf_rot_soul_b', pos: { x: 0, y: 0 }, soul_pos: { x: 1, y: 0 }, display_size: { w: 112, h: 112 }, config: {},
  attributes: ['generation', 'joker'], unlocked: true, discovered: true,
  can_use: () => !!(G.jokers && G.jokers.cards.length < G.jokers.config.card_limit),
  use(s, card) {
    G.E_MANAGER.add_event(() => {
      play_sound('timpani');
      add_card({ set: 'Joker', rarity: 'mf_rot_legendary' });
      juice_card(card);
    });
  },
});

export const hooks = {
  /** Royal Decree's King + Queen join the scoring hand (lovely/adding_to_hand.toml). */
  add_to_scoring_hand() { return G.GAME.rot_trib_count ? royal_decree_cards() : undefined; },
  /** FLUFF.calculate destroy_card: a Royal Decree card is destroyed after its hand. */
  destroy_card(card) { return card.mf_royal_decreed ? true : undefined; },
  /** A played card's main scoring: FLUFF.calculate's X3 for a Royal Decree card; Steamodded's perma_x_chips (Windfall)
   *  and perma_x_blind_size (Doom Blade: the Blind's size X(1 + it)). */
  eval_card(card, context, ret) {
    if (context.cardarea !== G.play || card.debuff) return;
    if (card.mf_royal_decreed) ret.x_mult = (ret.x_mult || 1) * 3;
    if (card.ability.perma_x_chips) ret.x_chips = (ret.x_chips || 1) * (1 + card.ability.perma_x_chips);
    if (card.ability.perma_x_blind_size) mod_blind_size(1 + card.ability.perma_x_blind_size, card);
  },
  /** FLUFF.calculate end_of_round: Royal Decree wears off. */
  end_round() { G.GAME.rot_trib_count = undefined; },
};
export { RANKS };
