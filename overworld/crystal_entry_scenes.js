// crystal_entry_scenes.js — pokecrystal's scene-0 ENTRY scenes, and what this port
// does with each one.
//
// A Crystal map lists its `scene_script`s positionally: scene N runs when the map
// loads with its scene var at N (engine/overworld/events.asm RunSceneScript). The
// transpiled `__map__.onFrame` tables carry every scene EXCEPT scene 0 — and a
// map's scene var starts at 0, so scene 0 is exactly the one a first visit plays.
// checkOnFrame also refuses a value-0 entry whose var was never written (a blank
// save must not cold-fire the intro chain). Between the two, every real scene-0
// set-piece in Johto was silently skipped.
//
// The DRAGON SHRINE is the one that broke the story: DragonShrineTakeTestScene is
// the elders' five-question test, Clair's arrival and the RISING BADGE ceremony,
// which arms Dragon's Den B1F's TM24 scene and, after it, the gift DRATINI. It
// never ran, so the elder went straight to the Dratini (bug:1794346972336,
// 2026-11-10, instinctgauntlet).
//
// Every non-trivial scene-0 script in the decomp is listed here with a decision.
// `run` entries play on map entry (and on every step while the scene is still 0,
// like the onFrame table) when `when()` holds; `skip` entries say why the port
// leaves them out. tests/crystal_entry_scenes_test.mjs fails if the shipped
// scripts grow a scene the table doesn't decide, so this cannot drift silently.
//
// `from`: the warp tiles the scene's own walk-in movement starts from. A save that
// reloads mid-scene stands somewhere else (the store persists while the GBA can't
// save during a script), so the player is put back on the first one before the
// scene replays, as the decomp's restart from the doorway would.
import * as Story from './events.js';

export const CRYSTAL_ENTRY_SCENES = {
	// ---- run ----
	DragonShrineTakeTestScene: {
		map: 'DragonShrine', var: 'VAR_SCENE_DragonShrine', value: 0, run: true,
		// pokecrystal can only reach the shrine after CLAIR: her win hides the
		// Blackthorn gramps who blocks Dragon's Den (EVENT_BLACKTHORN_CITY_GRAMPS_
		// BLOCKS_DRAGONS_DEN). Free roam can reach it earlier here, and the test ends
		// in Clair handing over her badge — so it waits for that win, as the game does.
		when: () => Story.getFlag('EVENT_BEAT_CLAIR'),
		from: [[4, 9], [5, 9]],
	},
	// ---- skip (with the reason) ----
	RuinsOfAlphKabutoChamberCheckWallScene: { skip: 'run natively by ow_story.js runChamberWallScene' },
	RuinsOfAlphOmanyteChamberCheckWallScene: { skip: 'run natively by ow_story.js runChamberWallScene' },
	RuinsOfAlphAerodactylChamberCheckWallScene: { skip: 'run natively by ow_story.js runChamberWallScene' },
	RuinsOfAlphHoOhChamberCheckWallScene: { skip: 'run natively by ow_story.js runChamberWallScene' },
	TinTower1FSuicuneBattleScene: { skip: 'the Tin Tower Suicune is a native legendary (ow_legendaries.js)' },
	HallOfFameEnterScene: { skip: "Lance's win closes the Johto run natively (ow_progression.js closeHallOfFame)" },
	ElmsLabMeetElmScene: { skip: "the port's own new-game open (region picker + starter) replaces the intro chain" },
	MrPokemonsHouseMeetMrPokemonScene: { skip: "intro errand; the port's new-game open skips the intro chain" },
	MountMoonRivalEncounterScene: { skip: 'the rival is native (rivals.js); the decomp ambush would double it' },
	BurnedTower1FMeetEusineScene: { skip: 'arms the decomp rival battle (scene 1) that rivals.js replaces' },
	EcruteakGymForcedToLeaveScene: { skip: 'Morty\'s gym is open in free roam (STORY_SEED.JOHTO notes EVENT_ECRUTEAK_GYM_GRAMPS)' },
	EcruteakPokecenter1FMeetBillScene: { skip: 'Bill switches on the TIME CAPSULE: link play, not ported' },
	Pokecenter2FCheckMysteryGiftScene: { skip: 'Mystery Gift: link play, not ported' },
	Route43GateRocketShakedownScene: { skip: 'a toll that charges every free-roam player until the Rocket HQ campaign beat (quest.js rocket_hq)' },
	TeamRocketBaseB3FLanceGetsPasswordScene: { skip: 'the Rocket HQ is the quest.js rocket_hq campaign beat' },
	BattleTower1FCheckStateScene: { skip: 'Crystal Battle Tower challenge flow (mobile/link), not ported' },
	BattleTowerBattleRoomEnterScene: { skip: 'Crystal Battle Tower challenge flow (mobile/link), not ported' },
	BattleTowerElevatorEnterScene: { skip: 'Crystal Battle Tower challenge flow (mobile/link), not ported' },
	BattleTowerHallwayEnterScene: { skip: 'Crystal Battle Tower challenge flow (mobile/link), not ported' },
	WillsRoomLockDoorScene: { skip: 'E4 walk-in + entrance lock: the rooms run on the authored battles (johto_e4_doors_test)' },
	KogasRoomLockDoorScene: { skip: 'E4 walk-in + entrance lock: the rooms run on the authored battles (johto_e4_doors_test)' },
	BrunosRoomLockDoorScene: { skip: 'E4 walk-in + entrance lock: the rooms run on the authored battles (johto_e4_doors_test)' },
	KarensRoomLockDoorScene: { skip: 'E4 walk-in + entrance lock: the rooms run on the authored battles (johto_e4_doors_test)' },
	LancesRoomLockDoorScene: { skip: 'E4 walk-in + entrance lock: the rooms run on the authored battles (johto_e4_doors_test)' },
};

// the entry scene due on `map` now, or null. `mapScripts` must hold its label.
export function dueEntryScene(map, mapScripts) {
	for (const [label, e] of Object.entries(CRYSTAL_ENTRY_SCENES)) {
		if (!e.run || e.map !== map || !mapScripts || !mapScripts[label]) continue;
		if (Story.getVar(e.var) !== e.value) continue;
		if (e.when && !e.when()) continue;
		return { label, ...e };
	}
	return null;
}
