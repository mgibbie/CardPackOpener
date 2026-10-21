// Nacho's Pokermon Dip 1.7.9 — the Toxic-Stall cross-mod lines: src/pokemon/0903_sneasler.lua (Hisuian Sneasel, Sneasler;
// 1.6.4's 0215_1_hisuian_sneasel.lua), 1014-1016_loyal_three.lua (Okidogi, Munkidori, Fezandipiti; new in 1.7.9) and
// 1025_pecharunt.lua (Pecharunt; new in 1.7.9).
//
// NOT AVAILABLE in Micatro (decision, 2026-10-15, kept for 1.7.9): each file is `misc_config = "ToxicStall"` and its config
// default is `SMODS.Mods["ToxicStall"].can_load and ...` — the lines only exist with the separate Toxic-Stall mod, and their
// whole effect is Toxic-Stall's (the `m_stall_toxic` enhancement, toxic_scaling, G.GAME.current_round.toxic, Malignant /
// Toxic Chain). Toxic-Stall isn't part of the Micatro rebuild, so the six jokers are registered as data only (collection /
// wiki know them, their 3.9.1 sprites; family added like the Lua does) and are never in a pool — index.js marks them
// `nacho_unavailable` (no option enables them).
export const UNAVAILABLE = {
  files: ['src/pokemon/0903_sneasler.lua', 'src/pokemon/1014-1016_loyal_three.lua', 'src/pokemon/1025_pecharunt.lua'],
  names: ['hisuian_sneasel', 'sneasler', 'okidogi', 'munkidori', 'fezandipiti', 'pecharunt'],
  needs: 'ToxicStall',
};
