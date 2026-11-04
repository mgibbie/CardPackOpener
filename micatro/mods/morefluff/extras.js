// More Fluff 1.9.9999 — the rest of the mod this batch carries:
//   2 Modded packs (src/jokers/repack.lua: non-vanilla jokers only — in Micatro, jokers from any ACTIVE mod).
//     1.9.9999 takes them out of the shop (weight 0; the Repack joker stocks them) and drops the Jumbo / Mega ones
//     and the Modded Tag; they stay registered so a Repack batch only adds the joker.
//   Decks (src/decks.lua): Philosophical, Rainbow and (new) Purple — Purple's Wheel is exile.js. Its Spellchaser's
//     Deck has placeholder art upstream ("Lutri Placeholder", mf_enhancers 4,2) and its Old Deck needs the whole
//     Old Fluff + Letter pools: both come later. The Gros Michel / Blasphemous decks and the 4 sleeves are gone.
//   "Temporary" cards (ability.mf_temporary: gone at the end of the round — the end_round wrap pulled from Entropy),
//   and the music (SMODS.Sound select_music_track -> the run view's `music`).
// The Clutch Tag is gone upstream (a retired key: js/mods/aliases.js).
import { G, P_CENTERS, create_card } from '../../js/engine/core.js';
import { STATES } from '../../js/engine/run.js';
import { DATA, modded_begin, modded_end, modded_pool_filter } from './util.js';

// ------------------------------------------------------------------ Modded packs
const PACK = (key) => {
  const s = DATA.boosters.find((b) => b.key === key);
  return {
    key: 'p_mf_' + key, set: 'Booster', name: s.key, kind: 'Modded', cost: s.cost, weight: s.weight, pos: s.pos, atlas: 'mf_packs',
    config: JSON.parse(JSON.stringify(s.config)), draw_hand: !!s.draw_hand, group_key: 'k_modded_pack',
    loc_vars: (self, iq, card) => ({ vars: [self.config.choose, (card && card.ability && card.ability.extra) ?? self.config.extra] }),
    // FIX (intended design, kept from 1.5.6): every base-game joker is left out (the 1.5.6 Lua's hard-coded vanilla
    // lists missed j_jolly; 1.9.9999's filter is center.original_mod, the same as this).
    create_card() {
      modded_begin();
      try { return create_card('Joker', G.pack_cards, null, null, true, true, null, 'mf_modded'); } finally { modded_end(); }
    },
  };
};
export const centers = ['modded_normal_1', 'modded_normal_2'].map(PACK);
export const tags = [];

// ------------------------------------------------------------------ decks
const back = (key) => {
  const s = DATA.backs.find((b) => b.key === key);
  return { key: 'b_mf_' + key, set: 'Back', name: s.name || 'b_mf_' + key, config: JSON.parse(JSON.stringify(s.config || {})), pos: s.pos, atlas: 'mf_enhancers', unlocked: true };
};
const spawn = (key, n = 1) => G.E_MANAGER.add_event(() => {
  for (let i = 0; i < n; i++) {
    const card = create_card('Joker', G.jokers, null, null, null, null, key, null);
    card.add_to_deck();
    G.jokers.emplace(card);
  }
});
centers.push(
  // (SMODS.Back config.jokers: 5 Philosophical Jokers)
  { ...back('philosophical'), name: 'Philosophical Deck', config: {}, apply: () => spawn('j_mf_philosophical', 5) },
  back('rainbow'), // (config: Paint Roller + a White Colour card)
  back('purple'), // (the Wheel each blind: exile.js)
);

// ------------------------------------------------------------------ music
/** SMODS.Sound select_music_track: the highest-priority track that wants to play (true counts as 0). */
function music() {
  if (G.GAME.mf_superboss_active) return 'mf_music_duelzone'; // 6
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
  view(view) { const m = music(); if (m) view.music = m; },
};
