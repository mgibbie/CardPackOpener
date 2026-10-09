// awakening_sync.js — the decomp state the Hoenn awakening's resolution leaves behind.
//
// The port plays the Kyogre / Groudon / Rayquaza crisis through its own director
// (ow_legendaries.js AWAKENING_SCENES, VAR_HOENN_AWAKENING 0 -> 6) and keeps the
// decomp's scene vars dormant so their camera / weather scenes never fire. But the
// rest of Sootopolis reads those vars: pokeemerald's SkyPillar_Top_EventScript_
// AwakenRayquaza ends `setvar VAR_SOOTOPOLIS_CITY_STATE, 5` and the Sootopolis
// Rayquaza scene `setvar VAR_SKY_PILLAR_STATE, 3` + clears the two weather flags.
// State 5 is what puts Wallace, Archie and Maxie outside the gym with their
// after-Rayquaza lines; talking to Archie and Maxie sets
// FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE, which is what stops ON_LOAD locking the gym
// door; Wallace then hands over HM WATERFALL. Left at 4, the gym stayed sealed and
// Wallace kept sending you to the SKY PILLAR (playtest 2026-10-08, the eighth-badge
// blocker). So once the director resolves (6), bring the decomp vars to where the
// real scenes leave them. VAR_SKY_PILLAR_STATE goes to 3 (not 1, which would replay
// the decomp's Rayquaza scene in Sootopolis). Upward-only and idempotent: run on
// every map setup, so a save already past the resolution heals on its next map load.
import * as Story from './events.js';

const AW = 'VAR_HOENN_AWAKENING', CITY = 'VAR_SOOTOPOLIS_CITY_STATE', PILLAR = 'VAR_SKY_PILLAR_STATE';
export function reconcileAwakeningResolution() {
	if ((Story.getVar(AW) || 0) < 6) return false;
	let changed = false;
	const city = Story.getVar(CITY) || 0;
	if (city < 4) Story.clearFlag('FLAG_HIDE_SOOTOPOLIS_CITY_WALLACE');   // SkyPillar_Outside's Wallace scene
	if (city < 5) { Story.setVar(CITY, 5); changed = true; }
	if ((Story.getVar(PILLAR) || 0) < 2) { Story.setVar(PILLAR, 3); changed = true; }
	if (!Story.getVar('VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE')) Story.setVar('VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE', 1);
	if (Story.getFlag('FLAG_SYS_WEATHER_CTRL')) Story.clearFlag('FLAG_SYS_WEATHER_CTRL');
	if (Story.getFlag('FLAG_LEGENDARIES_IN_SOOTOPOLIS')) Story.clearFlag('FLAG_LEGENDARIES_IN_SOOTOPOLIS');
	return changed;
}
