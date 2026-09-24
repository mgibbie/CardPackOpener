// ow_state.js — the overworld's shared mutable state (Plans/MAIN_JS_SPLIT_PLAN.md, phase 2).
//
// These were top-level `let`s in main.js that many sections read AND reassign.
// ES module imports are read-only, so a module split out of main.js couldn't
// reassign an exported `let`. They live on one object instead, and any module
// that imports S reads and writes the same state.
//
// Initial values are still assigned in main.js at the spot each `let` used to
// be (tools/codemod_state.mjs did the rewrite), so evaluation order is unchanged;
// the fields here only document what exists.
export const S = {
	party: undefined,             // the player's party (array of mons), null until loaded
	loading: undefined,           // true while a map load is in flight
	menuUi: undefined,            // tappable rects rebuilt each canvas-menu draw: {id, x, y, w, h}
	menuHover: undefined,         // id of the hovered menu rect
	mpAccount: undefined,         // { username, friendCode, ... } once loaded
	friends: undefined,           // last friends-poll result
	visiting: undefined,          // { username, sprite } while roaming a friend's world
	mapScripts: undefined,        // the current map's transpiled scripts
	lastBattleOutcome: undefined, // B_OUTCOME_* of the last battle, for GetBattleOutcome
	trainerTeams: undefined,      // canonical TRAINER_id -> {class, party}
	mailWaiting: undefined,       // async matches waiting on ME (START-menu badge); written by ow_pvp.js
};
