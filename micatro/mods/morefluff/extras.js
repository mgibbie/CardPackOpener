// More Fluff — the rest of MoreFluff.lua / other/moddedpack.lua:
//   4 Modded packs (non-vanilla jokers only: in Micatro, jokers from any ACTIVE mod) + the Modded Tag,
//   the Clutch Tag (X4 Mult for the next blind; lovely/clutch_tag.toml), 4 decks, "temporary" cards
//   (ability.mf_temporary: gone at the end of the round — the end_round wrap pulled from Entropy),
//   and the music tracks (SMODS.Sound select_music_track -> the run view's `music`).
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { G, P_CENTERS, create_card, card_eval_status_text, emit } from '../../js/engine/core.js';
import { STATES } from '../../js/engine/run.js';
import { DATA, modded_begin, modded_end, modded_pool_filter } from './util.js';
import { open_free_pack } from './rotarots.js';

// ------------------------------------------------------------------ Modded packs + tag
const PACK = (key) => {
  const s = DATA.boosters.find((b) => b.key === key);
  return {
    key: 'p_mf_' + key, set: 'Booster', name: s.key, kind: 'Modded', cost: s.cost, weight: s.weight, pos: s.pos, atlas: 'mf_packs',
    config: JSON.parse(JSON.stringify(s.config)),
    loc_vars: (self, iq, card) => ({ vars: [self.config.choose, (card && card.ability && card.ability.extra) ?? self.config.extra] }),
    // FIX (intended design): the Lua temp-banned a hard-coded list of vanilla jokers, and three of the four
    // packs' lists (and Expansion Pack's / the 45° Judgement's) left out j_jolly, so Jolly Joker — a vanilla
    // joker — could be offered in a "Modded" pack. Every base-game joker is left out here.
    create_card() {
      modded_begin();
      try { return create_card('Joker', G.pack_cards, null, null, true, true, null, 'mf_modded'); } finally { modded_end(); }
    },
  };
};
export const centers = ['modded_normal_1', 'modded_normal_2', 'modded_jumbo_1', 'modded_mega_1'].map(PACK);

const clutch_on = () => G.GAME.tags.filter((t) => t.key === 'tag_mf_clutch' && !t.triggered);
export const tags = [
  {
    key: 'tag_mf_moddedpack', name: 'tag_mf_moddedpack', set: 'Tag', atlas: 'mf_tags', pos: { x: 0, y: 1 }, config: {},
    loc_vars: () => ({ vars: [] }),
    apply(self, tag, context) {
      if (context.type === 'new_blind_choice') {
        tag.yep('+', 'DARK_EDITION', () => { open_free_pack('p_mf_modded_jumbo_1'); return true; });
        tag.triggered = true;
        return true;
      }
    },
  },
  {
    key: 'tag_mf_clutch', name: 'tag_mf_clutch', set: 'Tag', atlas: 'mf_tags', pos: { x: 1, y: 1 }, config: { extra: 4 },
    loc_vars: (self) => ({ vars: [self.config.extra] }),
    apply(self, tag, context) {
      // (final_scoring_step: the modify_scoring hook below applies the X4)
      if (context.type === 'eval') { tag.yep('X', 'RED', () => true); tag.triggered = true; }
    },
  },
];

// ------------------------------------------------------------------ decks
const deck = (key, name, x, config, apply) => ({
  key: 'b_mf_' + key, set: 'Back', name, config, pos: { x, y: 0 }, atlas: 'mf_enhancers', unlocked: true, apply,
});
const spawn = (key, n = 1, after) => G.E_MANAGER.add_event(() => {
  for (let i = 0; i < n; i++) {
    const card = create_card('Joker', G.jokers, null, null, null, null, key, null);
    card.add_to_deck();
    if (after) after(card);
    G.jokers.emplace(card);
  }
});
centers.push(
  deck('grosmichel', 'Gros Michel Deck', 0, { mf_grosmichel: true }, () => spawn('j_gros_michel')),
  deck('philosophical', 'Philosophical Deck', 1, { mf_philosophical: true }, () => spawn('j_mf_philosophical', 5)),
  deck('rainbow', 'Rainbow Deck', 2, { voucher: 'v_mf_paintroller', consumables: ['c_mf_white'] }),
  deck('blasphemy', 'Blasphemous Deck', 3, { mf_blasphemy: true }, () => spawn('j_mf_blasphemy', 1, (c) => { c.set_edition({ negative: true }); c.set_eternal(true); })),
);

// ------------------------------------------------------------------ music
/** SMODS.Sound select_music_track: the highest-priority track that wants to play (true counts as 0). */
function music() {
  if (G.GAME.superboss_active) return 'mf_music_duelzone'; // 6
  const inPack = [STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.SPECTRAL_PACK, STATES.STANDARD_PACK, STATES.BUFFOON_PACK, STATES.MOD_PACK, STATES.MOD_PACK_HAND].includes(G.STATE);
  if (inPack && G.GAME.pack_center && P_CENTERS[G.GAME.pack_center] && P_CENTERS[G.GAME.pack_center].config.modded_pack) return 'mf_music_modded'; // 2
  const first = G.pack_cards && G.pack_cards.cards[0];
  if (first && first.ability.set === 'Colour') return 'mf_music_colourpack';
  if (first && first.ability.set === 'Rotarot') return 'mf_music_rotarot';
  return undefined;
}

export const hooks = {
  /** Modded packs / Expansion Pack / 45° Judgement: base-game jokers are out while a roll is "modded". */
  pool_filter: modded_pool_filter,
  /** The Lua end_round wrap (from Entropy): temporary cards dissolve as the round ends. */
  end_round_start() {
    const removed = [];
    for (const area of [G.jokers, G.hand, G.consumeables, G.discard, G.deck]) {
      for (const card of area.cards.slice()) {
        if (!card.ability || !card.ability.mf_temporary) continue;
        card.remove_from_deck();
        card.start_dissolve();
        removed.push(card);
      }
    }
    if (removed.length) for (const j of G.jokers.cards.slice()) j.calculate_joker({ remove_playing_cards: true, removed });
  },
  /** Clutch Tag (lovely/clutch_tag.toml): every untriggered Clutch Tag gives X4 Mult at final_scoring_step. */
  modify_scoring([chips, mult], step) {
    if (step !== 'final_scoring_step') return undefined;
    for (const t of clutch_on()) {
      mult = BN.mul(mult, P_CENTERS_TAG_EXTRA(t));
      emit('tag_yep', { tag: t.key, id: t.ID, message: 'X' + P_CENTERS_TAG_EXTRA(t) + ' Mult', colour: 'RED' });
      card_eval_status_text(null, 'extra', null, null, null, { message: 'X' + P_CENTERS_TAG_EXTRA(t) + ' Mult', colour: 'RED' });
      emit('hand_text', { chips, mult });
    }
    return [chips, mult];
  },
  view(view) { const m = music(); if (m) view.music = m; },
};
const P_CENTERS_TAG_EXTRA = (t) => (t.config && t.config.extra) || 4;
