// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0215_1_hisuian_sneasel.lua: Hisuian Sneasel, Sneasler.
//
// NOT AVAILABLE in Micatro (decision, 2026-10-15): the Lua line only loads when the separate
// ToxicStall mod is present (`enabled = SMODS.Mods["ToxicStall"].can_load and ...`), and its whole
// effect is ToxicStall's: it converts cards to ToxicStall's `m_stall_toxic` enhancement and drives
// ToxicStall's globals (toxic_scaling, foongus_xmult, G.GAME.current_round.toxic). None of that
// exists without ToxicStall, which isn't part of the Micatro rebuild, so the two jokers are
// registered as data only (collection / wiki know them; family added like the Lua does) and are
// never in a pool — index.js marks them `nacho_unavailable` (no option enables them).
export const UNAVAILABLE = { file: 'src/pokemon/0215_1_hisuian_sneasel.lua', names: ['hisuian_sneasel', 'sneasler'], needs: 'ToxicStall' };
