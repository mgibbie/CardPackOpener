// Nacho's Pokermon Dip 1.7.9 — the Toxic-Stall cross-mod lines: src/pokemon/0903_sneasler.lua (Hisuian Sneasel, Sneasler;
// 1.6.4's 0215_1_hisuian_sneasel.lua), 1014-1016_loyal_three.lua (Okidogi, Munkidori, Fezandipiti; new in 1.7.9) and
// 1025_pecharunt.lua (Pecharunt; new in 1.7.9).
//
// NOT AVAILABLE in Micatro (decision, 2026-10-15, kept for 1.7.9): each file is `misc_config = "ToxicStall"` and its config
// default is `SMODS.Mods["ToxicStall"].can_load and ...` — the lines only exist with the separate Toxic-Stall mod, and their
// whole effect is Toxic-Stall's (the `m_stall_toxic` enhancement, toxic_scaling, G.GAME.current_round.toxic, Malignant /
// Toxic Chain). Toxic-Stall isn't part of the Micatro rebuild, so the Loyal Three and Pecharunt are registered as data only
// (collection / wiki know them, their 3.9.1 sprites; family added like the Lua does) and are never in a pool — index.js marks
// them `nacho_unavailable` (no option enables them).
//
// HISUIAN SNEASEL -> SNEASLER are OBTAINABLE from Nacho rev 3 (the owner's regional batch C, 2026-11-03: "make Hisuian Sneasel /
// Sneasler obtainable" with NEW effects, Micatro's own — no Toxic): keys, rarity / cost (Uncommon $6 -> Safari $10), type (Fighting)
// and the Dawn Stone evolution are Nacho's data, unchanged, so saves and the collection keep them.
//   Hisuian Sneasel: +4 Mult per discard used this round (`mult` +40%: 5.6 / 7.2 / 8.8).
//   Sneasler, Unburden: X3 once ALL your discards this round are used (none left, and at least one used: a round with no discards to
//     use never counts; `Xmult` +20%: 3.6 / 4.2 / 4.8).
// Gated by Nacho's rulesRev (SNEASEL_REV): a move recorded before it (a resumed / replayed run, js/mods/pins.js RULES) sees them as
// before — out of every pool and without an effect — so it re-plays exactly. Live play is always on the new rules.
import { G, defineNacho, type_tooltip, item_evo, localize, P_CENTERS, detailed } from '../api.js';
import { rulesRev } from '../../../js/mods/pins.js';

export const UNAVAILABLE = {
  files: ['src/pokemon/1014-1016_loyal_three.lua', 'src/pokemon/1025_pecharunt.lua'],
  names: ['okidogi', 'munkidori', 'fezandipiti', 'pecharunt'],
  needs: 'ToxicStall',
};
/** Nacho's rules rev from which Hisuian Sneasel / Sneasler are obtainable and have their effects. */
export const SNEASEL_REV = 3;
export const sneasel_on = () => rulesRev('nacho') >= SNEASEL_REV;
/** The two Lua names this file ports (the rest of the Toxic-Stall files stay data only). */
export const SNEASEL_NAMES = ['hisuian_sneasel', 'sneasler'];

const FILE = 'src/pokemon/0903_sneasler.lua';
const r3 = (x) => Math.round(x * 1000) / 1000;
const cr = () => (G.GAME && G.GAME.current_round) || {};
const discards_used = () => cr().discards_used || 0;
/** Sneasler, Unburden: every discard this round used (none left) and at least one of them used. */
export const unburdened = () => !!(G.GAME && G.GAME.facing_blind && (cr().discards_left || 0) <= 0 && discards_used() > 0);

defineNacho({
  // Hisuian Sneasel 215-1 (Fighting; Uncommon $6): +4 Mult per discard used this round. Evolves with a Dawn Stone.
  hisuian_sneasel: {
    config: { extra: { mult: 4 } }, attributes: ['mult', 'discard', 'item_evo'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed() && P_CENTERS.c_poke_dawnstone) info_queue.push(P_CENTERS.c_poke_dawnstone);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult), r3(ex.mult * discards_used())] };
    },
    calculate(self, card, context) {
      if (!sneasel_on()) return undefined;
      if (context.joker_main) {
        const m = r3(card.ability.extra.mult * discards_used());
        if (m > 0) return { message: localize({ type: 'variable', key: 'a_mult', vars: [m] }), colour: 'MULT', mult_mod: m };
      }
      return item_evo(self, card, context, 'j_nacho_sneasler');
    },
  },
  // Sneasler 903 (Fighting; Safari $10), Unburden: X3 once all your discards this round are used.
  sneasler: {
    config: { extra: { Xmult: 3 } }, attributes: ['xmult', 'discard'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [r3(card.ability.extra.Xmult), unburdened() ? 'Active!' : 'Inactive'] };
    },
    calculate(self, card, context) {
      if (!sneasel_on()) return undefined;
      if (context.joker_main && unburdened()) {
        const x = card.ability.extra.Xmult;
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [r3(x)] }), colour: 'XMULT', Xmult_mod: x };
      }
      return undefined;
    },
  },
}, FILE);

/** Their text (index.js puts it over 1.7.9's Toxic one). */
export const SNEASEL_LOC = {
  j_nacho_hisuian_sneasel: { name: '{s:0.6}Hisuian{}Sneasel', text: [
    '{C:mult}+#1#{} Mult for each', 'discard used this round', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)',
    '{C:inactive,s:0.8}(Evolves with a {C:attention,s:0.8}Dawn Stone{C:inactive,s:0.8})'] },
  j_nacho_sneasler: { name: 'Sneasler', text: [
    '{C:attention}Unburden:{} {X:mult,C:white} X#1# {} Mult', 'once all your discards', 'this round are used', '{C:inactive}(#2#)'] },
};
