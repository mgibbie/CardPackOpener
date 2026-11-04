// Pokermon 3.9.1 — stakes/stakes.lua (batch 17): the Elite stake, and pokermon.lua's SMODS.is_showdown_ante override.
//   Elite Stake: applies every stake up to Gold (a mod stake above Gold: the engine plays it at Gold's level 8 plus its own
//   modifiers, js/engine/run.js mod_stake_chain), +2 win ante, and G.GAME.modifiers.poke_elite4: the last 4 antes before the
//   (raised) win ante draw Showdown Boss Blinds. Art: elite_stake.png (chip) / elite_stake_sticker.png (3.9.1, vendored in batch 5).
//   Win stickers: `sticker_level: 9` — a win on it records the ELITE sticker (level 9; 3.9.1 draws its own Elite sticker, art
//   elite_stake_sticker.png -> micatro/assets/textures/winstickers/elite.png), not Gold: js/engine/run.js win_sticker_level,
//   js/ui/stickers.js, server/mp.mjs stickerLevel 1..9 (PORTING.md "Batch 17"). Nacho 1.7.9 (batch 18) re-keyed its own
//   Elite stake to this one: stake_nacho_elite_stake is a `renamed` alias (Nacho's registerMod aliases), so old recipes play it.
import { G } from '../../js/engine/core.js';

export const ELITE_STAKE = {
  key: 'stake_poke_elite',
  name: 'Elite Stake',
  applied_stakes: ['gold'],
  above_stake: 'gold',
  modifiers() {
    G.GAME.win_ante = G.GAME.win_ante + 2;
    G.GAME.modifiers.poke_elite4 = true;
  },
  pos: { x: 0, y: 0 },
  sticker_pos: { x: 0, y: 0 },
  atlas: 'poke_elite_stake',
  sticker_atlas: 'poke_elite_stake_sticker',
  colour: '#ba8514',
  shiny: true,
  sticker_level: 9,   // the Elite win sticker (run.js win_sticker_level)
  poke_file: 'stakes/stakes.lua',
};

/**
 * pokermon.lua's SMODS.is_showdown_ante: with poke_elite4, every ante > 0 whose `ante % win_ante >= win_ante - 3` is a showdown
 * ante too (win ante 10: antes 7, 8, 9 and 10; then 17-20, ...). A showdown ante draws only showdown bosses, every other ante
 * only the others (a boss's `min` still applies), as Steamodded's create_blind_pool. The boss_eligible hook (core.js
 * get_new_boss / smods.js boss_eligible_map); undefined = the base rule (no Elite stake).
 */
export function elite_boss_eligible(ok, v, ante) {
  if (!G.GAME || !G.GAME.modifiers || !G.GAME.modifiers.poke_elite4) return undefined;
  const w = G.GAME.win_ante;
  const showdown = ante > 0 && (ante % w >= w - 3 || ante % w === 0);
  if (v.boss.showdown) return showdown && ante >= 2;
  return !showdown && v.boss.min <= Math.max(1, ante);
}
