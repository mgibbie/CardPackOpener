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

//
// The SLEEPING RAYQUAZA at Sky Pillar Top (14,7) goes too. pokeemerald's
// SkyPillar_Top_EventScript_AwakenRayquaza ends `removeobject LOCALID_RAYQUAZA_SLEEPING`
// (which sets FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA); later the still RAYQUAZA you
// battle appears at (14,6) — the native encounter here. The director's summit beat
// (4 -> 5) is that fly-off, but nothing hid the object, and (14,7) is the only way
// to (14,6): RAYQUAZA could never be reached (bug:1792549657877). From 5 on it is gone.
export const RAYQUAZA_SLEEPING_HIDE = 'FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA';
export const RAYQUAZA_CRY_DONE = 'VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE';
const AW = 'VAR_HOENN_AWAKENING', CITY = 'VAR_SOOTOPOLIS_CITY_STATE', PILLAR = 'VAR_SKY_PILLAR_STATE';
// The Sootopolis Rayquaza scene's `removeobject`s: KYOGRE and GROUDON leave the city.
const SOOTOPOLIS_TRIO_HIDE = ['FLAG_HIDE_SOOTOPOLIS_CITY_KYOGRE', 'FLAG_HIDE_SOOTOPOLIS_CITY_GROUDON'];

// The NATIVE chain is the one in play once Wallace has sent you up the SKY PILLAR
// (CaveOfOrigin_B1F sets the city to 3, SkyPillar_Outside to 4): Steven and Wallace
// stand in Sootopolis on every save, so the decomp's own scenes run whether or not
// the port's director started. From there the director stands down, or the two
// would each wake RAYQUAZA and each play the calming (bug:1794338908364).
export function nativeAwakeningEngaged() {
	return (Story.getVar(CITY) || 0) >= 3 && (Story.getVar(AW) || 0) < 6;
}

// The summit's phases, as pokeemerald's SkyPillar_Top runs them:
//   city 4, pillar 0  the SLEEPING RAYQUAZA (14,7); the cry scene at (14,9) wakes it
//                     (coord trigger, VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE == 0)
//   pillar 1          it has flown to Sootopolis: no RAYQUAZA at the summit
//   pillar >= 2       Sootopolis is calm; the still RAYQUAZA waits at (14,6) — this
//                     port's catch (ow_legendaries.js, `requires` the same)
// The port's seed rests the cry var at 1 (from when nothing could wake it), so the
// cry scene never ran and a native save sat at city 4 for good: the sleeping
// RAYQUAZA stayed, the catch stood beside it, and Sootopolis never calmed — the gym
// door stays locked (bug:1794338908364). At the cry scene's step, arm it. If
// RAYQUAZA has already left the summit (the director's fly-off, or a catch made
// while the two overlapped), the wake-up happened: leave what the scene leaves.
export function reconcileSkyPillarAwakening() {
	let changed = false;
	if ((Story.getVar(CITY) || 0) === 4 && (Story.getVar(PILLAR) || 0) < 1) {
		if (Story.getFlag(RAYQUAZA_SLEEPING_HIDE)) {
			Story.setVar(CITY, 5); Story.setVar(PILLAR, 1); Story.setVar(RAYQUAZA_CRY_DONE, 1);
			changed = true;
		} else if (Story.getVar(RAYQUAZA_CRY_DONE) !== 0) {
			Story.setVar(RAYQUAZA_CRY_DONE, 0);
			changed = true;
		}
	}
	// the calming happened (the native scene, or the director's resolution below):
	// KYOGRE and GROUDON are gone from the city, and the director has nothing left
	if ((Story.getVar(PILLAR) || 0) >= 2) {
		for (const f of SOOTOPOLIS_TRIO_HIDE) if (!Story.getFlag(f)) { Story.setFlag(f); changed = true; }
		if ((Story.getVar(AW) || 0) < 6) { Story.setVar(AW, 6); changed = true; }
	}
	return changed;
}

export function reconcileAwakeningResolution() {
	if ((Story.getVar(AW) || 0) >= 5 && !Story.getFlag(RAYQUAZA_SLEEPING_HIDE)) Story.setFlag(RAYQUAZA_SLEEPING_HIDE);
	reconcileSkyPillarAwakening();
	if ((Story.getVar(AW) || 0) < 6) return false;
	let changed = false;
	const city = Story.getVar(CITY) || 0;
	if (city < 4) Story.clearFlag('FLAG_HIDE_SOOTOPOLIS_CITY_WALLACE');   // SkyPillar_Outside's Wallace scene
	if (city < 5) { Story.setVar(CITY, 5); changed = true; }
	if ((Story.getVar(PILLAR) || 0) < 2) { Story.setVar(PILLAR, 3); changed = true; }
	if (!Story.getVar('VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE')) Story.setVar('VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE', 1);
	if (Story.getFlag('FLAG_SYS_WEATHER_CTRL')) Story.clearFlag('FLAG_SYS_WEATHER_CTRL');
	if (Story.getFlag('FLAG_LEGENDARIES_IN_SOOTOPOLIS')) Story.clearFlag('FLAG_LEGENDARIES_IN_SOOTOPOLIS');
	if (reconcileSkyPillarAwakening()) changed = true;   // pillar >= 2 now: the trio leave the city
	return changed;
}
