// MoreFluff 1.5.6 — its challenge (other/superboss.lua): "Better Balatro II" (Superboss always on,
// scaling 4 + bonus 4, $14, a Judgement). Played by engine/challenge.js.
// The custom rule mf_superboss_active is a lovely patch on Game:start_run's challenge loop
// (lovely/superboss.toml): it turns Superboss on from the start, so the first ante's choices are
// already the Superboss ones (superboss.js new_boss_choice) and winning needs the DX boss.
import { CHALLENGES as DATA } from './superboss.js';
import { MOD_LOC } from '../../js/mods/registry.js';

// localization/en-us.lua misc.v_text (the rule's line on the Challenges screen)
MOD_LOC.misc.v_text = Object.assign(MOD_LOC.misc.v_text || {}, { ch_c_mf_superboss_active: ['Superboss is always active'] });

export const CHALLENGES = (DATA || []).map((c) => ({
  ...c,
  button_colour: '#4CA893',
  apply(GAME, ch) { if (ch.rules.custom.some((v) => v && v.id === 'mf_superboss_active')) GAME.superboss_active = true; },
}));
